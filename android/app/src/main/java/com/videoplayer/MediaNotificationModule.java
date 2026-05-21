package com.videoplayer;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class MediaNotificationModule extends ReactContextBaseJavaModule {

    static final String CHANNEL_ID = "vp_playback";
    static final int    NOTIF_ID   = 1001;

    public MediaNotificationModule(ReactApplicationContext reactContext) {
        super(reactContext);
        createChannel(reactContext);
    }

    @Override
    public String getName() {
        return "MediaNotification";
    }

    // ── notification channel (required API 26+) ─────────────────────────

    private void createChannel(Context ctx) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel ch = new NotificationChannel(
                        CHANNEL_ID, "Video Playback", NotificationManager.IMPORTANCE_LOW);
                ch.setDescription("Media playback controls");
                ch.setSound(null, null);
                ch.setShowBadge(false);
                NotificationManager nm = ctx.getSystemService(NotificationManager.class);
                if (nm != null) nm.createNotificationChannel(ch);
            }
        } catch (Throwable e) {
            // never crash the app
        }
    }

    // ── pending intent helpers ──────────────────────────────────────────

    private PendingIntent actionIntent(String action, int reqCode) {
        Context ctx = getReactApplicationContext();
        Intent i = new Intent(action);
        i.setPackage(ctx.getPackageName());
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
                : PendingIntent.FLAG_UPDATE_CURRENT;
        return PendingIntent.getBroadcast(ctx, reqCode, i, flags);
    }

    private PendingIntent launchIntent() {
        try {
            Context ctx = getReactApplicationContext();
            Intent i = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
            if (i == null) return null;  // package not found — avoid NPE
            int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                    ? PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
                    : PendingIntent.FLAG_UPDATE_CURRENT;
            return PendingIntent.getActivity(ctx, 0, i, flags);
        } catch (Exception e) {
            return null;
        }
    }

    // ── public API (called from JS) ────────────────────────────────────

    @ReactMethod
    public void showNotification(String title, boolean isPlaying) {
        try {
            Context ctx = getReactApplicationContext();
            NotificationManager nm = (NotificationManager)
                    ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            int ppIcon   = isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;
            String ppLbl = isPlaying ? "Pause" : "Play";

            NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.ic_media_play)
                    .setContentTitle(title)
                    .setContentText(isPlaying ? "Now playing" : "Paused")
                    .setOngoing(isPlaying)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .addAction(ppIcon, ppLbl,
                            actionIntent(MediaNotificationReceiver.ACTION_PLAY_PAUSE, 100))
                    .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop",
                            actionIntent(MediaNotificationReceiver.ACTION_STOP, 101));

            // setContentIntent is optional — null is safe to skip
            PendingIntent launch = launchIntent();
            if (launch != null) builder.setContentIntent(launch);

            nm.notify(NOTIF_ID, builder.build());
        } catch (Throwable e) {
            // Never crash the app because of a notification failure
        }
    }

    @ReactMethod
    public void hideNotification() {
        try {
            Context ctx = getReactApplicationContext();
            NotificationManager nm = (NotificationManager)
                    ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(NOTIF_ID);
        } catch (Throwable e) {
            // ignore
        }
    }
}
