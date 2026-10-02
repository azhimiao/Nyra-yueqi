package app.yueqi.open.overlay;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.WindowManager;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Requests fresh user consent and captures exactly one bounded screen frame.
 * The activity stays visible (with a transparent window) for the full session,
 * while OverlayService supplies the Android 10+ mediaProjection FGS type.
 */
public class ScreenCaptureActivity extends Activity {
    private static final int REQUEST_CAPTURE = 7110;
    private static final int MAX_CAPTURE_EDGE = 1280;
    private static final int MAX_JPEG_BYTES = 2 * 1024 * 1024;
    private static final long CAPTURE_TIMEOUT_MS = 8_000L;

    private final AtomicBoolean completed = new AtomicBoolean(false);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private MediaProjectionManager projectionManager;
    private MediaProjection projection;
    private MediaProjection.Callback projectionCallback;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private HandlerThread captureThread;
    private Handler captureHandler;
    private boolean releasing;

    private final Runnable timeout = () -> completeFailure(
            "CAPTURE_TIMEOUT",
            "截图等待超时，请再试一次。"
    );

    public static Intent createIntent(Context context) {
        Intent intent = new Intent(context, ScreenCaptureActivity.class);
        intent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_NO_ANIMATION
                        | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
        );
        return intent;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        overridePendingTransition(0, 0);

        if (savedInstanceState != null) {
            completeFailure("CAPTURE_RESTARTED", "截图授权已失效，请重新点击看屏。" );
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            completeFailure("CAPTURE_UNSUPPORTED", "当前 Android 版本不支持看屏。" );
            return;
        }

        projectionManager = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        if (projectionManager == null) {
            completeFailure("CAPTURE_UNAVAILABLE", "系统看屏服务暂不可用。" );
            return;
        }

        try {
            startActivityForResult(projectionManager.createScreenCaptureIntent(), REQUEST_CAPTURE);
        } catch (RuntimeException error) {
            completeFailure("CAPTURE_CONSENT_FAILED", "无法打开系统看屏授权。" );
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_CAPTURE) return;
        if (resultCode != RESULT_OK || data == null) {
            completeFailure("CAPTURE_DENIED", "已取消看屏。" );
            return;
        }

        OverlayService service = OverlayService.getInstance();
        if (service == null || !service.beginMediaProjectionCapture()) {
            completeFailure("OVERLAY_UNAVAILABLE", "悬浮陪伴已停止，请重新开启后再试。" );
            return;
        }

