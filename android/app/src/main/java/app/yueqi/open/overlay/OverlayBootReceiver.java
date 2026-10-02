package app.yueqi.open.overlay;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Restores the floating companion after a reboot, an app update, or unlock.
 *
 * The overlay is a `specialUse` foreground service, which Android 14+ still permits
 * to start from a BOOT_COMPLETED receiver — but only when started from the receiver
 * itself, and only with the special-use type alone (no mediaProjection at boot).
 */
public class OverlayBootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;

        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                && !Intent.ACTION_USER_PRESENT.equals(action)
                && !"android.intent.action.QUICKBOOT_POWERON".equals(action)
                && !"com.htc.intent.action.QUICKBOOT_POWERON".equals(action)) {
            return;
        }

        OverlayService.restoreIfNeeded(context);
    }
}
