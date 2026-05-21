package com.videoplayer;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Handles play/pause and stop button taps from the media notification.
 * Forwards them to React Native via PipActionReceiver.emit().
 */
public class MediaNotificationReceiver extends BroadcastReceiver {

    public static final String ACTION_PLAY_PAUSE = "com.videoplayer.NOTIF_PLAY_PAUSE";
    public static final String ACTION_STOP       = "com.videoplayer.NOTIF_STOP";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ACTION_PLAY_PAUSE.equals(action)) {
            PipActionReceiver.emit("NotificationPlayPause", null);
        } else if (ACTION_STOP.equals(action)) {
            // Cancel the notification immediately so it disappears
            NotificationManager nm = (NotificationManager)
                    context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(MediaNotificationModule.NOTIF_ID);
            PipActionReceiver.emit("NotificationStop", null);
        }
    }
}
