package com.videoplayer;

import android.os.Build;
import android.os.Bundle;
import com.facebook.react.ReactActivity;
import com.facebook.react.ReactActivityDelegate;
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint;
import com.facebook.react.defaults.DefaultReactActivityDelegate;

public class MainActivity extends ReactActivity {
  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  @Override
  protected String getMainComponentName() {
    return "VideoPlayerApp";
  }

  /** Make hardware volume buttons control media audio (not ringer) while the app is open. */
  @Override
  protected void onCreate(android.os.Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    setVolumeControlStream(android.media.AudioManager.STREAM_MUSIC);
  }

  /** Notify JS when PiP window opens/closes so VideoPlayer can hide/show its controls. */
  @Override
  public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode);
    PipActionReceiver.emit("PipModeChanged", isInPictureInPictureMode);
  }

  /**
   * Skip the default ReactActivity onPause when entering PiP so the video
   * keeps playing inside the floating window.
   */
  @Override
  public void onPause() {
    super.onPause();
  }

  /** On Android 12+ entering PiP also triggers onStop — guard it the same way. */
  @Override
  public void onStop() {
    super.onStop();
  }

  @Override
  protected ReactActivityDelegate createReactActivityDelegate() {
    return new DefaultReactActivityDelegate(
        this,
        getMainComponentName(),
        DefaultNewArchitectureEntryPoint.getFabricEnabled());
  }
}
