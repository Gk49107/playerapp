package com.videoplayer;

import android.app.Application;
import android.content.Context;
import android.util.Log;
import com.facebook.react.PackageList;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactInstanceManager;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.ReactPackage;
import com.facebook.react.config.ReactFeatureFlags;
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint;
import com.facebook.react.defaults.DefaultReactNativeHost;
import com.facebook.soloader.SoLoader;
import java.io.File;
import java.io.FileWriter;
import java.lang.reflect.InvocationTargetException;
import java.util.Date;
import java.util.List;

public class MainApplication extends Application implements ReactApplication {
  private final ReactNativeHost mReactNativeHost =
      new DefaultReactNativeHost(this) {
        @Override
        public boolean getUseDeveloperSupport() {
          return BuildConfig.DEBUG;
        }

        @Override
        protected List<ReactPackage> getPackages() {
          List<ReactPackage> packages = new PackageList(this).getPackages();
          // Packages that cannot be autolinked yet can be added manually here
          packages.add(new PipPackage());
          return packages;
        }

        @Override
        protected String getJSMainModuleName() {
          return "index";
        }

        @Override
        protected boolean isNewArchEnabled() {
          return BuildConfig.IS_NEW_ARCHITECTURE_ENABLED;
        }

        @Override
        protected Boolean isHermesEnabled() {
          return BuildConfig.IS_HERMES_ENABLED;
        }
      };

  @Override
  public ReactNativeHost getReactNativeHost() {
    return mReactNativeHost;
  }

  @Override
  public void onCreate() {
    super.onCreate();

    // ── Crash logger: writes stack trace to filesDir/crash_log.txt ──────
    final Thread.UncaughtExceptionHandler defaultHandler =
        Thread.getDefaultUncaughtExceptionHandler();
    final Context appCtx = this;
    Thread.setDefaultUncaughtExceptionHandler((thread, ex) -> {
      try {
        File f = new File(appCtx.getFilesDir(), "crash_log.txt");
        FileWriter fw = new FileWriter(f, false);
        fw.write("Crash at: " + new Date() + "\n");
        fw.write("Thread: " + thread.getName() + "\n\n");
        fw.write(Log.getStackTraceString(ex));
        fw.close();
      } catch (Exception ignored) {}
      if (defaultHandler != null) {
        defaultHandler.uncaughtException(thread, ex);
      } else {
        android.os.Process.killProcess(android.os.Process.myPid());
      }
    });

    SoLoader.init(this, /* native exopackage */ false);
  }

}
