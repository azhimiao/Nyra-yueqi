package app.yueqi.open.capability;

import android.Manifest;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.CalendarContract;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.TimeZone;

/**
 * OS source-of-truth bridge for privacy-sensitive device capabilities.
 *
 * Internal/agent permission is intentionally not handled here. Java reports and
 * requests Android state; the Web CapabilityPermissionBroker combines it with
 * explicit product consent before a tool can execute.
 */
@CapacitorPlugin(
        name = "NativeCapability",
        permissions = {
                @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }),
                @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }),
                @Permission(alias = "location", strings = {
                        Manifest.permission.ACCESS_COARSE_LOCATION,
                        Manifest.permission.ACCESS_FINE_LOCATION
                }),
                @Permission(alias = "backgroundLocation", strings = {
                        Manifest.permission.ACCESS_BACKGROUND_LOCATION
                }),
                @Permission(alias = "calendarRead", strings = { Manifest.permission.READ_CALENDAR }),
                @Permission(alias = "calendarWrite", strings = { Manifest.permission.WRITE_CALENDAR }),
                @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
        }
)
public class NativeCapabilityPlugin extends Plugin {
    private static final long MAX_AUDIO_BYTES = 12L * 1024L * 1024L;
    private static final int MAX_IMAGE_EDGE = 1600;
    private static final int MAX_EVENT_LIMIT = 200;

    private MediaRecorder recorder;
    private File recordingFile;
    private File cameraFile;

    @PluginMethod
    public void getDeviceRegistrationId(PluginCall call) {
        String androidId = Settings.Secure.getString(
                getContext().getContentResolver(),
                Settings.Secure.ANDROID_ID
        );
        JSObject result = new JSObject();
        result.put("platform", "android");
        result.put("platformDeviceId", androidId == null ? "" : androidId);
        call.resolve(result);
    }

    @PluginMethod
    public void getCapabilityStatus(PluginCall call) {
        call.resolve(buildCapabilityState(call.getString("capability", "")));
    }

    @PluginMethod
    public void getAllCapabilityStates(PluginCall call) {
        String[] capabilities = {
                "microphone.capture", "voice.input", "camera.capture", "camera.preview",
                "location.current", "location.background", "notification.send",
                "calendar.read", "calendar.write"
        };
        JSObject result = new JSObject();
        for (String capability : capabilities) {
            result.put(capability, buildCapabilityState(capability));
        }
        call.resolve(result);
    }

    @PluginMethod
    public void requestCapability(PluginCall call) {
        String capability = call.getString("capability", "");
        String alias = permissionAlias(capability);
        if ("location.background".equals(capability) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            openAppDetails();
            JSObject state = buildCapabilityState(capability);
            state.put("needsSettings", true);
            state.put("reason", "BACKGROUND_LOCATION_SETTINGS_REQUIRED");
            call.resolve(state);
            return;
        }
        if (alias.isEmpty()) {
            call.resolve(unavailable(capability, "NATIVE_CAPABILITY_UNSUPPORTED"));
            return;
        }
        JSObject current = buildCapabilityState(capability);
        if (current.optBoolean("granted", false)) {
            call.resolve(current);
            return;
        }
        getContext().getSharedPreferences("yueqi_capability_permissions", Context.MODE_PRIVATE)
                .edit()
                .putBoolean("requested_" + alias, true)
                .apply();
        requestPermissionForAlias(alias, call, "permissionResult");
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        if (call == null) return;
        call.resolve(buildCapabilityState(call.getString("capability", "")));
    }

    @PluginMethod
    public void openSystemPermissionSettings(PluginCall call) {
        openAppDetails();
        JSObject result = new JSObject();
        result.put("opened", true);
        result.put("capability", call.getString("capability", ""));
        call.resolve(result);
    }

    @PluginMethod
    public void startMicrophoneCapture(PluginCall call) {
        if (!has(Manifest.permission.RECORD_AUDIO)) {
            reject(call, "PERMISSION_REQUIRED", "microphone.capture", "麦克风权限未开启");
            return;
        }
        if (recorder != null) {
            reject(call, "CAPTURE_ALREADY_ACTIVE", "microphone.capture", "录音已在进行");
            return;
        }
        try {
            recordingFile = File.createTempFile("yueqi-voice-", ".m4a", getContext().getCacheDir());
            recorder = new MediaRecorder();
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioEncodingBitRate(96_000);
            recorder.setAudioSamplingRate(44_100);
            recorder.setOutputFile(recordingFile.getAbsolutePath());
            recorder.prepare();
            recorder.start();
            JSObject result = new JSObject();
            result.put("ok", true);
            result.put("status", "ACTIVE");
            result.put("capability", "microphone.capture");
            call.resolve(result);
        } catch (Exception error) {
            releaseRecorder(true);
            reject(call, "NATIVE_ERROR", "microphone.capture", "无法开始录音");
        }
    }

