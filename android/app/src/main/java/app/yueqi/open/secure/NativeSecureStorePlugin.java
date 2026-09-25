package app.yueqi.open.secure;

import android.content.SharedPreferences;
import android.os.Build;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

@CapacitorPlugin(name = "NativeSecureStore")
public class NativeSecureStorePlugin extends Plugin {
    private static final String PREFS_NAME = "yueqi_open_secure_store";
    private static final int MIN_API = Build.VERSION_CODES.M;

    private SharedPreferences prefs;
    private String unavailableReason;

    @Override
    public void load() {
        if (Build.VERSION.SDK_INT < MIN_API) {
            unavailableReason = "API_BELOW_23";
            return;
        }
        try {
            MasterKey masterKey = new MasterKey.Builder(getContext())
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build();
            prefs = EncryptedSharedPreferences.create(
                    getContext(),
                    PREFS_NAME,
                    masterKey,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            );
        } catch (Exception error) {
            prefs = null;
            unavailableReason = error.getMessage() != null ? error.getMessage() : "KEYSTORE_UNAVAILABLE";
        }
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        boolean available = prefs != null;
        result.put("available", available);
        result.put("backend", available ? "keystore" : "unavailable");
        if (!available && unavailableReason != null) {
            result.put("reason", unavailableReason);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void get(PluginCall call) {
        if (prefs == null) {
            call.reject("SECURE_STORE_UNAVAILABLE", unavailableReason);
            return;
        }
        String key = call.getString("key");
        if (key == null || key.isEmpty()) {
            call.reject("KEY_REQUIRED");
            return;
        }
        JSObject result = new JSObject();
        if (!prefs.contains(key)) {
            result.put("value", JSONObject.NULL);
        } else {
            result.put("value", prefs.getString(key, null));
        }
        call.resolve(result);
    }

    @PluginMethod
    public void set(PluginCall call) {
        if (prefs == null) {
            call.reject("SECURE_STORE_UNAVAILABLE", unavailableReason);
            return;
        }
        String key = call.getString("key");
        if (key == null || key.isEmpty()) {
            call.reject("KEY_REQUIRED");
            return;
        }
        String value = call.getString("value");
        SharedPreferences.Editor editor = prefs.edit();
        if (value == null || value.isEmpty()) {
            editor.remove(key);
        } else {
            editor.putString(key, value);
        }
        if (!editor.commit()) {
            call.reject("SECURE_STORE_WRITE_FAILED");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void remove(PluginCall call) {
        if (prefs == null) {
            call.reject("SECURE_STORE_UNAVAILABLE", unavailableReason);
            return;
        }
        String key = call.getString("key");
        if (key == null || key.isEmpty()) {
            call.reject("KEY_REQUIRED");
            return;
        }
        if (!prefs.edit().remove(key).commit()) {
            call.reject("SECURE_STORE_WRITE_FAILED");
            return;
        }
        call.resolve();
    }
}
