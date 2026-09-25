package app.yueqi.open;

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

import app.yueqi.open.secure.NativeSecureStorePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeSecureStorePlugin.class);
        super.onCreate(savedInstanceState);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

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

    private void bindKeyboardInsets() {
        View root = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            int imeBottom = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom;
            dispatchImeInset(Math.max(0, imeBottom));
            return insets;
        });
        ViewCompat.requestApplyInsets(root);
    }

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
