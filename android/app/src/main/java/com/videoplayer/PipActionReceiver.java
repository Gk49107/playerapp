package com.videoplayer;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.modules.core.DeviceEventManagerModule;

/**
 * Receives the play/pause intent from the PiP floating window button
 * and forwards it to React Native via DeviceEventEmitter.
 */
public class PipActionReceiver extends BroadcastReceiver {

    public static final String ACTION_PLAY_PAUSE = "com.videoplayer.PIP_PLAY_PAUSE";

    private static java.lang.ref.WeakReference<ReactApplicationContext> sCtxRef;

    public static void setReactContext(ReactApplicationContext ctx) {
        sCtxRef = new java.lang.ref.WeakReference<>(ctx);
    }

    /** Emit any DeviceEventEmitter event from Java code. */
    public static void emit(String event, Object data) {
        ReactApplicationContext ctx = sCtxRef != null ? sCtxRef.get() : null;
        if (ctx != null && ctx.hasActiveCatalystInstance()) {
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
               .emit(event, data);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ACTION_PLAY_PAUSE.equals(intent.getAction())) return;
        ReactApplicationContext ctx = sCtxRef != null ? sCtxRef.get() : null;
        if (ctx != null && ctx.hasActiveCatalystInstance()) {
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
               .emit("PipPlayPause", null);
        }
    }
}
