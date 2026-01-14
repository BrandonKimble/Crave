import React from 'react';
import {
  Pressable,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { overlaySheetStyles } from './overlaySheetStyles';

type OverlaySheetHeaderProps = {
  cutoutBackground: React.ReactNode;
  onHeaderLayout: (event: LayoutChangeEvent) => void;
  onHeaderRowLayout: (event: LayoutChangeEvent) => void;
  onGrabHandlePress: () => void;
  grabHandleAccessibilityLabel: string;
  grabHandleCutout?: boolean;
  fixedHeight?: boolean;
  title: React.ReactNode;
  actionButton: React.ReactNode;
  paddingTop?: number;
  transparent?: boolean;
  afterRow?: React.ReactNode;
  showDivider?: boolean;
  style?: StyleProp<ViewStyle>;
};

const OverlaySheetHeader: React.FC<OverlaySheetHeaderProps> = ({
  cutoutBackground,
  onHeaderLayout,
  onHeaderRowLayout,
  onGrabHandlePress,
  grabHandleAccessibilityLabel,
  grabHandleCutout = false,
  fixedHeight = true,
  title,
  actionButton,
  paddingTop = 0,
  transparent = true,
  afterRow,
  showDivider = true,
  style,
}) => {
  return (
    <View
      style={[
        overlaySheetStyles.header,
        fixedHeight ? overlaySheetStyles.tabHeader : null,
        transparent ? overlaySheetStyles.headerTransparent : null,
        { paddingTop },
        style,
      ]}
      onLayout={onHeaderLayout}
      collapsable={false}
    >
      {cutoutBackground}
      <View style={overlaySheetStyles.grabHandleWrapper}>
        <Pressable
          onPress={onGrabHandlePress}
          accessibilityRole="button"
          accessibilityLabel={grabHandleAccessibilityLabel}
          hitSlop={10}
        >
          <View
            style={[
              overlaySheetStyles.grabHandle,
              grabHandleCutout ? overlaySheetStyles.grabHandleCutout : null,
            ]}
          />
        </Pressable>
      </View>
      <View
        style={[overlaySheetStyles.headerRow, overlaySheetStyles.headerRowSpaced]}
        onLayout={onHeaderRowLayout}
        collapsable={false}
      >
        {title}
        {actionButton}
      </View>
      {afterRow ?? null}
      {showDivider ? <View style={overlaySheetStyles.headerDivider} /> : null}
    </View>
  );
};

export default OverlaySheetHeader;
