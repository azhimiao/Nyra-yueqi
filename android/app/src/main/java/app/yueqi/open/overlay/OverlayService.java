package app.yueqi.open.overlay;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.WindowMetrics;
import android.view.inputmethod.InputMethodManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.lang.ref.WeakReference;
import java.util.concurrent.atomic.AtomicBoolean;

import app.yueqi.open.MainActivity;
import app.yueqi.open.R;

/**
 * Foreground service hosting the transparent Android system overlay.
 * Window coordinates, clamping and focusability deliberately live here so the
 * JavaScript renderer cannot drift out of sync with WindowManager.
 */
public class OverlayService extends Service {
    public static final String ACTION_START = "app.yueqi.open.overlay.START";
    public static final String ACTION_STOP = "app.yueqi.open.overlay.STOP";
    public static final String ACTION_OPEN_APP = "app.yueqi.open.overlay.OPEN_APP";
    public static final String PREFS = "yueqi_overlay";
    public static final String KEY_STATE = "state_json";
    public static final String KEY_RUNNING = "running";
    public static final String KEY_X = "pos_x";
    public static final String KEY_Y = "pos_y";

    private static final String CHANNEL_ID = "yueqi_overlay";
    private static final int NOTIFICATION_ID = 7101;
    private static final String OVERLAY_URL =
            "https://appassets.androidplatform.net/public/overlay.html";
    private static final String ASSET_ORIGIN = "https://appassets.androidplatform.net";
    private static final int MAX_TURN_DATA_URL_CHARS = 6 * 1024 * 1024;
    private static final int MAX_ATTACH_ATTEMPTS = 3;
    private static final long ATTACH_RETRY_DELAY_MS = 750L;

    private static volatile WeakReference<OverlayService> instanceRef = new WeakReference<>(null);

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private WindowManager windowManager;
    private WebView webView;
    private WindowManager.LayoutParams layoutParams;
    private boolean added;
    private boolean windowAttached;
    private int restWidth;
    private int restHeight;
    private int restX;
    private int restY;
    private boolean parked;
    private final Runnable revealRunnable = this::revealOverlayWindow;
    private static final long[] REVEAL_DELAYS_MS = { 280L, 800L, 1600L };
    private boolean requestedStop;
    private int attachAttempts;
    private boolean attachRetryPending;
    private boolean nativeDragging;
    private boolean suppressedByHost;
    private final AtomicBoolean screenCaptureInProgress = new AtomicBoolean(false);
    private double dragPointerStartX;
    private double dragPointerStartY;
    private int dragWindowStartX;
    private int dragWindowStartY;

    public static boolean isRunning() {
        OverlayService service = instanceRef.get();
        // Parked (1×1 off-screen) still counts. That is how the ghost window
        // cannot eat hits while Yueqi is in the foreground, without tearing
        // the WebView off WindowManager so it never paints on the desktop.
        return service != null
                && service.webView != null
                && service.added
                && !service.requestedStop
                && service.hasOverlayPermission();
    }

    public static OverlayService getInstance() {
        return instanceRef.get();
    }

    /**
     * Park the system window while Yueqi itself is in the foreground so the
     * in-app orb is the only pet. Show it again when the user leaves the app.
     */
    public static void setHostAppForeground(boolean foreground) {
        OverlayService service = getInstance();
        if (service == null) return;
        service.mainHandler.post(() -> service.applyHostSuppression(foreground));
    }

    private void applyHostSuppression(boolean hostForeground) {
        suppressedByHost = hostForeground;
        applyOverlayWindowVisibility();
    }

    private void applyOverlayWindowVisibility() {
        if (webView == null || layoutParams == null) return;
        mainHandler.removeCallbacks(revealRunnable);
        boolean hide = suppressedByHost || screenCaptureInProgress.get();
        if (hide) {
            parkOverlayWindow();
            return;
        }
        // Immediate addView inside Activity.onStop is swallowed on several
        // OEMs that still treat this process as the foreground app. Retry.
        for (long delay : REVEAL_DELAYS_MS) {
            mainHandler.postDelayed(revealRunnable, delay);
        }
    }

    private void ensureOverlayAttached() {
        if (webView == null || layoutParams == null || windowManager == null) return;
        if (windowAttached) return;
        try {
            webView.setVisibility(View.VISIBLE);
            windowManager.addView(webView, layoutParams);
            windowAttached = true;
            added = true;
        } catch (SecurityException | WindowManager.BadTokenException ignored) {
            windowAttached = false;
        }
    }

