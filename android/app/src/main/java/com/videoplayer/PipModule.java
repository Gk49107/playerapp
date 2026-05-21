package com.videoplayer;

import android.app.Activity;
import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.app.RemoteAction;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.util.Rational;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;

import java.util.Collections;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class PipModule extends ReactContextBaseJavaModule {

    public PipModule(ReactApplicationContext reactContext) {
        super(reactContext);
        PipActionReceiver.setReactContext(reactContext);
    }

    @Override
    public String getName() {
        return "PipModule";
    }

    /** Build a PendingIntent that fires PipActionReceiver when the PiP button is tapped. */
    private PendingIntent createPlayPauseIntent(Activity activity) {
        Intent intent = new Intent(PipActionReceiver.ACTION_PLAY_PAUSE);
        intent.setPackage(activity.getPackageName());
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
                : PendingIntent.FLAG_UPDATE_CURRENT;
        return PendingIntent.getBroadcast(activity, 0, intent, flags);
    }

    @ReactMethod
    public void enterPipMode() {
        Activity activity = getCurrentActivity();
        if (activity == null) return;
        // Don't re-enter if already in PiP — prevents crash on repeated calls
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && activity.isInPictureInPictureMode()) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                PendingIntent pi = createPlayPauseIntent(activity);
                Icon icon = Icon.createWithResource(activity, android.R.drawable.ic_media_pause);
                RemoteAction pauseAction = new RemoteAction(icon, "Pause", "Pause video", pi);
                PictureInPictureParams params = new PictureInPictureParams.Builder()
                        .setAspectRatio(new Rational(16, 9))
                        .setActions(Collections.singletonList(pauseAction))
                        .build();
                activity.enterPictureInPictureMode(params);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                activity.enterPictureInPictureMode();
            }
        } catch (Exception e) {
            // PiP not available on this device/configuration — silently ignore
        }
    }

    /**
     * Called from JS whenever isPlaying changes — keeps the PiP button icon in sync.
     * Safe to call outside PiP mode (Android silently pre-configures the params).
     */
    @ReactMethod
    public void updatePipParams(boolean isPlaying) {
        Activity activity = getCurrentActivity();
        if (activity == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                PendingIntent pi = createPlayPauseIntent(activity);
                int iconRes = isPlaying
                        ? android.R.drawable.ic_media_pause
                        : android.R.drawable.ic_media_play;
                String label = isPlaying ? "Pause" : "Play";
                Icon icon = Icon.createWithResource(activity, iconRes);
                RemoteAction action = new RemoteAction(icon, label, label, pi);
                PictureInPictureParams params = new PictureInPictureParams.Builder()
                        .setAspectRatio(new Rational(16, 9))
                        .setActions(Collections.singletonList(action))
                        .build();
                activity.setPictureInPictureParams(params);
            }
        } catch (Throwable e) {
            // PiP params update failed — silently ignore
        }
    }

    @ReactMethod
    public void setImmersiveMode(boolean immersive) {
        Activity activity = getCurrentActivity();
        if (activity == null) return;
        activity.runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                WindowInsetsController ctrl = activity.getWindow().getInsetsController();
                if (ctrl != null) {
                    if (immersive) {
                        ctrl.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                        ctrl.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                    } else {
                        ctrl.show(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    }
                }
            } else {
                View decorView = activity.getWindow().getDecorView();
                if (immersive) {
                    decorView.setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    );
                } else {
                    decorView.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
                }
            }
        });
    }

    @ReactMethod
    public void setBrightness(float brightness) {
        Activity activity = getCurrentActivity();
        if (activity == null) return;
        activity.runOnUiThread(() -> {
            android.view.WindowManager.LayoutParams lp = activity.getWindow().getAttributes();
            lp.screenBrightness = brightness < 0
                    ? android.view.WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
                    : Math.max(0.01f, Math.min(1.0f, brightness));
            activity.getWindow().setAttributes(lp);
        });
    }

    @ReactMethod
    public void getBrightness(com.facebook.react.bridge.Promise promise) {
        Activity activity = getCurrentActivity();
        if (activity == null) { promise.resolve(0.5f); return; }
        android.view.WindowManager.LayoutParams lp = activity.getWindow().getAttributes();
        float b = lp.screenBrightness;
        promise.resolve(b < 0 ? 0.5f : b);
    }

    @ReactMethod
    public void moveToBackground() {
        android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_MAIN);
        intent.addCategory(android.content.Intent.CATEGORY_HOME);
        intent.setFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
        getReactApplicationContext().startActivity(intent);
    }
}