        try {
            projection = projectionManager.getMediaProjection(resultCode, data);
            if (projection == null) {
                completeFailure("CAPTURE_TOKEN_EMPTY", "系统没有返回有效的看屏授权。" );
                return;
            }
            startSingleFrameCapture();
        } catch (SecurityException error) {
            completeFailure("CAPTURE_SECURITY", "系统拒绝了本次看屏，请重新授权。" );
        } catch (RuntimeException error) {
            completeFailure("CAPTURE_START_FAILED", "这次没有看到屏幕，请再试一次。" );
        }
    }

    private void startSingleFrameCapture() {
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        Rect bounds;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowManager manager = (WindowManager) getSystemService(WINDOW_SERVICE);
            bounds = manager == null
                    ? new Rect(0, 0, metrics.widthPixels, metrics.heightPixels)
                    : manager.getMaximumWindowMetrics().getBounds();
        } else {
            bounds = new Rect(0, 0, metrics.widthPixels, metrics.heightPixels);
        }

        int sourceWidth = Math.max(1, bounds.width());
        int sourceHeight = Math.max(1, bounds.height());
        float scale = Math.min(1f, MAX_CAPTURE_EDGE / (float) Math.max(sourceWidth, sourceHeight));
        int width = makeEven(Math.max(2, Math.round(sourceWidth * scale)));
        int height = makeEven(Math.max(2, Math.round(sourceHeight * scale)));
        int densityDpi = Math.max(DisplayMetrics.DENSITY_LOW, Math.round(metrics.densityDpi * scale));

        captureThread = new HandlerThread("YueqiScreenCapture");
        captureThread.start();
        captureHandler = new Handler(captureThread.getLooper());
        imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2);
        imageReader.setOnImageAvailableListener(this::consumeFrame, captureHandler);

        projectionCallback = new MediaProjection.Callback() {
            @Override
            public void onStop() {
                if (!releasing) {
                    completeFailure("CAPTURE_STOPPED", "系统已停止本次看屏。" );
                }
            }
        };
        projection.registerCallback(projectionCallback, mainHandler);
        virtualDisplay = projection.createVirtualDisplay(
                "YueqiSingleFrame",
                width,
                height,
                densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader.getSurface(),
                null,
                captureHandler
        );
        if (virtualDisplay == null) {
            completeFailure("CAPTURE_DISPLAY_FAILED", "无法创建本次看屏画面。" );
            return;
        }
        mainHandler.postDelayed(timeout, CAPTURE_TIMEOUT_MS);
    }

    private int makeEven(int value) {
        return (value & 1) == 0 ? value : value - 1;
    }

    private void consumeFrame(ImageReader reader) {
        Image image = null;
        try {
            image = reader.acquireLatestImage();
            if (image == null || image.getPlanes().length == 0) return;

            Image.Plane plane = image.getPlanes()[0];
            ByteBuffer buffer = plane.getBuffer();
            int pixelStride = plane.getPixelStride();
            int rowStride = plane.getRowStride();
            int rowPadding = rowStride - pixelStride * image.getWidth();
            int paddedWidth = image.getWidth() + Math.max(0, rowPadding / pixelStride);

            Bitmap padded = Bitmap.createBitmap(
                    paddedWidth,
                    image.getHeight(),
                    Bitmap.Config.ARGB_8888
            );
            padded.copyPixelsFromBuffer(buffer);
            Bitmap frame = Bitmap.createBitmap(padded, 0, 0, image.getWidth(), image.getHeight());
            if (frame != padded) padded.recycle();

            byte[] jpeg = compressBounded(frame);
            frame.recycle();
            if (jpeg.length == 0 || jpeg.length > MAX_JPEG_BYTES) {
                completeFailure("CAPTURE_TOO_LARGE", "截图数据过大，请再试一次。" );
                return;
            }
            String dataUrl = "data:image/jpeg;base64," + Base64.encodeToString(jpeg, Base64.NO_WRAP);
            completeSuccess(dataUrl);
        } catch (RuntimeException error) {
            completeFailure("CAPTURE_ENCODE_FAILED", "截图处理失败，请再试一次。" );
        } finally {
            if (image != null) image.close();
        }
    }

    private byte[] compressBounded(Bitmap bitmap) {
        int[] qualities = {72, 60, 48};
        byte[] result = new byte[0];
        for (int quality : qualities) {
            ByteArrayOutputStream output = new ByteArrayOutputStream(512 * 1024);
            if (!bitmap.compress(Bitmap.CompressFormat.JPEG, quality, output)) return new byte[0];
            result = output.toByteArray();
            if (result.length <= MAX_JPEG_BYTES) return result;
        }
        return result;
    }

    private void completeSuccess(String imageDataUrl) {
        complete(true, "", "", imageDataUrl);
    }

    private void completeFailure(String code, String message) {
        complete(false, code, message, "");
    }

    private void complete(boolean ok, String code, String message, String imageDataUrl) {
        if (!completed.compareAndSet(false, true)) return;
        mainHandler.removeCallbacks(timeout);
        mainHandler.post(() -> {
            cleanupCapture();
            OverlayService.completeScreenCapture(
                    getApplicationContext(),
                    ok,
                    code,
                    message,
                    imageDataUrl
            );
            finishAndRemoveTask();
            overridePendingTransition(0, 0);
        });
    }

    private void cleanupCapture() {
        releasing = true;
        if (imageReader != null) {
            imageReader.setOnImageAvailableListener(null, null);
        }
        if (virtualDisplay != null) {
            virtualDisplay.release();
            virtualDisplay = null;
        }
        if (imageReader != null) {
            imageReader.close();
            imageReader = null;
        }
        if (projection != null) {
            try {
                if (projectionCallback != null) projection.unregisterCallback(projectionCallback);
            } catch (RuntimeException ignored) {
            }
            projection.stop();
            projection = null;
        }
        if (captureThread != null) {
            captureThread.quitSafely();
            captureThread = null;
            captureHandler = null;
        }
    }

    @Override
    protected void onDestroy() {
        if (!completed.get()) {
            completeFailure("CAPTURE_INTERRUPTED", "看屏被中断，请再试一次。" );
        }
        super.onDestroy();
    }
}
