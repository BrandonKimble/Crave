package com.crave;

import androidx.annotation.NonNull;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.rnmapbox.rnmbx.components.camera.ProfilePresentationCameraHostRegistry;
import java.util.HashMap;
import java.util.Map;

public class ProfilePresentationTransactionExecutorModule extends ReactContextBaseJavaModule {
  private static final String MODULE_NAME = "PresentationCommandExecutor";

  public ProfilePresentationTransactionExecutorModule(@NonNull ReactApplicationContext reactContext) {
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
    constants.put("cameraCommandExecutionAvailable", true);
    constants.put("sheetCommandExecutionAvailable", true);
    return constants;
  }

  @ReactMethod
  public void executeCameraCommand(ReadableMap payload, Promise promise) {
    if (!payload.hasKey("hostKey") || !payload.hasKey("stop")) {
      promise.reject("invalid_payload", "Expected hostKey and stop");
      return;
    }
    String hostKey = payload.getString("hostKey");
    ReadableMap stop = payload.getMap("stop");
    if (hostKey == null || stop == null) {
      promise.reject("invalid_payload", "Expected hostKey and stop");
      return;
    }
    String token =
      stop.hasKey("animationCompletionId") && !stop.isNull("animationCompletionId")
        ? stop.getString("animationCompletionId")
        : null;
    ProfilePresentationCameraHostRegistry.INSTANCE.dispatchCommand(hostKey, stop, token);
    promise.resolve(null);
  }

  @ReactMethod
  public void executeSheetCommands(ReadableMap payload, Promise promise) {
    ReadableMap executionContext = payload.hasKey("executionContext")
      ? payload.getMap("executionContext")
      : null;
    ReadableMap commandSet = payload.hasKey("commandSet") ? payload.getMap("commandSet") : null;
    Integer requestToken =
      executionContext != null && executionContext.hasKey("requestToken")
        ? executionContext.getInt("requestToken")
        : null;

    if (commandSet != null && requestToken != null) {
      ReadableMap restaurantSheetCommand =
        commandSet.hasKey("restaurantSheetCommand")
          ? commandSet.getMap("restaurantSheetCommand")
          : null;
      if (
        restaurantSheetCommand != null &&
        restaurantSheetCommand.hasKey("type") &&
        "request".equals(restaurantSheetCommand.getString("type")) &&
        restaurantSheetCommand.hasKey("snap")
      ) {
        String snapTo = restaurantSheetCommand.getString("snap");
        if (snapTo != null) {
          BottomSheetHostView.dispatchCommand("restaurant_profile_sheet", snapTo, requestToken);
        }
      }

      ReadableMap resultsSheetCommand =
        commandSet.hasKey("resultsSheetCommand")
          ? commandSet.getMap("resultsSheetCommand")
          : null;
      if (resultsSheetCommand != null && resultsSheetCommand.hasKey("type")) {
        String type = resultsSheetCommand.getString("type");
        if ("request".equals(type) && resultsSheetCommand.hasKey("snap")) {
          String snapTo = resultsSheetCommand.getString("snap");
          if (snapTo != null) {
            BottomSheetHostView.dispatchCommand("app_overlay_sheet", snapTo, requestToken);
          }
        } else if ("hide".equals(type)) {
          BottomSheetHostView.dispatchCommand("app_overlay_sheet", "hidden", requestToken);
        }
      }
    }

    promise.resolve(null);
  }
}
