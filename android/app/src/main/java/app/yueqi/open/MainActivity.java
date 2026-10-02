package app.yueqi.open;

import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;

import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

import java.util.concurrent.atomic.AtomicBoolean;

import app.yueqi.open.capability.NativeCapabilityPlugin;
import app.yueqi.open.overlay.CompanionOverlayPlugin;
import app.yueqi.open.overlay.OverlayService;
import app.yueqi.open.secure.NativeSecureStorePlugin;

public class MainActivity extends BridgeActivity {
    private static final AtomicBoolean APP_FOREGROUND = new AtomicBoolean(false);

    public static boolean isAppForeground() {
        return APP_FOREGROUND.get();
    }
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CompanionOverlayPlugin.class);
        registerPlugin(NativeCapabilityPlugin.class);
        registerPlugin(NativeSecureStorePlugin.class);
        super.onCreate(savedInstanceState);
        // Release APK must not accept chrome://inspect. Debug builds still can.
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        // Draw the WebView behind the real Android system bars. Web content
        // consumes safe-area insets; JS changes icon contrast as screens change.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setStatusBarContrastEnforced(false);
            getWindow().setNavigationBarContrastEnforced(false);
        }
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
            getWindow(),
            getWindow().getDecorView()
        );
        controller.setAppearanceLightStatusBars(true);
        controller.setAppearanceLightNavigationBars(true);

        getWindow().getDecorView().post(() -> {
            WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
            bindKeyboardInsets();
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }

    @Override
    public void onStart() {
        super.onStart();
        APP_FOREGROUND.set(true);
        try {
            OverlayService.setHostAppForeground(true);
        } catch (RuntimeException ignored) {
            // Overlay process death must not take the activity down with it.
        }
    }

    @Override
    public void onStop() {
        try {
            OverlayService.setHostAppForeground(false);
        } catch (RuntimeException ignored) {
            // Same: host visibility is best effort.
        }
        APP_FOREGROUND.set(false);
        super.onStop();
    }

    /**
     * Edge-to-edge keeps the WebView full-screen, so the IME overlays HTML
     * instead of resizing it. Forward IME bottom inset to CSS via yueqi:ime.
     */
    private void bindKeyboardInsets() {
        View root = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            int imeBottom = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom;
            dispatchImeInset(Math.max(0, imeBottom));
            return insets;
        });
        ViewCompat.requestApplyInsets(root);
    }

    /**
     * Window insets are physical pixels; CSS consumes --vv-offset-bottom in CSS
     * pixels. Sending the raw inset shrank the shell by roughly density times the
     * real keyboard height, which collapsed the chat layout on focus.
     */
    private void dispatchImeInset(int imeBottomPx) {
        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        if (webView == null) return;
        float density = getResources().getDisplayMetrics().density;
        float fallbackDensity = density > 0 ? density : 1f;
        String js = "(function(){var raw=" + imeBottomPx
            + ",ratio=Number(window.devicePixelRatio)||" + fallbackDensity
            + ",bottom=Math.max(0,Math.round(raw/Math.max(.1,ratio)));"
            + "window.__yueqiImeBottom=bottom"
            + ";try{window.dispatchEvent(new CustomEvent('yueqi:ime',{detail:{bottom:"
            + "bottom,rawPx:raw}}));}catch(e){}})();";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }
}
