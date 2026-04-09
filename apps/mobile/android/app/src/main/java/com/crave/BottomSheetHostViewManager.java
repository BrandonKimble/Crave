package com.crave;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

import java.util.Map;

public class BottomSheetHostViewManager extends SimpleViewManager<BottomSheetHostView> {
  public static final String REACT_CLASS = "CraveBottomSheetHostView";

  @NonNull
  @Override
  public String getName() {
    return REACT_CLASS;
  }

  @NonNull
  @Override
  protected BottomSheetHostView createViewInstance(@NonNull ThemedReactContext reactContext) {
    return new BottomSheetHostView(reactContext);
  }

  @Nullable
  @Override
  public Map<String, Object> getExportedCustomDirectEventTypeConstants() {
    return MapBuilder.of(
      BottomSheetHostView.EVENT_SHEET_HOST,
      MapBuilder.of("registrationName", "onSheetHostEvent")
    );
  }

  @ReactProp(name = "visible", defaultBoolean = false)
  public void setVisible(BottomSheetHostView view, boolean visible) {
    view.setVisible(visible);
  }

  @ReactProp(name = "hostKey")
  public void setHostKey(BottomSheetHostView view, @Nullable String hostKey) {
    view.setHostKey(hostKey);
  }

  @ReactProp(name = "snapPoints")
  public void setSnapPoints(BottomSheetHostView view, @Nullable ReadableMap snapPoints) {
    view.setSnapPoints(snapPoints);
  }

  @ReactProp(name = "initialSnapPoint")
  public void setInitialSnapPoint(BottomSheetHostView view, @Nullable String snapPoint) {
    view.setInitialSnapPoint(snapPoint);
  }

  @ReactProp(name = "preservePositionOnSnapPointsChange", defaultBoolean = false)
  public void setPreservePositionOnSnapPointsChange(BottomSheetHostView view, boolean value) {
    view.setPreservePositionOnSnapPointsChange(value);
  }

  @ReactProp(name = "preventSwipeDismiss", defaultBoolean = false)
  public void setPreventSwipeDismiss(BottomSheetHostView view, boolean value) {
    view.setPreventSwipeDismiss(value);
  }

  @ReactProp(name = "interactionEnabled", defaultBoolean = true)
  public void setInteractionEnabled(BottomSheetHostView view, boolean value) {
    view.setInteractionEnabled(value);
  }

  @ReactProp(name = "animateOnMount", defaultBoolean = false)
  public void setAnimateOnMount(BottomSheetHostView view, boolean value) {
    view.setAnimateOnMount(value);
  }

  @ReactProp(name = "dismissThreshold")
  public void setDismissThreshold(BottomSheetHostView view, @Nullable Float value) {
    view.setDismissThreshold(value);
  }

  @ReactProp(name = "sheetCommand")
  public void setSheetCommand(BottomSheetHostView view, @Nullable ReadableMap command) {
    view.setSheetCommand(command);
  }
}
