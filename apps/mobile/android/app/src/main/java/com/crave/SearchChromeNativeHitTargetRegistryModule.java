package com.crave;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;

import java.util.HashMap;
import java.util.Map;

public class SearchChromeNativeHitTargetRegistryModule extends ReactContextBaseJavaModule {
  private static final String MODULE_NAME = "SearchChromeNativeHitTargetRegistry";

  public SearchChromeNativeHitTargetRegistryModule(@NonNull ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @NonNull
  @Override
  public String getName() {
    return MODULE_NAME;
  }

  @Override
  public Map<String, Object> getConstants() {
    Map<String, Object> constants = new HashMap<>();
    constants.put("searchChromeNativeHitTargetAvailable", true);
    return constants;
  }

  @ReactMethod
  public void syncRegions(ReadableMap payload, Promise promise) {
    if (payload == null || !payload.hasKey("hostKey")) {
      promise.reject("invalid_payload", "Expected hostKey");
      return;
    }
    String hostKey = payload.getString("hostKey");
    if (hostKey == null) {
      promise.reject("invalid_payload", "Expected hostKey");
      return;
    }
    ReadableArray regions = payload.hasKey("regions") ? payload.getArray("regions") : null;
    SearchChromeNativeHitTargetSurface.syncRegions(hostKey, regions);
    promise.resolve(null);
  }
}
