#import <React/RCTViewManager.h>

// Both view managers below are implemented in
// SearchRouteSheetNavExclusionMaskView.swift.

@interface RCT_EXTERN_MODULE(SearchRouteSheetNavExclusionMaskViewManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(maskEnabled, BOOL)
RCT_EXPORT_VIEW_PROPERTY(navBodyBoundaryVisibleY, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(navBodyBoundaryHiddenY, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(navBodyBoundaryTranslateY, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(maskOriginY, CGFloat)
@end

@interface RCT_EXTERN_MODULE(SearchRouteNavSilhouetteHostViewManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(materialEnabled, BOOL)
RCT_EXPORT_VIEW_PROPERTY(materialBlurAmount, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(materialBlurType, NSString)
RCT_EXPORT_VIEW_PROPERTY(materialTintColor, UIColor)
RCT_EXPORT_VIEW_PROPERTY(navMaterialTopInset, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(cutoutHeight, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(cutoutRadius, CGFloat)
@end