    @PluginMethod
    public void stopMicrophoneCapture(PluginCall call) {
        if (recorder == null || recordingFile == null) {
            reject(call, "CAPTURE_NOT_ACTIVE", "microphone.capture", "当前没有录音");
            return;
        }
        try {
            recorder.stop();
            releaseRecorder(false);
            if (!recordingFile.exists() || recordingFile.length() <= 0 || recordingFile.length() > MAX_AUDIO_BYTES) {
                throw new IOException("invalid audio size");
            }
            byte[] bytes = readBounded(recordingFile, MAX_AUDIO_BYTES);
            JSObject result = new JSObject();
            result.put("ok", true);
            result.put("mimeType", "audio/mp4");
            result.put("size", bytes.length);
            result.put("dataUrl", "data:audio/mp4;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP));
            recordingFile.delete();
            recordingFile = null;
            call.resolve(result);
        } catch (Exception error) {
            releaseRecorder(true);
            reject(call, "NATIVE_ERROR", "microphone.capture", "录音结束失败");
        }
    }

    @PluginMethod
    public void cancelMicrophoneCapture(PluginCall call) {
        boolean active = recorder != null;
        if (recorder != null) {
            try { recorder.stop(); } catch (RuntimeException ignored) {}
        }
        releaseRecorder(true);
        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("cancelled", active);
        call.resolve(result);
    }

    @PluginMethod
    public void captureCamera(PluginCall call) {
        if (!has(Manifest.permission.CAMERA)) {
            reject(call, "PERMISSION_REQUIRED", "camera.capture", "摄像头权限未开启");
            return;
        }
        try {
            cameraFile = File.createTempFile("yueqi-camera-", ".jpg", getContext().getCacheDir());
            Uri output = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    cameraFile
            );
            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, output);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            if (intent.resolveActivity(getContext().getPackageManager()) == null) {
                reject(call, "DEVICE_UNSUPPORTED", "camera.capture", "设备没有可用相机");
                return;
            }
            startActivityForResult(call, intent, "cameraResult");
        } catch (IOException error) {
            reject(call, "NATIVE_ERROR", "camera.capture", "无法创建临时照片");
        }
    }

    @ActivityCallback
    private void cameraResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || cameraFile == null || !cameraFile.exists()) {
            if (cameraFile != null) cameraFile.delete();
            cameraFile = null;
            reject(call, "USER_DENIED", "camera.capture", "拍照已取消");
            return;
        }
        try {
            Bitmap source = BitmapFactory.decodeFile(cameraFile.getAbsolutePath());
            if (source == null) throw new IOException("decode failed");
            Bitmap bounded = scaleBounded(source, MAX_IMAGE_EDGE);
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            bounded.compress(Bitmap.CompressFormat.JPEG, 78, output);
            if (bounded != source) bounded.recycle();
            source.recycle();
            byte[] bytes = output.toByteArray();
            JSObject payload = new JSObject();
            payload.put("ok", true);
            payload.put("mimeType", "image/jpeg");
            payload.put("size", bytes.length);
            payload.put("dataUrl", "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP));
            cameraFile.delete();
            cameraFile = null;
            call.resolve(payload);
        } catch (Exception error) {
            cameraFile.delete();
            cameraFile = null;
            reject(call, "NATIVE_ERROR", "camera.capture", "照片处理失败");
        }
    }

    @PluginMethod
    public void getCurrentLocation(PluginCall call) {
        boolean coarse = has(Manifest.permission.ACCESS_COARSE_LOCATION);
        boolean fine = has(Manifest.permission.ACCESS_FINE_LOCATION);
        if (!coarse && !fine) {
            reject(call, "PERMISSION_REQUIRED", "location.current", "定位权限未开启");
            return;
        }
        LocationManager manager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        if (manager == null) {
            reject(call, "DEVICE_UNSUPPORTED", "location.current", "设备定位服务不可用");
            return;
        }
        String provider = fine && manager.isProviderEnabled(LocationManager.GPS_PROVIDER)
                ? LocationManager.GPS_PROVIDER
                : LocationManager.NETWORK_PROVIDER;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                manager.getCurrentLocation(provider, null, ContextCompat.getMainExecutor(getContext()), location -> {
                    if (location == null) {
                        reject(call, "NATIVE_ERROR", "location.current", "暂时无法获取位置");
                    } else {
                        call.resolve(locationPayload(location, fine));
                    }
                });
                return;
            }
            Location cached = manager.getLastKnownLocation(provider);
            if (cached != null && System.currentTimeMillis() - cached.getTime() < 300_000) {
                call.resolve(locationPayload(cached, fine));
                return;
            }
            manager.requestSingleUpdate(provider, new LocationListener() {
                @Override public void onLocationChanged(Location location) {
                    call.resolve(locationPayload(location, fine));
                }
                @Override public void onStatusChanged(String p, int status, Bundle extras) {}
                @Override public void onProviderEnabled(String p) {}
                @Override public void onProviderDisabled(String p) {
                    reject(call, "NATIVE_ERROR", "location.current", "定位服务已关闭");
                }
            }, getActivity().getMainLooper());
        } catch (SecurityException error) {
            reject(call, "SYSTEM_REVOKED", "location.current", "定位权限已被系统撤销");
        } catch (RuntimeException error) {
            reject(call, "NATIVE_ERROR", "location.current", "暂时无法获取位置");
        }
    }

    @PluginMethod
    public void listCalendars(PluginCall call) {
        if (!requireCalendar(call, false)) return;
        JSArray rows = new JSArray();
        String[] projection = {
                CalendarContract.Calendars._ID,
                CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
                CalendarContract.Calendars.ACCOUNT_NAME,
                CalendarContract.Calendars.VISIBLE,
                CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL
        };
        try (Cursor cursor = resolver().query(
                CalendarContract.Calendars.CONTENT_URI,
                projection,
                CalendarContract.Calendars.VISIBLE + "=1",
                null,
                CalendarContract.Calendars.CALENDAR_DISPLAY_NAME + " ASC"
        )) {
            if (cursor != null) while (cursor.moveToNext()) {
                JSObject row = new JSObject();
                row.put("id", cursor.getLong(0));
                row.put("name", cursor.getString(1));
                row.put("account", cursor.getString(2));
                row.put("visible", cursor.getInt(3) == 1);
                row.put("accessLevel", cursor.getInt(4));
                rows.put(row);
            }
            JSObject result = new JSObject();
            result.put("ok", true);
            result.put("calendars", rows);
            call.resolve(result);
        } catch (Exception error) {
            reject(call, "NATIVE_ERROR", "calendar.read", "读取系统日历失败");
        }
    }

    @PluginMethod
    public void listCalendarEvents(PluginCall call) {
        if (!requireCalendar(call, false)) return;
        long from = call.getLong("from", System.currentTimeMillis() - 86_400_000L);
        long to = call.getLong("to", System.currentTimeMillis() + 30L * 86_400_000L);
        int limit = Math.max(1, Math.min(MAX_EVENT_LIMIT, call.getInt("limit", 100)));
        JSArray rows = new JSArray();
        String[] projection = eventProjection();
        String selection = CalendarContract.Events.DTSTART + "<? AND ("
                + CalendarContract.Events.DTEND + ">? OR "
                + CalendarContract.Events.DTEND + " IS NULL)";
        String[] args = { String.valueOf(to), String.valueOf(from) };
        try (Cursor cursor = resolver().query(
                CalendarContract.Events.CONTENT_URI,
                projection,
                selection,
                args,
                CalendarContract.Events.DTSTART + " ASC"
        )) {
            if (cursor != null) while (cursor.moveToNext() && rows.length() < limit) {
                rows.put(eventPayload(cursor));
            }
            JSObject result = new JSObject();
            result.put("ok", true);
            result.put("events", rows);
            call.resolve(result);
        } catch (Exception error) {
            reject(call, "NATIVE_ERROR", "calendar.read", "读取系统日程失败");
        }
    }

    @PluginMethod
    public void getCalendarEvent(PluginCall call) {
        if (!requireCalendar(call, false)) return;
        Long id = call.getLong("eventId");
        if (id == null) {
            reject(call, "INVALID_INPUT", "calendar.read", "缺少 eventId");
            return;
        }
        try (Cursor cursor = resolver().query(
                ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, id),
                eventProjection(),
                null,
                null,
                null
        )) {
            if (cursor == null || !cursor.moveToFirst()) {
                reject(call, "NOT_FOUND", "calendar.read", "日程不存在");
                return;
            }
            JSObject result = new JSObject();
            result.put("ok", true);
            result.put("event", eventPayload(cursor));
            call.resolve(result);
        } catch (Exception error) {
            reject(call, "NATIVE_ERROR", "calendar.read", "读取系统日程失败");
        }
    }

    @PluginMethod
    public void createCalendarEvent(PluginCall call) {
        if (!requireCalendar(call, true)) return;
        try {
            ContentValues values = eventValues(call, true);
            Uri created = resolver().insert(CalendarContract.Events.CONTENT_URI, values);
            if (created == null) throw new IOException("empty provider result");
            JSObject result = new JSObject();
            result.put("ok", true);
            result.put("eventId", ContentUris.parseId(created));
            call.resolve(result);
        } catch (IllegalArgumentException error) {
            reject(call, "INVALID_INPUT", "calendar.write", error.getMessage());
        } catch (Exception error) {
            reject(call, "NATIVE_ERROR", "calendar.write", "创建系统日程失败");
        }
    }

    @PluginMethod
    public void updateCalendarEvent(PluginCall call) {
        if (!requireCalendar(call, true)) return;
        Long id = call.getLong("eventId");
        if (id == null) {
            reject(call, "INVALID_INPUT", "calendar.write", "缺少 eventId");
            return;
        }
        try {
            int changed = resolver().update(
                    ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, id),
                    eventValues(call, false),
                    null,
                    null
            );
            JSObject result = new JSObject();
            result.put("ok", changed > 0);
            result.put("eventId", id);
            result.put("changed", changed);
            call.resolve(result);
        } catch (Exception error) {
            reject(call, "NATIVE_ERROR", "calendar.write", "更新系统日程失败");
        }
    }

    @PluginMethod
    public void deleteCalendarEvent(PluginCall call) {
        if (!requireCalendar(call, true)) return;
        Long id = call.getLong("eventId");
        if (id == null) {
            reject(call, "INVALID_INPUT", "calendar.write", "缺少 eventId");
            return;
        }
        try {
            int changed = resolver().delete(
                    ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, id),
                    null,
                    null
            );
            JSObject result = new JSObject();
            result.put("ok", changed > 0);
            result.put("eventId", id);
            result.put("changed", changed);
            call.resolve(result);
        } catch (Exception error) {
            reject(call, "NATIVE_ERROR", "calendar.write", "删除系统日程失败");
        }
    }

    private JSObject buildCapabilityState(String capability) {
        if ("location.current".equals(capability)) return locationState(capability, false);
        if ("location.background".equals(capability)) return locationState(capability, true);
        String permission = androidPermission(capability);
        if (permission.isEmpty()) return unavailable(capability, "NATIVE_CAPABILITY_UNSUPPORTED");
        if (Build.VERSION.SDK_INT < 33 && Manifest.permission.POST_NOTIFICATIONS.equals(permission)) {
            return granted(capability, permission, "");
        }
        boolean granted = has(permission);
        JSObject state = new JSObject();
        state.put("capability", capability);
        state.put("nativePermission", permission);
        state.put("granted", granted);
        state.put("sessionScoped", false);
        if (granted) {
            state.put("status", "OS_GRANTED");
            state.put("canAskAgain", true);
            state.put("needsSettings", false);
            state.put("reason", "OS_GRANTED");
            return state;
        }
        boolean rationale = getActivity() != null
                && ActivityCompat.shouldShowRequestPermissionRationale(getActivity(), permission);
        boolean requested = getContext()
                .getSharedPreferences("yueqi_capability_permissions", Context.MODE_PRIVATE)
                .getBoolean("requested_" + permissionAlias(capability), false);
        boolean permanent = requested && !rationale;
        state.put("status", permanent ? "OS_DENIED_PERMANENTLY" : rationale ? "OS_DENIED" : "OS_NOT_REQUESTED");
        state.put("canAskAgain", !permanent);
        state.put("needsSettings", permanent);
        state.put("reason", permanent ? "DENIED_PERMANENTLY" : rationale ? "USER_DENIED" : "OS_NOT_REQUESTED");
        return state;
    }

    private JSObject locationState(String capability, boolean background) {
        String permission = background
                ? Manifest.permission.ACCESS_BACKGROUND_LOCATION
                : Manifest.permission.ACCESS_COARSE_LOCATION;
        boolean fine = has(Manifest.permission.ACCESS_FINE_LOCATION);
        boolean coarse = has(Manifest.permission.ACCESS_COARSE_LOCATION);
        boolean granted = background ? has(permission) : (coarse || fine);
        String alias = background ? "backgroundLocation" : "location";
        boolean requested = getContext()
                .getSharedPreferences("yueqi_capability_permissions", Context.MODE_PRIVATE)
                .getBoolean("requested_" + alias, false);
        boolean rationale = getActivity() != null
                && ActivityCompat.shouldShowRequestPermissionRationale(getActivity(), permission);
        boolean settingsRequired = background && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !granted;
        boolean permanent = !granted && requested && !rationale && !settingsRequired;
        JSObject state = new JSObject();
        state.put("capability", capability);
        state.put("nativePermission", permission);
        state.put("granted", granted);
        state.put("accuracy", fine ? "precise" : coarse ? "approximate" : "");
        state.put("status", granted
                ? "OS_GRANTED"
                : settingsRequired
                        ? "SPECIAL_PERMISSION_REQUIRED"
                        : permanent ? "OS_DENIED_PERMANENTLY" : rationale ? "OS_DENIED" : "OS_NOT_REQUESTED");
        state.put("canAskAgain", !settingsRequired && !permanent);
        state.put("needsSettings", settingsRequired || permanent);
        state.put("reason", granted
                ? "OS_GRANTED"
                : settingsRequired ? "BACKGROUND_LOCATION_SETTINGS_REQUIRED"
                : permanent ? "DENIED_PERMANENTLY" : rationale ? "USER_DENIED" : "OS_NOT_REQUESTED");
        return state;
    }

    private String permissionAlias(String capability) {
        switch (capability) {
            case "microphone.capture":
            case "voice.input": return "microphone";
            case "camera.capture":
            case "camera.preview": return "camera";
            case "location.current": return "location";
            case "location.background": return "backgroundLocation";
            case "calendar.read": return "calendarRead";
            case "calendar.write": return "calendarWrite";
            case "notification.send": return "notifications";
            default: return "";
        }
    }

    private String androidPermission(String capability) {
        switch (capability) {
            case "microphone.capture":
            case "voice.input": return Manifest.permission.RECORD_AUDIO;
            case "camera.capture":
            case "camera.preview": return Manifest.permission.CAMERA;
            case "calendar.read": return Manifest.permission.READ_CALENDAR;
            case "calendar.write": return Manifest.permission.WRITE_CALENDAR;
            case "notification.send": return Manifest.permission.POST_NOTIFICATIONS;
            default: return "";
        }
    }

    private boolean has(String permission) {
        return ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED;
    }

    private JSObject granted(String capability, String permission, String accuracy) {
        JSObject state = new JSObject();
        state.put("capability", capability);
        state.put("status", "OS_GRANTED");
        state.put("granted", true);
        state.put("nativePermission", permission);
        state.put("canAskAgain", true);
        state.put("needsSettings", false);
        state.put("sessionScoped", false);
        state.put("reason", "OS_GRANTED");
        if (!accuracy.isEmpty()) state.put("accuracy", accuracy);
        return state;
    }

    private JSObject unavailable(String capability, String reason) {
        JSObject state = new JSObject();
        state.put("capability", capability);
        state.put("status", "UNAVAILABLE_ON_DEVICE");
        state.put("granted", false);
        state.put("canAskAgain", false);
        state.put("needsSettings", false);
        state.put("sessionScoped", false);
        state.put("reason", reason);
        return state;
    }

    private void openAppDetails() {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }

    private JSObject locationPayload(Location location, boolean precise) {
        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("latitude", location.getLatitude());
        result.put("longitude", location.getLongitude());
        result.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : -1);
        result.put("timestamp", location.getTime());
        result.put("source", location.getProvider() == null ? "android_location" : location.getProvider());
        result.put("precision", precise ? "precise" : "approximate");
        return result;
    }

    private void releaseRecorder(boolean deleteFile) {
        if (recorder != null) {
            try { recorder.reset(); } catch (RuntimeException ignored) {}
            recorder.release();
            recorder = null;
        }
        if (deleteFile && recordingFile != null) {
            recordingFile.delete();
            recordingFile = null;
        }
    }

    private byte[] readBounded(File file, long max) throws IOException {
        if (file.length() > max) throw new IOException("file too large");
        byte[] bytes = new byte[(int) file.length()];
        try (FileInputStream input = new FileInputStream(file)) {
            int offset = 0;
            while (offset < bytes.length) {
                int count = input.read(bytes, offset, bytes.length - offset);
                if (count < 0) break;
                offset += count;
            }
            if (offset != bytes.length) throw new IOException("short read");
        }
        return bytes;
    }

    private Bitmap scaleBounded(Bitmap source, int maxEdge) {
        int width = source.getWidth();
        int height = source.getHeight();
        float scale = Math.min(1f, maxEdge / (float) Math.max(width, height));
        if (scale >= 1f) return source;
        return Bitmap.createScaledBitmap(
                source,
                Math.max(1, Math.round(width * scale)),
                Math.max(1, Math.round(height * scale)),
                true
        );
    }

    private ContentResolver resolver() {
        return getContext().getContentResolver();
    }

    private boolean requireCalendar(PluginCall call, boolean write) {
        String permission = write ? Manifest.permission.WRITE_CALENDAR : Manifest.permission.READ_CALENDAR;
        if (has(permission)) return true;
        reject(call, "PERMISSION_REQUIRED", write ? "calendar.write" : "calendar.read", "系统日历权限未开启");
        return false;
    }

    private String[] eventProjection() {
        return new String[] {
                CalendarContract.Events._ID,
                CalendarContract.Events.CALENDAR_ID,
                CalendarContract.Events.TITLE,
                CalendarContract.Events.DESCRIPTION,
                CalendarContract.Events.EVENT_LOCATION,
                CalendarContract.Events.DTSTART,
                CalendarContract.Events.DTEND,
                CalendarContract.Events.ALL_DAY,
                CalendarContract.Events.EVENT_TIMEZONE
        };
    }

    private JSObject eventPayload(Cursor cursor) {
        JSObject row = new JSObject();
        row.put("id", cursor.getLong(0));
        row.put("calendarId", cursor.getLong(1));
        row.put("title", cursor.getString(2));
        row.put("description", cursor.getString(3));
        row.put("location", cursor.getString(4));
        row.put("start", cursor.getLong(5));
        row.put("end", cursor.isNull(6) ? null : cursor.getLong(6));
        row.put("allDay", cursor.getInt(7) == 1);
        row.put("timezone", cursor.getString(8));
        return row;
    }

    private ContentValues eventValues(PluginCall call, boolean create) {
        ContentValues values = new ContentValues();
        if (create) {
            Long calendarId = call.getLong("calendarId");
            Long start = call.getLong("start");
            String title = call.getString("title", "").trim();
            if (calendarId == null || start == null || title.isEmpty()) {
                throw new IllegalArgumentException("calendarId、title、start 为必填");
            }
            values.put(CalendarContract.Events.CALENDAR_ID, calendarId);
            values.put(CalendarContract.Events.DTSTART, start);
            values.put(CalendarContract.Events.TITLE, title);
            values.put(
                    CalendarContract.Events.EVENT_TIMEZONE,
                    call.getString("timezone", TimeZone.getDefault().getID())
            );
        } else {
            if (call.hasOption("calendarId")) values.put(CalendarContract.Events.CALENDAR_ID, call.getLong("calendarId"));
            if (call.hasOption("start")) values.put(CalendarContract.Events.DTSTART, call.getLong("start"));
            if (call.hasOption("title")) values.put(CalendarContract.Events.TITLE, call.getString("title"));
            if (call.hasOption("timezone")) values.put(CalendarContract.Events.EVENT_TIMEZONE, call.getString("timezone"));
        }
        if (call.hasOption("end")) values.put(CalendarContract.Events.DTEND, call.getLong("end"));
        if (call.hasOption("description")) values.put(CalendarContract.Events.DESCRIPTION, call.getString("description"));
        if (call.hasOption("location")) values.put(CalendarContract.Events.EVENT_LOCATION, call.getString("location"));
        if (call.hasOption("allDay")) values.put(CalendarContract.Events.ALL_DAY, call.getBoolean("allDay", false) ? 1 : 0);
        return values;
    }

    private void reject(PluginCall call, String code, String capability, String message) {
        JSObject details = new JSObject();
        details.put("ok", false);
        details.put("code", code);
        details.put("capability", capability);
        details.put("reason", code);
        call.reject(message, code, null, details);
    }

    @Override
    protected void handleOnDestroy() {
        releaseRecorder(true);
        if (cameraFile != null) {
            cameraFile.delete();
            cameraFile = null;
        }
        super.handleOnDestroy();
    }
}
