package com.crave;

import android.graphics.Rect;
import android.view.View;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.uimanager.UIManagerModule;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class SearchChromeScalarSurfaceRegistryModule extends ReactContextBaseJavaModule {
  private static final String MODULE_NAME = "SearchChromeScalarSurfaceRegistry";
  private static final ConcurrentHashMap<String, ReadableMap> HOSTS_BY_KEY =
    new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, ReadableMap> SNAPSHOTS_BY_KEY =
    new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, ReadableMap> PLATFORM_OWNERS_BY_KEY =
    new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, ConcurrentHashMap<String, ReadableMap>>
    PLATFORM_SCALAR_SLOTS_BY_HOST_KEY = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, ConcurrentHashMap<String, Integer>>
    MEASURED_CONTROLS_BY_HOST_KEY = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, ConcurrentHashMap<String, MeasuredFrame>>
    MEASURED_FRAMES_BY_HOST_KEY = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, ConcurrentHashMap<String, ObservedControl>>
    OBSERVED_CONTROLS_BY_HOST_KEY = new ConcurrentHashMap<>();

  private static final class MeasuredFrame {
    final String controlId;
    final double x;
    final double y;
    final double width;
    final double height;

    MeasuredFrame(String controlId, double x, double y, double width, double height) {
      this.controlId = controlId;
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
    }
  }

  private static final class ObservedControl {
    final int nativeTag;
    final View view;
    final View.OnLayoutChangeListener listener;

    ObservedControl(int nativeTag, View view, View.OnLayoutChangeListener listener) {
      this.nativeTag = nativeTag;
      this.view = view;
      this.listener = listener;
    }
  }

  public SearchChromeScalarSurfaceRegistryModule(@NonNull ReactApplicationContext reactContext) {
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
    constants.put("searchChromeScalarSurfaceAvailable", true);
    constants.put("searchChromeScalarSurfaceActive", false);
    constants.put("searchChromeScalarSurfacePlatformOwnerAvailable", true);
    constants.put("searchChromeScalarSurfacePlatformOwnerActive", false);
    return constants;
  }

  @ReactMethod
  public void registerSurfaceHost(ReadableMap payload, Promise promise) {
    if (
      payload == null ||
      !payload.hasKey("hostKey") ||
      !payload.hasKey("layoutOwnership")
    ) {
      promise.reject("invalid_payload", "Expected hostKey and layoutOwnership");
      return;
    }
    String hostKey = payload.getString("hostKey");
    if (hostKey == null) {
      promise.reject("invalid_payload", "Expected hostKey");
      return;
    }
    HOSTS_BY_KEY.put(hostKey, payload);
    promise.resolve(null);
  }

  @ReactMethod
  public void registerPlatformOwner(ReadableMap payload, Promise promise) {
    if (
      payload == null ||
      !payload.hasKey("hostKey") ||
      !payload.hasKey("measurementOwnership") ||
      !payload.hasKey("scalarOwnership") ||
      !payload.hasKey("actionResolution")
    ) {
      promise.reject(
        "invalid_payload",
        "Expected hostKey, measurementOwnership, scalarOwnership, and actionResolution"
      );
      return;
    }
    String hostKey = payload.getString("hostKey");
    if (hostKey == null) {
      promise.reject("invalid_payload", "Expected hostKey");
      return;
    }
    PLATFORM_OWNERS_BY_KEY.put(hostKey, payload);
    promise.resolve(null);
  }

  @ReactMethod
  public void readPlatformOwnerStatus(String hostKey, Promise promise) {
    promise.resolve(buildPlatformOwnerStatus(hostKey));
  }

  @ReactMethod
  public void registerPlatformScalarSlot(ReadableMap payload, Promise promise) {
    if (
      payload == null ||
      !payload.hasKey("hostKey") ||
      !payload.hasKey("controlId") ||
      !payload.hasKey("visibleSource") ||
      !payload.hasKey("enabledSource") ||
      !payload.hasKey("passThroughSource")
    ) {
      promise.reject(
        "invalid_payload",
        "Expected hostKey, controlId, visibleSource, enabledSource, and passThroughSource"
      );
      return;
    }
    String hostKey = payload.getString("hostKey");
    String controlId = payload.getString("controlId");
    if (hostKey == null || controlId == null) {
      promise.reject("invalid_payload", "Expected hostKey and controlId");
      return;
    }
    scalarSlotsForHost(hostKey).put(controlId, payload);
    promise.resolve(null);
  }

  @ReactMethod
  public void readPlatformScalarSlotStatus(String hostKey, Promise promise) {
    promise.resolve(buildPlatformScalarSlotStatus(hostKey));
  }

  @ReactMethod
  public void registerMeasuredControl(ReadableMap payload, Promise promise) {
    if (
      payload == null ||
      !payload.hasKey("hostKey") ||
      !payload.hasKey("controlId") ||
      !payload.hasKey("nativeTag")
    ) {
      promise.reject("invalid_payload", "Expected hostKey, controlId, and nativeTag");
      return;
    }
    String hostKey = payload.getString("hostKey");
    String controlId = payload.getString("controlId");
    if (hostKey == null || controlId == null) {
      promise.reject("invalid_payload", "Expected hostKey and controlId");
      return;
    }
    ConcurrentHashMap<String, Integer> controls = MEASURED_CONTROLS_BY_HOST_KEY.get(hostKey);
    if (controls == null) {
      controls = new ConcurrentHashMap<>();
      MEASURED_CONTROLS_BY_HOST_KEY.put(hostKey, controls);
    }
    controls.put(controlId, payload.getInt("nativeTag"));
    attachNativeLayoutObserver(hostKey, controlId, payload.getInt("nativeTag"));
    promise.resolve(null);
  }

  @ReactMethod
  public void measureRegisteredControls(String hostKey, Promise promise) {
    WritableMap result = Arguments.createMap();
    WritableArray frames = Arguments.createArray();
    result.putString("hostKey", hostKey);
    result.putArray("frames", frames);

    ConcurrentHashMap<String, MeasuredFrame> framesByControlId =
      MEASURED_FRAMES_BY_HOST_KEY.get(hostKey);
    if (framesByControlId == null) {
      promise.resolve(result);
      return;
    }

    for (MeasuredFrame measuredFrame : framesByControlId.values()) {
      WritableMap frame = Arguments.createMap();
      frame.putString("controlId", measuredFrame.controlId);
      frame.putDouble("x", measuredFrame.x);
      frame.putDouble("y", measuredFrame.y);
      frame.putDouble("width", measuredFrame.width);
      frame.putDouble("height", measuredFrame.height);
      frames.pushMap(frame);
    }

    promise.resolve(result);
  }

  @ReactMethod
  public void syncScalarSnapshot(ReadableMap payload, Promise promise) {
    if (
      payload == null ||
      !payload.hasKey("hostKey") ||
      !payload.hasKey("revision")
    ) {
      promise.reject("invalid_payload", "Expected hostKey and revision");
      return;
    }
    String hostKey = payload.getString("hostKey");
    ReadableArray regions = payload.hasKey("regions") ? payload.getArray("regions") : null;
    if (hostKey == null || regions == null) {
      promise.reject("invalid_payload", "Expected hostKey and regions");
      return;
    }
    SNAPSHOTS_BY_KEY.put(hostKey, payload);
    promise.resolve(null);
  }

  @ReactMethod
  public void clearMeasuredControl(ReadableMap payload, Promise promise) {
    if (
      payload == null ||
      !payload.hasKey("hostKey") ||
      !payload.hasKey("controlId")
    ) {
      promise.reject("invalid_payload", "Expected hostKey and controlId");
      return;
    }
    String hostKey = payload.getString("hostKey");
    String controlId = payload.getString("controlId");
    if (hostKey != null && controlId != null) {
      ConcurrentHashMap<String, Integer> controls = MEASURED_CONTROLS_BY_HOST_KEY.get(hostKey);
      if (controls != null) {
        controls.remove(controlId);
      }
      ConcurrentHashMap<String, MeasuredFrame> frames = MEASURED_FRAMES_BY_HOST_KEY.get(hostKey);
      if (frames != null) {
        frames.remove(controlId);
      }
      detachNativeLayoutObserver(hostKey, controlId);
    }
    promise.resolve(null);
  }

  @ReactMethod
  public void clearSurfaceHost(String hostKey, Promise promise) {
    HOSTS_BY_KEY.remove(hostKey);
    SNAPSHOTS_BY_KEY.remove(hostKey);
    PLATFORM_OWNERS_BY_KEY.remove(hostKey);
    PLATFORM_SCALAR_SLOTS_BY_HOST_KEY.remove(hostKey);
    MEASURED_CONTROLS_BY_HOST_KEY.remove(hostKey);
    MEASURED_FRAMES_BY_HOST_KEY.remove(hostKey);
    detachNativeLayoutObservers(hostKey);
    promise.resolve(null);
  }

  private static WritableMap buildPlatformOwnerStatus(String hostKey) {
    ReadableMap owner = PLATFORM_OWNERS_BY_KEY.get(hostKey);
    WritableMap status = Arguments.createMap();
    status.putString("hostKey", hostKey);
    status.putBoolean("available", true);
    status.putBoolean("active", false);
    status.putString(
      "measurementOwnership",
      readStringOrDefault(owner, "measurementOwnership", "nativeMeasurementRegistry")
    );
    status.putString(
      "scalarOwnership",
      readStringOrDefault(owner, "scalarOwnership", "platformReadableTargets")
    );
    status.putString(
      "actionResolution",
      readStringOrDefault(owner, "actionResolution", "jsPressTimeResolver")
    );
    status.putBoolean("ownsMeasuredFrames", true);
    status.putBoolean("ownsScalarValues", false);
    status.putBoolean("composesNativeRegions", false);
    status.putBoolean("resolvesActionsAtPressTime", false);
    status.putArray("missingHooks", buildMissingPlatformOwnerHooks());
    return status;
  }

  private static String readStringOrDefault(
    ReadableMap payload,
    String key,
    String fallback
  ) {
    if (payload == null || !payload.hasKey(key)) {
      return fallback;
    }
    String value = payload.getString(key);
    return value == null ? fallback : value;
  }

  private static WritableArray buildMissingPlatformOwnerHooks() {
    WritableArray missingHooks = Arguments.createArray();
    missingHooks.pushString("platformReadableScalarTargets");
    missingHooks.pushString("nativeRegionCompositionLoop");
    missingHooks.pushString("pressTimeActionResolver");
    return missingHooks;
  }

  private static WritableMap buildPlatformScalarSlotStatus(String hostKey) {
    WritableMap status = Arguments.createMap();
    WritableArray registeredControlIds = Arguments.createArray();
    ConcurrentHashMap<String, ReadableMap> scalarSlots =
      PLATFORM_SCALAR_SLOTS_BY_HOST_KEY.get(hostKey);
    if (scalarSlots != null) {
      for (String controlId : scalarSlots.keySet()) {
        registeredControlIds.pushString(controlId);
      }
    }

    status.putString("hostKey", hostKey);
    status.putBoolean("available", true);
    status.putBoolean("active", false);
    status.putBoolean("scalarSlotContractAvailable", true);
    status.putArray("registeredControlIds", registeredControlIds);
    status.putBoolean("ownsScalarValues", false);
    status.putString("missingScalarOwner", "platformReadableScalarSource");
    return status;
  }

  private static ConcurrentHashMap<String, ReadableMap> scalarSlotsForHost(String hostKey) {
    ConcurrentHashMap<String, ReadableMap> scalarSlots =
      PLATFORM_SCALAR_SLOTS_BY_HOST_KEY.get(hostKey);
    if (scalarSlots == null) {
      scalarSlots = new ConcurrentHashMap<>();
      PLATFORM_SCALAR_SLOTS_BY_HOST_KEY.put(hostKey, scalarSlots);
    }
    return scalarSlots;
  }

  private void attachNativeLayoutObserver(
    String hostKey,
    String controlId,
    int nativeTag
  ) {
    UiThreadUtil.runOnUiThread(() -> {
      detachNativeLayoutObserver(hostKey, controlId);
      UIManagerModule uiManager =
        getReactApplicationContext().getNativeModule(UIManagerModule.class);
      if (uiManager == null) {
        return;
      }
      View view;
      try {
        view = uiManager.resolveView(nativeTag);
      } catch (Throwable error) {
        view = null;
      }
      if (view == null) {
        return;
      }

      View resolvedView = view;
      View.OnLayoutChangeListener listener = (
        nextView,
        left,
        top,
        right,
        bottom,
        oldLeft,
        oldTop,
        oldRight,
        oldBottom
      ) -> cacheMeasuredFrame(hostKey, controlId, nextView);
      resolvedView.addOnLayoutChangeListener(listener);
      observersForHost(hostKey).put(
        controlId,
        new ObservedControl(nativeTag, resolvedView, listener)
      );
      cacheMeasuredFrame(hostKey, controlId, resolvedView);
    });
  }

  private static void detachNativeLayoutObserver(String hostKey, String controlId) {
    ConcurrentHashMap<String, ObservedControl> observers = OBSERVED_CONTROLS_BY_HOST_KEY.get(hostKey);
    if (observers == null) {
      return;
    }
    ObservedControl observer = observers.remove(controlId);
    if (observer != null) {
      UiThreadUtil.runOnUiThread(() ->
        observer.view.removeOnLayoutChangeListener(observer.listener)
      );
    }
  }

  private static void detachNativeLayoutObservers(String hostKey) {
    ConcurrentHashMap<String, ObservedControl> observers =
      OBSERVED_CONTROLS_BY_HOST_KEY.remove(hostKey);
    if (observers == null) {
      return;
    }
    for (ObservedControl observer : observers.values()) {
      UiThreadUtil.runOnUiThread(() ->
        observer.view.removeOnLayoutChangeListener(observer.listener)
      );
    }
  }

  private static ConcurrentHashMap<String, ObservedControl> observersForHost(String hostKey) {
    ConcurrentHashMap<String, ObservedControl> observers =
      OBSERVED_CONTROLS_BY_HOST_KEY.get(hostKey);
    if (observers == null) {
      observers = new ConcurrentHashMap<>();
      OBSERVED_CONTROLS_BY_HOST_KEY.put(hostKey, observers);
    }
    return observers;
  }

  private static void cacheMeasuredFrame(String hostKey, String controlId, View view) {
    if (view.getWidth() <= 0 || view.getHeight() <= 0) {
      return;
    }
    Rect rect = new Rect();
    view.getGlobalVisibleRect(rect);
    ConcurrentHashMap<String, MeasuredFrame> frames = MEASURED_FRAMES_BY_HOST_KEY.get(hostKey);
    if (frames == null) {
      frames = new ConcurrentHashMap<>();
      MEASURED_FRAMES_BY_HOST_KEY.put(hostKey, frames);
    }
    frames.put(
      controlId,
      new MeasuredFrame(controlId, rect.left, rect.top, rect.width(), rect.height())
    );
  }
}
