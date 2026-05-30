package com.crave;

import androidx.annotation.NonNull;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class SearchMapRenderControllerPackage implements ReactPackage {
  @NonNull
  @Override
  public List<NativeModule> createNativeModules(@NonNull ReactApplicationContext reactContext) {
    List<NativeModule> modules = new ArrayList<>();
    modules.add(new UIFrameSamplerModule(reactContext));
    modules.add(new SearchMapRenderControllerModule(reactContext));
    modules.add(new ProfilePresentationTransactionExecutorModule(reactContext));
    modules.add(new SearchChromeNativeHitTargetRegistryModule(reactContext));
    modules.add(new SearchChromeScalarSurfaceRegistryModule(reactContext));
    return modules;
  }

  @NonNull
  @Override
  public List<ViewManager> createViewManagers(@NonNull ReactApplicationContext reactContext) {
    List<ViewManager> managers = new ArrayList<>();
    managers.add(new BottomSheetHostViewManager());
    managers.add(new SearchChromeNativeHitTargetSurfaceManager());
    managers.add(new SearchRouteSheetNavExclusionMaskViewManager());
    managers.add(new SearchRouteNavSilhouetteHostViewManager());
    return managers;
  }
}
