package com.crave;

import androidx.annotation.NonNull;

import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

public class SearchRouteSheetNavExclusionMaskViewManager
  extends SimpleViewManager<SearchRouteSheetNavExclusionMaskView> {
  public static final String REACT_CLASS = "SearchRouteSheetNavExclusionMaskView";

  @NonNull
  @Override
  public String getName() {
    return REACT_CLASS;
  }

  @NonNull
  @Override
  protected SearchRouteSheetNavExclusionMaskView createViewInstance(
    @NonNull ThemedReactContext reactContext
  ) {
    return new SearchRouteSheetNavExclusionMaskView(reactContext);
  }

  @ReactProp(name = "maskEnabled", defaultBoolean = false)
  public void setMaskEnabled(SearchRouteSheetNavExclusionMaskView view, boolean value) {
    view.setMaskEnabled(value);
  }

  @ReactProp(name = "navBodyBoundaryVisibleY", defaultFloat = 0f)
  public void setNavBodyBoundaryVisibleY(SearchRouteSheetNavExclusionMaskView view, float value) {
    view.setNavBodyBoundaryVisibleY(value);
  }

  @ReactProp(name = "navBodyBoundaryHiddenY", defaultFloat = 0f)
  public void setNavBodyBoundaryHiddenY(SearchRouteSheetNavExclusionMaskView view, float value) {
    view.setNavBodyBoundaryHiddenY(value);
  }

  @ReactProp(name = "navBodyBoundaryTranslateY", defaultFloat = 0f)
  public void setNavBodyBoundaryTranslateY(SearchRouteSheetNavExclusionMaskView view, float value) {
    view.setNavBodyBoundaryTranslateY(value);
  }

  @ReactProp(name = "maskOriginY", defaultFloat = 0f)
  public void setMaskOriginY(SearchRouteSheetNavExclusionMaskView view, float value) {
    view.setMaskOriginY(value);
  }
}
