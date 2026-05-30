package com.crave;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

public class SearchRouteNavSilhouetteHostViewManager
  extends SimpleViewManager<SearchRouteNavSilhouetteHostView> {
  public static final String REACT_CLASS = "SearchRouteNavSilhouetteHostView";

  @NonNull
  @Override
  public String getName() {
    return REACT_CLASS;
  }

  @NonNull
  @Override
  protected SearchRouteNavSilhouetteHostView createViewInstance(
    @NonNull ThemedReactContext reactContext
  ) {
    return new SearchRouteNavSilhouetteHostView(reactContext);
  }

  @ReactProp(name = "materialEnabled", defaultBoolean = true)
  public void setMaterialEnabled(SearchRouteNavSilhouetteHostView view, boolean value) {
    view.setMaterialEnabled(value);
  }

  @ReactProp(name = "materialBlurAmount", defaultFloat = 15f)
  public void setMaterialBlurAmount(SearchRouteNavSilhouetteHostView view, float value) {
    view.setMaterialBlurAmount(value);
  }

  @ReactProp(name = "materialBlurType")
  public void setMaterialBlurType(SearchRouteNavSilhouetteHostView view, @Nullable String value) {
    view.setMaterialBlurType(value);
  }

  @ReactProp(name = "materialTintColor", customType = "Color")
  public void setMaterialTintColor(SearchRouteNavSilhouetteHostView view, @Nullable Integer value) {
    view.setMaterialTintColor(value);
  }

  @ReactProp(name = "navMaterialTopInset", defaultFloat = 0f)
  public void setNavMaterialTopInset(SearchRouteNavSilhouetteHostView view, float value) {
    view.setNavMaterialTopInset(value);
  }

  @ReactProp(name = "cutoutHeight", defaultFloat = 0f)
  public void setCutoutHeight(SearchRouteNavSilhouetteHostView view, float value) {
    view.setCutoutHeight(value);
  }

  @ReactProp(name = "cutoutRadius", defaultFloat = 0f)
  public void setCutoutRadius(SearchRouteNavSilhouetteHostView view, float value) {
    view.setCutoutRadius(value);
  }
}
