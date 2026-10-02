package app.yueqi.open.overlay;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.AtomicFile;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "CompanionOverlay")
public class CompanionOverlayPlugin extends Plugin {
    private static final String PENDING_TURN_FILE = "overlay-pending-turn.json";
    private static final long ATTACH_WAIT_MS = 3500L;
    private static final long ATTACH_POLL_MS = 120L;
    private static volatile CompanionOverlayPlugin instance;
    private PluginCall pendingScreenCaptureCall;

    @Override
    public void load() {
        instance = this;
        String pending = readPendingTurn(getContext());
        if (!pending.isEmpty()) {
            try {
                notifyListeners("quickMessage", new JSObject(pending), true);
            } catch (Exception ignored) {
                // Ignore an incomplete payload left by an interrupted process.
            }
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        super.handleOnDestroy();
    }

    public static void emitModeChanged(String mode) {
        if (instance == null) return;
        JSObject data = new JSObject();
        data.put("mode", mode);
        instance.notifyListeners("modeChanged", data);
    }

    public static void emitOverlayStopped() {
        if (instance == null) return;
        instance.notifyListeners("overlayStopped", new JSObject());
    }

    public static void emitScreenCaptureResult(
            boolean ok,
            String code,
            String message,
            String imageDataUrl
    ) {
        CompanionOverlayPlugin plugin = instance;
        if (plugin == null || plugin.pendingScreenCaptureCall == null) return;
        PluginCall call = plugin.pendingScreenCaptureCall;
        plugin.pendingScreenCaptureCall = null;
        JSObject result = new JSObject();
        result.put("ok", ok);
        result.put("code", code == null ? "" : code);
        result.put("capability", "screen.capture");
        result.put("message", message == null ? "" : message);
        result.put("imageDataUrl", imageDataUrl == null ? "" : imageDataUrl);
        result.put("sessionEnded", true);
        call.setKeepAlive(false);
        call.resolve(result);
    }

    public static void emitQuickMessage(String text) {
        CompanionOverlayPlugin plugin = instance;
        if (plugin == null) return;
        JSObject data = new JSObject();
        data.put("text", text == null ? "" : text);
        data.put("source", "android_overlay");
        plugin.notifyListeners("quickMessage", data, true);
    }

    public static void emitQuickTurn(
            Context context,
            String text,
            String audioDataUrl,
            String imageDataUrl
    ) {
        JSObject data = new JSObject();
        data.put("text", text == null ? "" : text);
        data.put("audioDataUrl", audioDataUrl == null ? "" : audioDataUrl);
        data.put("imageDataUrl", imageDataUrl == null ? "" : imageDataUrl);
        data.put("source", "android_overlay");

        CompanionOverlayPlugin plugin = instance;
        if (plugin != null) {
            plugin.notifyListeners("quickMessage", data, true);
            return;
        }

        // A sticky service can be recreated before Capacitor's Activity. Keep
        // one bounded pending turn and deliver it when the plugin loads again.
        writePendingTurn(context, data.toString());
    }

    private static AtomicFile pendingTurnFile(Context context) {
        return new AtomicFile(new File(context.getCacheDir(), PENDING_TURN_FILE));
    }

    private static void writePendingTurn(Context context, String payload) {
        AtomicFile file = pendingTurnFile(context);
        FileOutputStream stream = null;
        try {
            stream = file.startWrite();
            stream.write(payload.getBytes(StandardCharsets.UTF_8));
            file.finishWrite(stream);
        } catch (Exception error) {
            if (stream != null) file.failWrite(stream);
        }
    }

    private static String readPendingTurn(Context context) {
        AtomicFile file = pendingTurnFile(context);
        try {
            byte[] content = file.readFully();
            file.delete();
            return new String(content, StandardCharsets.UTF_8);
        } catch (Exception ignored) {
            file.delete();
            return "";
        }
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject result = new JSObject();
        boolean granted = Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                || Settings.canDrawOverlays(getContext());
        result.put("granted", granted);
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        if (Settings.canDrawOverlays(getContext())) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        Intent intent = new Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName())
        );
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        JSObject result = new JSObject();
        result.put("granted", false);
        result.put("openedSettings", true);
        call.resolve(result);
    }

    @PluginMethod
    public void isRunning(PluginCall call) {
        JSObject result = new JSObject();
        boolean permissionGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                || Settings.canDrawOverlays(getContext());
        result.put("running", permissionGranted && OverlayService.isRunning());
        call.resolve(result);
    }

    @PluginMethod
    public void getCapabilities(PluginCall call) {
        boolean microphone = getContext().getPackageManager()
                .hasSystemFeature(PackageManager.FEATURE_MICROPHONE);
        boolean audioGranted = ContextCompat.checkSelfPermission(
                getContext(),
                Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED;
        JSObject result = new JSObject();
        result.put("overlay", true);
        result.put("text", true);
        result.put("audio", microphone && audioGranted);
        result.put("screenCapture", Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP);
        call.resolve(result);
    }

    @PluginMethod
    public void captureScreen(PluginCall call) {
        if (pendingScreenCaptureCall != null) {
            JSObject result = new JSObject();
            result.put("ok", false);
            result.put("code", "CAPTURE_ALREADY_ACTIVE");
            result.put("capability", "screen.capture");
            call.resolve(result);
            return;
        }
        OverlayService service = OverlayService.getInstance();
        if (service == null || !OverlayService.isRunning()) {
            JSObject result = new JSObject();
            result.put("ok", false);
            result.put("code", "SERVICE_NOT_RUNNING");
            result.put("capability", "screen.capture");
            call.resolve(result);
            return;
        }
        pendingScreenCaptureCall = call;
        call.setKeepAlive(true);
        if (!service.requestScreenCaptureSession()) {
            pendingScreenCaptureCall = null;
            call.setKeepAlive(false);
            JSObject result = new JSObject();
            result.put("ok", false);
            result.put("code", "CAPTURE_ALREADY_ACTIVE");
            result.put("capability", "screen.capture");
            call.resolve(result);
        }
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(getContext())) {
            call.reject("需要「显示在其他应用上层」权限", "OVERLAY_PERMISSION_DENIED");
            return;
        }
        requestPostNotificationsIfNeeded();
        String stateJson = call.getString("stateJson", "{}");
        OverlayService existing = OverlayService.getInstance();
        if (existing != null) {
            existing.updateStateJson(stateJson);
            if (OverlayService.isRunning()) {
                JSObject result = new JSObject();
                result.put("running", true);
                call.resolve(result);
                return;
            }
            waitUntilAttached(call);
            return;
        }
        try {
            OverlayService.start(getContext(), stateJson);
        } catch (RuntimeException error) {
            call.reject("系统暂时不允许启动悬浮前台服务", "OVERLAY_START_FAILED", error);
            return;
        }
        waitUntilAttached(call);
    }

    /**
     * Do not tell JS the overlay is live until the window is actually added.
     * A premature {@code running:true} hides the in-app float and leaves a blank desk.
     */
    private void waitUntilAttached(PluginCall call) {
        final Handler handler = new Handler(Looper.getMainLooper());
        final long deadline = SystemClock.uptimeMillis() + ATTACH_WAIT_MS;
        final Runnable poll = new Runnable() {
            @Override
            public void run() {
                boolean attached = OverlayService.isRunning();
                if (attached || SystemClock.uptimeMillis() >= deadline) {
                    JSObject result = new JSObject();
                    result.put("running", attached);
                    call.resolve(result);
                    return;
                }
                handler.postDelayed(this, ATTACH_POLL_MS);
            }
        };
        handler.post(poll);
    }

    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", requestIgnoreBatteryIfNeeded());
        call.resolve(result);
    }

    /**
     * Ask the system to ignore battery optimizations so OEM killers are less
     * likely to take the overlay after the user leaves Yueqi. No-ops when
     * already exempt, or when the OEM rejects the dialog intent.
     */
    private boolean requestIgnoreBatteryIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        Context context = getContext();
        if (context == null) return false;
        PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        String packageName = context.getPackageName();
        if (powerManager != null && powerManager.isIgnoringBatteryOptimizations(packageName)) {
            return true;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + packageName));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        } catch (Exception ignored) {
            return false;
        }
        return false;
    }

    private void requestPostNotificationsIfNeeded() {
        if (Build.VERSION.SDK_INT < 33) return;
        try {
            if (getActivity() != null) {
                getActivity().requestPermissions(
                        new String[]{"android.permission.POST_NOTIFICATIONS"},
                        7102
                );
            }
        } catch (Exception ignored) {
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        boolean wasRunning = OverlayService.isRunning();
        OverlayService.stop(getContext());
        if (!wasRunning) emitOverlayStopped();
        JSObject result = new JSObject();
        result.put("running", false);
        call.resolve(result);
    }

    @PluginMethod
    public void updateState(PluginCall call) {
        String stateJson = call.getString("stateJson", "{}");
        OverlayService service = OverlayService.getInstance();
        if (service != null) {
            service.updateStateJson(stateJson);
        } else {
            getContext().getSharedPreferences(OverlayService.PREFS, 0)
                    .edit()
                    .putString(OverlayService.KEY_STATE, stateJson)
                    .apply();
        }
        call.resolve();
    }

    @PluginMethod
    public void openOemSettings(PluginCall call) {
        String kind = call.getString("kind", "battery");
        Intent intent = null;
        String packageName = getContext().getPackageName();
        try {
            if ("autostart".equals(kind)) {
                intent = resolveAutostartIntent();
            } else if ("battery".equals(kind) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (requestIgnoreBatteryIfNeeded()) {
                    intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                } else {
                    call.resolve();
                    return;
                }
            } else {
                intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.parse("package:" + packageName));
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception e) {
            Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            fallback.setData(Uri.parse("package:" + packageName));
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(fallback);
        }
        call.resolve();
    }

    /**
     * Autostart whitelists are OEM-private screens with no public intent. Probe the
     * known component names and return the first one this ROM actually resolves;
     * callers fall back to the app-details page when nothing matches.
     */
    private Intent resolveAutostartIntent() {
        String[][] candidates = {
                {"com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"},
                {"com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"},
                {"com.huawei.systemmanager", "com.huawei.systemmanager.appcontrol.activity.StartupAppControlActivity"},
                {"com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"},
                {"com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"},
                {"com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"},
                {"com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"},
                {"com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"},
                {"com.letv.android.letvsafe", "com.letv.android.letvsafe.AutobootManageActivity"},
                {"com.asus.mobilemanager", "com.asus.mobilemanager.entry.FunctionActivity"},
        };
        PackageManager packageManager = getContext().getPackageManager();
        for (String[] candidate : candidates) {
            Intent intent = new Intent();
            intent.setClassName(candidate[0], candidate[1]);
            if (packageManager.resolveActivity(intent, 0) != null) return intent;
        }
        Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        fallback.setData(Uri.parse("package:" + getContext().getPackageName()));
        return fallback;
    }

    /**
     * PAIOS P3 stub: JS OverlayHostAdapter polls this for device_pending matrix.
     * Real OEM verification is tracked in docs/qa/paios/P3/DEVICE_PENDING.md.
     */
    @PluginMethod
    public void getHostBridgeStatus(PluginCall call) {
        JSObject result = new JSObject();
        boolean overlayGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                || Settings.canDrawOverlays(getContext());
        result.put("platform", "android-capacitor");
        result.put("devicePending", true);
        result.put("overlayGranted", overlayGranted);
        result.put("overlayRunning", overlayGranted && OverlayService.isRunning());
        result.put("mayExecuteAgent", false);
        result.put("screenCaptureRequiresConsent", true);
        result.put("foregroundServiceDeclared", true);
        call.resolve(result);
    }
}
