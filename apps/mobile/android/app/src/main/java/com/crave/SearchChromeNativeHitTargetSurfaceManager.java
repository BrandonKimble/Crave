package com.crave;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

import java.util.Map;

public class SearchChromeNativeHitTargetSurfaceManager
  extends SimpleViewManager<SearchChromeNativeHitTargetSurface> {
  public static final String REACT_CLASS = "SearchChromeNativeHitTargetSurface";

  @NonNull
  @Override
  public String getName() {
    return REACT_CLASS;
  }

  @NonNull
  @Override
  protected SearchChromeNativeHitTargetSurface createViewInstance(
    @NonNull ThemedReactContext reactContext
  ) {
    return new SearchChromeNativeHitTargetSurface(reactContext);
  }

  @Nullable
  @Override
  public Map<String, Object> getExportedCustomDirectEventTypeConstants() {
    return MapBuilder.of(
      SearchChromeNativeHitTargetSurface.EVENT_TOUCH_TARGET_PRESS,
      MapBuilder.of("registrationName", "onSearchChromeNativeHitTargetPress")
    );
  }

  @ReactProp(name = "hostKey")
  public void setHostKey(SearchChromeNativeHitTargetSurface view, @Nullable String hostKey) {
    view.setHostKey(hostKey);
  }
}
