package com.crave;

import android.content.Context;
import android.graphics.Canvas;
import android.os.Build;
import android.widget.FrameLayout;

public class SearchRouteSheetNavExclusionMaskView extends FrameLayout {
  private boolean maskEnabled = false;
  private float navBodyBoundaryVisibleY = 0f;
  private float navBodyBoundaryHiddenY = 0f;
  private float navBodyBoundaryTranslateY = 0f;
  private float maskOriginY = 0f;

  public SearchRouteSheetNavExclusionMaskView(Context context) {
    super(context);
    setWillNotDraw(false);
    setClipChildren(false);
    setClipToPadding(false);
  }

  public void setMaskEnabled(boolean value) {
    if (maskEnabled == value) {
      return;
    }
    maskEnabled = value;
    invalidate();
  }

  public void setNavBodyBoundaryVisibleY(float value) {
    if (Math.abs(navBodyBoundaryVisibleY - value) < 0.25f) {
      return;
    }
    navBodyBoundaryVisibleY = value;
    invalidate();
  }

  public void setNavBodyBoundaryHiddenY(float value) {
    if (Math.abs(navBodyBoundaryHiddenY - value) < 0.25f) {
      return;
    }
    navBodyBoundaryHiddenY = value;
    invalidate();
  }

  public void setNavBodyBoundaryTranslateY(float value) {
    if (Math.abs(navBodyBoundaryTranslateY - value) < 0.25f) {
      return;
    }
    navBodyBoundaryTranslateY = value;
    invalidate();
  }

  public void setMaskOriginY(float value) {
    if (Math.abs(maskOriginY - value) < 0.25f) {
      return;
    }
    maskOriginY = value;
    invalidate();
  }

  @Override
  protected void dispatchDraw(Canvas canvas) {
    if (!maskEnabled || getWidth() <= 0 || getHeight() <= 0) {
      super.dispatchDraw(canvas);
      return;
    }

    int saveCount = canvas.save();
    float hiddenBoundaryY = Math.max(navBodyBoundaryVisibleY, navBodyBoundaryHiddenY);
    float maxTranslateY = Math.max(0f, hiddenBoundaryY - navBodyBoundaryVisibleY);
    float resolvedTranslateY = Math.max(0f, Math.min(maxTranslateY, navBodyBoundaryTranslateY));
    float clipTop = Math.max(
      0f,
      Math.min(getHeight(), navBodyBoundaryVisibleY - maskOriginY + resolvedTranslateY)
    );
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      canvas.clipOutRect(0f, clipTop, getWidth(), getHeight());
    } else {
      canvas.clipRect(0f, 0f, getWidth(), clipTop);
    }
    super.dispatchDraw(canvas);
    canvas.restoreToCount(saveCount);
  }
}
