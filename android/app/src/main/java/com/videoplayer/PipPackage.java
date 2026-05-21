package com.videoplayer;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class PipPackage implements ReactPackage {

    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        try {
            modules.add(new PipModule(reactContext));
        } catch (Throwable e) {
            // PiP not available on this device/API level — skip
        }
        try {
            modules.add(new MediaNotificationModule(reactContext));
        } catch (Throwable e) {
            // Class loading or init failed — skip the module so the app doesn't crash
        }
        return modules;
    }

    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }
}
