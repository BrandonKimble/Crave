package com.crave;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

import java.util.Map;

public class RestaurantPanelSnapshotViewManager extends SimpleViewManager<RestaurantPanelSnapshotView> {
  public static final String REACT_CLASS = "CraveRestaurantPanelSnapshotView";

  @NonNull
  @Override
  public String getName() {
    return REACT_CLASS;
  }

  @NonNull
  @Override
  protected RestaurantPanelSnapshotView createViewInstance(@NonNull ThemedReactContext reactContext) {
    return new RestaurantPanelSnapshotView(reactContext);
  }

  @Nullable
  @Override
  public Map<String, Object> getExportedCustomDirectEventTypeConstants() {
    return MapBuilder.of(
      RestaurantPanelSnapshotView.EVENT_ACTION,
      MapBuilder.of("registrationName", "onAction")
    );
  }

  @ReactProp(name = "snapshot")
  public void setSnapshot(RestaurantPanelSnapshotView view, @Nullable ReadableMap snapshot) {
    view.setSnapshot(snapshot);
  }
}