    /**
     * Keep the WebView attached and compositing, but 1×1 off-screen and not
     * touchable. Detach / GONE left a blank desktop pet because Chromium never
     * painted, and the ghost window cannot eat hits this way either.
     */
    private void parkOverlayWindow() {
        ensureOverlayAttached();
        if (webView == null || layoutParams == null || !windowAttached) return;
        if (!parked && layoutParams.width > 8 && layoutParams.height > 8) {
            restWidth = layoutParams.width;
            restHeight = layoutParams.height;
            restX = layoutParams.x;
            restY = layoutParams.y;
        }
        parked = true;
        layoutParams.width = 1;
        layoutParams.height = 1;
        layoutParams.x = -10000;
        layoutParams.y = -10000;
        layoutParams.flags |= WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS;
        webView.setVisibility(View.VISIBLE);
        webView.setClickable(false);
        try {
            windowManager.updateViewLayout(webView, layoutParams);
        } catch (RuntimeException ignored) {
            // Host taps must stay free even if this tick fails.
        }
        webView.onResume();
        webView.resumeTimers();
    }

    private void revealOverlayWindow() {
        if (requestedStop || suppressedByHost || screenCaptureInProgress.get()) return;
        if (webView == null || layoutParams == null) return;
        ensureOverlayAttached();
        if (!windowAttached) return;
        if (parked || layoutParams.width <= 8 || layoutParams.height <= 8) {
            if (restWidth > 8 && restHeight > 8) {
                layoutParams.width = restWidth;
                layoutParams.height = restHeight;
                layoutParams.x = restX;
                layoutParams.y = restY;
            } else {
                layoutParams.width = dp(170);
                layoutParams.height = dp(250);
                int[] position = clampPosition(
                        layoutParams.x <= -1000 ? dp(24) : layoutParams.x,
                        layoutParams.y <= -1000 ? dp(180) : layoutParams.y
                );
                layoutParams.x = position[0];
                layoutParams.y = position[1];
            }
        }
        parked = false;
        layoutParams.flags &= ~WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE;
        layoutParams.flags |= WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS;
        webView.setVisibility(View.VISIBLE);
        webView.setClickable(true);
        webView.onResume();
        webView.resumeTimers();
        try {
            windowManager.updateViewLayout(webView, layoutParams);
        } catch (RuntimeException ignored) {
            windowAttached = false;
            ensureOverlayAttached();
        }
        String href = webView.getUrl();
        if (href == null || href.isEmpty() || "about:blank".equals(href)) {
            webView.loadUrl(OVERLAY_URL);
        }
        pushStateToWeb(readState());
        pushWindowMetricsToWeb();
        webView.evaluateJavascript(
                "try{window.dispatchEvent(new Event('resize'));}catch(e){}",
                null
        );
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instanceRef = new WeakReference<>(this);
        createNotificationChannel();
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        if (!promoteForeground()) {
            requestedStop = true;
            markNotRunning();
            stopSelf();
            return;
        }

        if (!hasOverlayPermission()) {
            markNotRunning();
            requestedStop = true;
            stopForeground(true);
            stopSelf();
            return;
        }
        ensureAttachedOrRetry();
    }

    /**
     * Attach the overlay window, retrying a few times before giving up.
     *
     * A restart after a system kill (or a boot restore) can hit WindowManager before
     * it will accept our token. Dying on the first failure would make START_STICKY
     * pointless, so transient failures get retried instead.
     */
    private boolean ensureAttachedOrRetry() {
        if (added) return true;
        if (!hasOverlayPermission()) {
            stopSelfSafely();
            return false;
        }
        if (attachOverlay()) {
            attachAttempts = 0;
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(KEY_RUNNING, true).apply();
            return true;
        }
        scheduleAttachRetry();
        return false;
    }

    private void scheduleAttachRetry() {
        if (requestedStop || attachRetryPending) return;
        if (attachAttempts >= MAX_ATTACH_ATTEMPTS) {
            // Keep KEY_RUNNING so boot / swipe-away / unlock can retry.
            // Stopping this instance must not look like the user turned the pet off.
            requestedStop = true;
            stopForeground(true);
            stopSelf();
            return;
        }
        attachAttempts++;
        attachRetryPending = true;
        mainHandler.postDelayed(() -> {
            attachRetryPending = false;
            if (requestedStop || added) return;
            if (ensureAttachedOrRetry()) updateStateJson(readState());
        }, ATTACH_RETRY_DELAY_MS * attachAttempts);
    }

    private boolean promoteForeground() {
        try {
            Notification notification = buildNotification();
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(
                        NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                );
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            return true;
        } catch (RuntimeException error) {
            return false;
        }
    }

