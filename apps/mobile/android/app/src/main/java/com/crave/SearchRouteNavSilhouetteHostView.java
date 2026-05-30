package com.crave;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.view.View;

import androidx.annotation.Nullable;

public class SearchRouteNavSilhouetteHostView extends View {
  private final Paint materialPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final Path materialPath = new Path();
  private boolean materialEnabled = true;
  private float materialBlurAmount = 15f;
  private int materialTintColor = Color.argb(77, 248, 251, 255);
  private float navMaterialTopInset = 0f;
  private float cutoutHeight = 0f;
  private float cutoutRadius = 0f;

  public SearchRouteNavSilhouetteHostView(Context context) {
    super(context);
    setWillNotDraw(false);
    setLayerType(View.LAYER_TYPE_SOFTWARE, null);
    materialPaint.setStyle(Paint.Style.FILL);
    materialPaint.setColor(materialTintColor);
  }

  public void setMaterialEnabled(boolean value) {
    if (materialEnabled == value) {
      return;
    }
    materialEnabled = value;
    invalidate();
  }

  public void setMaterialBlurAmount(float value) {
    if (Math.abs(materialBlurAmount - value) < 0.25f) {
      return;
    }
    materialBlurAmount = Math.max(0f, value);
    invalidate();
  }

  public void setMaterialBlurType(@Nullable String value) {
    // Android keeps the same host contract as iOS. The current implementation uses the
    // provided tint as the material color; blur type is not a separate drawing concern here.
  }

  public void setMaterialTintColor(@Nullable Integer value) {
    int nextColor = value != null ? value : Color.argb(77, 248, 251, 255);
    if (materialTintColor == nextColor) {
      return;
    }
    materialTintColor = nextColor;
    invalidate();
  }

  public void setNavMaterialTopInset(float value) {
    if (Math.abs(navMaterialTopInset - value) < 0.25f) {
      return;
    }
    navMaterialTopInset = value;
    invalidate();
  }

  public void setCutoutHeight(float value) {
    if (Math.abs(cutoutHeight - value) < 0.25f) {
      return;
    }
    cutoutHeight = value;
    invalidate();
  }

  public void setCutoutRadius(float value) {
    if (Math.abs(cutoutRadius - value) < 0.25f) {
      return;
    }
    cutoutRadius = value;
    invalidate();
  }

  @Override
  protected void onDraw(Canvas canvas) {
    super.onDraw(canvas);
    if (!materialEnabled || getWidth() <= 0 || getHeight() <= 0 || materialBlurAmount <= 0f) {
      return;
    }

    materialPath.reset();
    materialPath.setFillType(Path.FillType.EVEN_ODD);
    RectF materialRect = new RectF(0f, 0f, getWidth(), getHeight());
    materialPath.addRect(materialRect, Path.Direction.CW);
    RectF cutoutRect = buildCutoutRect(materialRect);
    if (cutoutRect != null) {
      float radius = Math.min(
        Math.max(0f, cutoutRadius),
        Math.min(cutoutRect.width() / 2f, cutoutRect.height() / 2f)
      );
      if (radius > 0f) {
        materialPath.addRoundRect(cutoutRect, radius, radius, Path.Direction.CW);
      }
    }

    int alpha = Math.round(Color.alpha(materialTintColor) * Math.max(0f, Math.min(1f, materialBlurAmount / 15f)));
    materialPaint.setColor((materialTintColor & 0x00ffffff) | (alpha << 24));
    canvas.drawPath(materialPath, materialPaint);
  }

  @Nullable
  private RectF buildCutoutRect(RectF materialRect) {
    float resolvedCutoutHeight = Math.max(0f, cutoutHeight);
    if (materialRect.width() <= 0f || resolvedCutoutHeight <= 0f) {
      return null;
    }
    float baseRadius = Math.min(
      Math.max(0f, cutoutRadius),
      Math.min(materialRect.width() / 4f, resolvedCutoutHeight / 2f)
    );
    if (baseRadius <= 0f) {
      return null;
    }
    float navBodyTopY = Math.max(materialRect.top, Math.min(materialRect.bottom, navMaterialTopInset));
    RectF cutoutRect = new RectF(
      materialRect.left,
      navBodyTopY - resolvedCutoutHeight,
      materialRect.right,
      navBodyTopY
    );
    return cutoutRect.width() > 0f && cutoutRect.height() > 0f ? cutoutRect : null;
  }
}