    /** Elevate the already-running overlay service before consuming a projection token. */
    public boolean beginMediaProjectionCapture() {
        if (!screenCaptureInProgress.get() || !ensureReady()) return false;
        try {
            Notification notification = buildNotification();
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(
                        NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                                | ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
                );
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                        NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
                );
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            return true;
        } catch (RuntimeException error) {
            return false;
        }
    }

    @Override
    public int onStartCommand(@Nullable Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelfSafely();
            return START_NOT_STICKY;
        }
        if (!hasOverlayPermission()) {
            stopSelfSafely();
            return START_NOT_STICKY;
        }
        if (!added && !ensureAttachedOrRetry()) {
            // Window not up yet; keep the persisted state so the retry can apply it.
            if (intent != null) {
                String pendingState = intent.getStringExtra("stateJson");
                if (pendingState != null) persistState(pendingState);
            }
            return requestedStop ? START_NOT_STICKY : START_STICKY;
        }

        if (intent != null) {
            if (ACTION_OPEN_APP.equals(intent.getAction())) openMainApp();
            if (intent.hasExtra("stateJson")) {
                String nextState = intent.getStringExtra("stateJson");
                updateStateJson(nextState);
            }
        } else {
            // START_STICKY restoration: reapply persisted state only after the
            // permission and overlay attachment have both been verified.
            updateStateJson(readState());
        }
        promoteForeground();
        return requestedStop ? START_NOT_STICKY : START_STICKY;
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if (webView != null) {
            webView.post(() -> {
                if (parked || suppressedByHost) return;
                clampAndApplyPosition(true);
                pushWindowMetricsToWeb();
            });
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        if (requestedStop) return;
        restoreIfNeeded(getApplicationContext());
    }

    @Override
    public void onDestroy() {
        mainHandler.removeCallbacksAndMessages(null);
        removeOverlay();
        boolean stillWanted = getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(KEY_RUNNING, false);
        // Only tell JS the user turned the pet off. A killed / retried service
        // must not flip the in-app switch or start a second foreground service.
        if (requestedStop && !stillWanted) {
            markNotRunning();
            CompanionOverlayPlugin.emitOverlayStopped();
        }
        if (instanceRef.get() == this) instanceRef.clear();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    public void updateStateJson(String stateJson) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            mainHandler.post(() -> updateStateJson(stateJson));
            return;
        }
        if (!ensurePermissionOrStop() || stateJson == null) return;
        persistState(stateJson);
        syncInputModeFromState(stateJson);
        pushStateToWeb(stateJson);
    }

    public void setTouchable(boolean touchable) {
        if (!ensureReady()) return;
        if (touchable) {
            layoutParams.flags &= ~WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE;
        } else {
            layoutParams.flags |= WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE;
        }
        applyLayoutOrStop();
    }

    private void setInputMode(boolean enabled) {
        if (!ensureReady()) return;
        if (enabled) {
            layoutParams.flags &= ~WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;
        } else {
            layoutParams.flags |= WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;
            webView.clearFocus();
            InputMethodManager input = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
            if (input != null) input.hideSoftInputFromWindow(webView.getWindowToken(), 0);
        }
        if (applyLayoutOrStop() && enabled) webView.requestFocus();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private boolean attachOverlay() {
        if (webView != null) return added;

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        webView.setBackgroundColor(Color.TRANSPARENT);
        // Hardware layers on a WindowManager WebView crash some OEM GPUs
        // when the host activity is backgrounded and tapped open again.
        webView.setLayerType(View.LAYER_TYPE_NONE, null);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        webView.removeJavascriptInterface("searchBoxJavaBridge_");
        webView.removeJavascriptInterface("accessibility");
        webView.removeJavascriptInterface("accessibilityTraversal");
        webView.addJavascriptInterface(new Bridge(), "YueqiOverlayBridge");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                webView.post(() -> handleWebPermissionRequest(request));
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(
                    WebView view,
                    WebResourceRequest request
            ) {
                String href = request.getUrl() == null ? "" : request.getUrl().toString();
                if (isPassthroughUrl(href)) return null;
                Uri uri = rewriteOverlayAssetUri(request.getUrl());
                if (uri == null || !isTrustedLocalUrl(uri.toString())) return blockedResponse();
                return assetLoader.shouldInterceptRequest(uri);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = rewriteOverlayAssetUri(request.getUrl());
                return uri == null || !isTrustedLocalUrl(uri.toString());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri uri = rewriteOverlayAssetUri(Uri.parse(url));
                return uri == null || !isTrustedLocalUrl(uri.toString());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!isTrustedLocalUrl(url)) return;
                pushStateToWeb(readState());
                pushWindowMetricsToWeb();
            }
        });

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        layoutParams = new WindowManager.LayoutParams(
                dp(170),
                dp(250),
                type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT
        );
        layoutParams.gravity = Gravity.TOP | Gravity.START;
        layoutParams.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;
        layoutParams.x = prefs.getInt(KEY_X, dp(24));
        layoutParams.y = prefs.getInt(KEY_Y, dp(180));

        boolean hostForeground = MainActivity.isAppForeground();
        if (hostForeground) {
            restWidth = layoutParams.width;
            restHeight = layoutParams.height;
            restX = layoutParams.x;
            restY = layoutParams.y;
            parked = true;
            suppressedByHost = true;
            layoutParams.width = 1;
            layoutParams.height = 1;
            layoutParams.x = -10000;
            layoutParams.y = -10000;
            layoutParams.flags |= WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                    | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS;
        }
        try {
            windowManager.addView(webView, layoutParams);
            added = true;
            windowAttached = true;
        } catch (SecurityException | WindowManager.BadTokenException error) {
            added = false;
            windowAttached = false;
            webView.destroy();
            webView = null;
            return false;
        }

        if (!parked) clampAndApplyPosition(true);
        syncInputModeFromState(readState());
        webView.onResume();
        webView.resumeTimers();
        webView.loadUrl(OVERLAY_URL);
        applyHostSuppression(hostForeground);
        return true;
    }

    private void handleWebPermissionRequest(PermissionRequest request) {
        if (request == null || !isTrustedLocalOrigin(String.valueOf(request.getOrigin()))) {
            if (request != null) request.deny();
            return;
        }
        boolean audioOnly = request.getResources().length > 0;
        for (String resource : request.getResources()) {
            if (!PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                audioOnly = false;
                break;
            }
        }
        if (audioOnly && hasAudioCapability()) {
            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        } else {
            request.deny();
        }
    }

    /**
     * Capacitor copies {@code www/} to {@code android_asset/public/}.
     * Overlay JS still fetches origin-absolute {@code /assets/...} (and other
     * app paths). Remap anything not already under {@code /public/} onto that
     * tree before {@link WebViewAssetLoader} resolves the file.
     */
    @Nullable
    static Uri rewriteOverlayAssetUri(@Nullable Uri uri) {
        if (uri == null) return null;
        if (!"https".equals(uri.getScheme())) return uri;
        if (!"appassets.androidplatform.net".equals(uri.getHost())) return uri;
        String path = uri.getEncodedPath();
        if (path == null || path.isEmpty() || "/".equals(path)) return uri;
        if ("/public".equals(path) || path.startsWith("/public/")) return uri;
        return uri.buildUpon().encodedPath("/public" + path).build();
    }

    private boolean isPassthroughUrl(String url) {
        return url != null && (
                url.startsWith("data:")
                        || url.startsWith("blob:")
                        || url.startsWith("about:")
        );
    }

    private boolean isTrustedLocalUrl(String url) {
        return url != null && (
                url.equals(OVERLAY_URL)
                        || url.startsWith(ASSET_ORIGIN + "/")
        );
    }

    private boolean isTrustedLocalOrigin(String origin) {
        return "https://appassets.androidplatform.net".equals(origin)
                || "https://appassets.androidplatform.net/".equals(origin);
    }

    private WebResourceResponse blockedResponse() {
        return new WebResourceResponse(
                "text/plain",
                "utf-8",
                new ByteArrayInputStream(new byte[0])
        );
    }

    private void removeOverlay() {
        if (webView != null && windowAttached) {
            try {
                windowManager.removeView(webView);
            } catch (RuntimeException ignored) {
                // The system may already have detached the token after permission revocation.
            }
        }
        windowAttached = false;
        added = false;
        if (webView != null) {
            webView.removeJavascriptInterface("YueqiOverlayBridge");
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
    }

    private void persistState(String stateJson) {
        if (stateJson == null) return;
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_STATE, stateJson).apply();
    }

    private String readState() {
        return getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_STATE, "{}");
    }

    private void syncInputModeFromState(String stateJson) {
        boolean chat = false;
        try {
            chat = "chat".equals(new JSONObject(stateJson).optString("mode", "collapsed"));
        } catch (Exception ignored) {
            // Malformed external state falls back to the non-focusable mode.
        }
        setInputMode(chat);
    }

    private void pushStateToWeb(String stateJson) {
        if (webView == null || stateJson == null) return;
        final String script = "window.__yueqiApplyOverlayState && window.__yueqiApplyOverlayState("
                + JSONObject.quote(stateJson) + ");";
        webView.post(() -> {
            if (webView != null) webView.evaluateJavascript(script, null);
        });
    }

    private void pushWindowMetricsToWeb() {
        if (webView == null || layoutParams == null) return;
        final String metrics = buildWindowMetricsJson();
        final String script = "window.__yueqiNativeWindowChanged && "
                + "window.__yueqiNativeWindowChanged(" + JSONObject.quote(metrics) + ");";
        webView.post(() -> {
            if (webView != null) webView.evaluateJavascript(script, null);
        });
    }

    private void beginNativeDrag(double screenXCss, double screenYCss) {
        if (!ensureReady()) return;
        nativeDragging = true;
        dragPointerStartX = screenXCss;
        dragPointerStartY = screenYCss;
        dragWindowStartX = layoutParams.x;
        dragWindowStartY = layoutParams.y;
    }

    private void dragNativeTo(double screenXCss, double screenYCss) {
        if (!nativeDragging || !ensureReady()) return;
        float density = getResources().getDisplayMetrics().density;
        int targetX = dragWindowStartX + (int) Math.round((screenXCss - dragPointerStartX) * density);
        int targetY = dragWindowStartY + (int) Math.round((screenYCss - dragPointerStartY) * density);
        moveOverlay(targetX, targetY, false);
    }

    private void endNativeDrag(boolean snap) {
        if (!nativeDragging) return;
        nativeDragging = false;
        if (snap) {
            snapOverlayToEdge();
        } else {
            clampAndApplyPosition(true);
        }
        pushWindowMetricsToWeb();
    }

    private void moveOverlay(int x, int y, boolean persist) {
        if (!ensureReady() || parked) return;
        int[] position = clampPosition(x, y);
        layoutParams.x = position[0];
        layoutParams.y = position[1];
        if (!applyLayoutOrStop()) return;
        if (persist) persistPosition();
    }

    private void snapOverlayToEdge() {
        if (!ensureReady()) return;
        Rect bounds = getUsableDisplayBounds();
        int width = resolveOverlayWidth(bounds);
        int minX = bounds.left;
        int maxX = Math.max(minX, bounds.right - width);
        int centerX = layoutParams.x + width / 2;
        int targetX = centerX <= bounds.centerX() ? minX : maxX;
        moveOverlay(targetX, layoutParams.y, true);
    }

    private void resizeOverlay(int widthPx, int heightPx) {
        if (!ensureReady() || parked || suppressedByHost) return;
        Rect bounds = getUsableDisplayBounds();
        layoutParams.width = widthPx > 0
                ? clamp(widthPx, dp(64), Math.max(dp(64), bounds.width()))
                : WindowManager.LayoutParams.WRAP_CONTENT;
        layoutParams.height = heightPx > 0
                ? clamp(heightPx, dp(64), Math.max(dp(64), bounds.height()))
                : WindowManager.LayoutParams.WRAP_CONTENT;
        clampAndApplyPosition(true);
        pushWindowMetricsToWeb();
    }

    private void clampAndApplyPosition(boolean persist) {
        if (!ensureReady() || parked) return;
        int[] position = clampPosition(layoutParams.x, layoutParams.y);
        layoutParams.x = position[0];
        layoutParams.y = position[1];
        if (!applyLayoutOrStop()) return;
        if (persist) persistPosition();
    }

    private int[] clampPosition(int x, int y) {
        Rect bounds = getUsableDisplayBounds();
        int width = resolveOverlayWidth(bounds);
        int height = resolveOverlayHeight(bounds);
        int minX = bounds.left;
        int minY = bounds.top;
        int maxX = Math.max(minX, bounds.right - width);
        int maxY = Math.max(minY, bounds.bottom - height);
        return new int[]{clamp(x, minX, maxX), clamp(y, minY, maxY)};
    }

    private int resolveOverlayWidth(Rect bounds) {
        int width = layoutParams != null && layoutParams.width > 0 ? layoutParams.width : 0;
        if (width <= 0 && webView != null) width = webView.getWidth();
        if (width <= 0) width = dp(170);
        return Math.min(width, bounds.width());
    }

    private int resolveOverlayHeight(Rect bounds) {
        int height = layoutParams != null && layoutParams.height > 0 ? layoutParams.height : 0;
        if (height <= 0 && webView != null) height = webView.getHeight();
        if (height <= 0) height = dp(250);
        return Math.min(height, bounds.height());
    }

    private Rect getUsableDisplayBounds() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowMetrics metrics = windowManager.getCurrentWindowMetrics();
            Rect raw = new Rect(metrics.getBounds());
            Insets insets = metrics.getWindowInsets().getInsetsIgnoringVisibility(
                    WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout()
            );
            Rect safe = new Rect(
                    raw.left + insets.left,
                    raw.top + insets.top,
                    raw.right - insets.right,
                    raw.bottom - insets.bottom
            );
            if (safe.width() > 0 && safe.height() > 0) return safe;
            return raw;
        }
        DisplayMetrics metrics = new DisplayMetrics();
        windowManager.getDefaultDisplay().getMetrics(metrics);
        return new Rect(0, 0, metrics.widthPixels, metrics.heightPixels);
    }

    private String buildWindowMetricsJson() {
        JSONObject json = new JSONObject();
        Rect bounds = getUsableDisplayBounds();
        try {
            json.put("x", layoutParams == null ? 0 : layoutParams.x);
            json.put("y", layoutParams == null ? 0 : layoutParams.y);
            json.put("width", resolveOverlayWidth(bounds));
            json.put("height", resolveOverlayHeight(bounds));
            json.put("minX", bounds.left);
            json.put("minY", bounds.top);
            json.put("maxX", bounds.right);
            json.put("maxY", bounds.bottom);
            json.put("density", getResources().getDisplayMetrics().density);
        } catch (Exception ignored) {
            return "{}";
        }
        return json.toString();
    }

    private String buildCapabilitiesJson() {
        JSONObject json = new JSONObject();
        try {
            json.put("text", true);
            json.put("audio", hasAudioCapability());
            json.put("screenCapture", Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP);
            if (!hasAudioCapability()) {
                json.put("audioReason", "请先在月栖 App 内授予麦克风权限，再重新开启悬浮陪伴。");
            }
        } catch (Exception ignored) {
            return "{\"text\":true,\"audio\":false,\"screenCapture\":true}";
        }
        return json.toString();
    }

    public boolean requestScreenCaptureSession() {
        if (!screenCaptureInProgress.compareAndSet(false, true)) return false;
        if (webView == null || !added || !hasOverlayPermission()) {
            screenCaptureInProgress.set(false);
            return false;
        }
        webView.post(() -> {
            if (!ensureReady()) {
                handleScreenCaptureResult(
                        false,
                        "OVERLAY_UNAVAILABLE",
                        "悬浮陪伴已停止，请重新开启后再试。",
                        ""
                );
                return;
            }
            applyOverlayWindowVisibility();
            setInputMode(false);
            try {
                startActivity(ScreenCaptureActivity.createIntent(this));
            } catch (RuntimeException error) {
                handleScreenCaptureResult(
                        false,
                        "CAPTURE_ACTIVITY_FAILED",
                        "无法打开系统看屏授权。",
                        ""
                );
            }
        });
        return true;
    }

    public static void completeScreenCapture(
            Context context,
            boolean ok,
            String code,
            String message,
            String imageDataUrl
    ) {
        CompanionOverlayPlugin.emitScreenCaptureResult(ok, code, message, imageDataUrl);
        OverlayService service = getInstance();
        if (service == null || service.webView == null) {
            if (ok && imageDataUrl != null && !imageDataUrl.isEmpty()) {
                CompanionOverlayPlugin.emitQuickTurn(
                        context,
                        "看看我现在的屏幕，先说你最注意到的东西，再像平时一样跟我聊。",
                        "",
                        imageDataUrl
                );
            }
            return;
        }
        service.webView.post(() -> service.handleScreenCaptureResult(
                ok,
                code,
                message,
                imageDataUrl
        ));
    }

    private void handleScreenCaptureResult(
            boolean ok,
            String code,
            String message,
            String imageDataUrl
    ) {
        screenCaptureInProgress.set(false);
        try {
            promoteForeground();
        } catch (RuntimeException ignored) {
            // The service may already be stopping; the UI callback still needs to settle.
        }
        if (webView != null) {
            applyOverlayWindowVisibility();
            syncInputModeFromState(readState());
        }

        boolean delivered = ok
                && imageDataUrl != null
                && imageDataUrl.startsWith("data:image/jpeg;base64,")
                && imageDataUrl.length() <= MAX_TURN_DATA_URL_CHARS;
        if (delivered) {
            CompanionOverlayPlugin.emitQuickTurn(
                    this,
                    "看看我现在的屏幕，先说你最注意到的东西，再像平时一样跟我聊。",
                    "",
                    imageDataUrl
            );
        }

        JSONObject result = new JSONObject();
        try {
            result.put("ok", delivered);
            result.put("sent", delivered);
            result.put("code", delivered ? "" : sanitizeText(code));
            result.put(
                    "message",
                    delivered ? "看到了，我正在想..." : sanitizeText(message)
            );
        } catch (Exception ignored) {
            // JSONObject with primitive values is not expected to fail.
        }
        pushScreenCaptureResultToWeb(result.toString());
    }

    private void pushScreenCaptureResultToWeb(String resultJson) {
        if (webView == null) return;
        final String script = "window.__yueqiNativeCaptureResult && "
                + "window.__yueqiNativeCaptureResult(" + JSONObject.quote(resultJson) + ");";
        webView.evaluateJavascript(script, null);
    }

    private void emitTurnFromWeb(String payloadJson) {
        if (payloadJson == null || payloadJson.length() > MAX_TURN_DATA_URL_CHARS + 4096) return;
        try {
            JSONObject payload = new JSONObject(payloadJson);
            String text = sanitizeText(payload.optString("text", ""));
            String audio = sanitizeDataUrl(payload.optString("audioDataUrl", ""), "data:audio/");
            String image = sanitizeDataUrl(payload.optString("imageDataUrl", ""), "data:image/");
            if (text.isEmpty() && audio.isEmpty() && image.isEmpty()) return;
            CompanionOverlayPlugin.emitQuickTurn(this, text, audio, image);
        } catch (Exception ignored) {
            // Treat bridge input as untrusted and silently discard malformed payloads.
        }
    }

    private String sanitizeText(String value) {
        String clean = value == null ? "" : value.trim();
        return clean.length() > 1200 ? clean.substring(0, 1200) : clean;
    }

    private String sanitizeDataUrl(String value, String requiredPrefix) {
        if (value == null || value.isEmpty() || value.length() > MAX_TURN_DATA_URL_CHARS) return "";
        if (!value.startsWith(requiredPrefix)) return "";
        int separator = value.indexOf(";base64,");
        if (separator < requiredPrefix.length() || separator > 180) return "";
        return value;
    }

    private boolean hasAudioCapability() {
        return getPackageManager().hasSystemFeature(PackageManager.FEATURE_MICROPHONE)
                && ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasOverlayPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this);
    }

    private boolean ensurePermissionOrStop() {
        if (hasOverlayPermission()) return true;
        stopSelfSafely();
        return false;
    }

    private boolean ensureReady() {
        return layoutParams != null && webView != null && added && ensurePermissionOrStop();
    }

    private boolean applyLayoutOrStop() {
        if (!ensurePermissionOrStop() || webView == null || layoutParams == null || !added) return false;
        if (!windowAttached) return true;
        try {
            windowManager.updateViewLayout(webView, layoutParams);
            return true;
        } catch (SecurityException | IllegalArgumentException error) {
            stopSelfSafely();
            return false;
        }
    }

    private void persistPosition() {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putInt(KEY_X, layoutParams.x)
                .putInt(KEY_Y, layoutParams.y)
                .apply();
    }

    private void markNotRunning() {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(KEY_RUNNING, false).apply();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private void openMainApp() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP
                        | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
        );
        intent.putExtra("openPanel", "chat");
        startActivity(intent);
    }

    private void stopSelfSafely() {
        if (requestedStop) return;
        requestedStop = true;
        markNotRunning();
        stopForeground(true);
        stopSelf();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "月栖悬浮陪伴",
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("悬浮角色显示在其他应用上方时保持运行");
        channel.setShowBadge(false);
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPending = PendingIntent.getActivity(
                this,
                1,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | pendingImmutable()
        );

        Intent stopIntent = new Intent(this, OverlayService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPending = PendingIntent.getService(
                this,
                2,
                stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | pendingImmutable()
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("月栖悬浮陪伴中")
                .setContentText("角色显示在其他应用上方 · 点此返回或关闭")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true)
                .setContentIntent(openPending)
                .addAction(0, "返回月栖", openPending)
                .addAction(0, "关闭悬浮", stopPending)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    private int pendingImmutable() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? PendingIntent.FLAG_IMMUTABLE
                : 0;
    }

    public class Bridge {
        @JavascriptInterface
        public String getState() {
            return readState();
        }

        @JavascriptInterface
        public String getWindowMetrics() {
            return buildWindowMetricsJson();
        }

        @JavascriptInterface
        public String getCapabilities() {
            return buildCapabilitiesJson();
        }

        @JavascriptInterface
        public boolean captureScreen() {
            return requestScreenCaptureSession();
        }

        @JavascriptInterface
        public void beginDrag(double screenX, double screenY) {
            if (webView != null) webView.post(() -> beginNativeDrag(screenX, screenY));
        }

        @JavascriptInterface
        public void dragTo(double screenX, double screenY) {
            if (webView != null) webView.post(() -> dragNativeTo(screenX, screenY));
        }

        @JavascriptInterface
        public void endDrag(boolean snap) {
            if (webView != null) webView.post(() -> endNativeDrag(snap));
        }

        @JavascriptInterface
        public void moveTo(int x, int y) {
            if (webView != null) webView.post(() -> moveOverlay(x, y, true));
        }

        @JavascriptInterface
        public void snapToEdge() {
            if (webView != null) webView.post(() -> {
                snapOverlayToEdge();
                pushWindowMetricsToWeb();
            });
        }

        @JavascriptInterface
        public void resize(int width, int height) {
            if (webView != null) webView.post(() -> resizeOverlay(width, height));
        }

        @JavascriptInterface
        public void openApp() {
            if (webView != null) webView.post(() -> openMainApp());
        }

        @JavascriptInterface
        public void closeOverlay() {
            if (webView != null) webView.post(() -> stopSelfSafely());
        }

        @JavascriptInterface
        public void setMode(String requestedMode) {
            String mode = "chat".equals(requestedMode) || "bubble".equals(requestedMode)
                    ? requestedMode
                    : "collapsed";
            if (webView == null) return;
            webView.post(() -> {
                try {
                    JSONObject json = new JSONObject(readState());
                    json.put("mode", mode);
                    persistState(json.toString());
                    setInputMode("chat".equals(mode));
                    CompanionOverlayPlugin.emitModeChanged(mode);
                } catch (Exception ignored) {
                    setInputMode(false);
                }
            });
        }

        @JavascriptInterface
        public void setInputMode(boolean enabled) {
            if (webView != null) webView.post(() -> OverlayService.this.setInputMode(enabled));
        }

        @JavascriptInterface
        public void sendText(String text) {
            try {
                JSONObject payload = new JSONObject();
                payload.put("text", text == null ? "" : text);
                String encoded = payload.toString();
                if (webView != null) webView.post(() -> emitTurnFromWeb(encoded));
            } catch (Exception ignored) {
                // No-op for malformed/unrepresentable input.
            }
        }

        @JavascriptInterface
        public void sendTurn(String payloadJson) {
            if (webView != null) webView.post(() -> emitTurnFromWeb(payloadJson));
        }

        @JavascriptInterface
        public float getDensity() {
            return getResources().getDisplayMetrics().density;
        }
    }

    /**
     * Restart the overlay when the user still wants it out — boot, unlock,
     * or the task being swiped away. Never pops permission / battery dialogs.
     */
    public static void restoreIfNeeded(Context context) {
        if (context == null) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(KEY_RUNNING, false)) return;
        if (isRunning()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
            return;
        }
        try {
            start(context, prefs.getString(KEY_STATE, "{}"));
        } catch (RuntimeException ignored) {
            // ForegroundServiceStartNotAllowedException on OEMs that block restores.
        }
    }

    public static void start(Context context, String stateJson) {
        OverlayService running = getInstance();
        // A live instance is already promoting or attaching. A second startForegroundService
        // here is the resume-from-recents crash on several OEMs — even when the window
        // is not yet marked added.
        if (running != null) {
            if (stateJson != null) {
                running.mainHandler.post(() -> running.updateStateJson(stateJson));
            }
            return;
        }
        SharedPreferences.Editor editor = context.getSharedPreferences(PREFS, MODE_PRIVATE).edit();
        editor.putBoolean(KEY_RUNNING, true);
        if (stateJson != null) editor.putString(KEY_STATE, stateJson);
        editor.apply();
        Intent intent = new Intent(context, OverlayService.class);
        intent.setAction(ACTION_START);
        if (stateJson != null) intent.putExtra("stateJson", stateJson);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (RuntimeException ignored) {
            // ForegroundServiceStartNotAllowedException must not take the activity down.
        }
    }

    public static void stop(Context context) {
        OverlayService service = instanceRef.get();
        if (service != null) {
            service.stopSelfSafely();
        } else {
            context.getSharedPreferences(PREFS, MODE_PRIVATE)
                    .edit()
                    .putBoolean(KEY_RUNNING, false)
                    .apply();
            context.stopService(new Intent(context, OverlayService.class));
        }
    }
}
