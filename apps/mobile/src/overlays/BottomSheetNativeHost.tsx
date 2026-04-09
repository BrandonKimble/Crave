import React from 'react';
import {
  Platform,
  View,
  requireNativeComponent,
  type HostComponent,
  type ViewProps,
} from 'react-native';

import type {
  BottomSheetMotionCommand,
  BottomSheetSnap,
  BottomSheetSnapChangeSource,
  BottomSheetSnapPoints,
} from './bottomSheetMotionTypes';

export type BottomSheetNativeHostEvent =
  | {
      eventType: 'sheet_y';
      sheetY: number;
    }
  | {
      eventType: 'snap_start' | 'snap_change';
      snap: BottomSheetSnap;
      source: BottomSheetSnapChangeSource;
    }
  | {
      eventType: 'drag_state' | 'settle_state';
      isActive: boolean;
    };

type NativeEventPayload = {
  nativeEvent: BottomSheetNativeHostEvent;
};

type NativeBottomSheetHostProps = ViewProps & {
  hostKey?: string;
  visible: boolean;
  snapPoints: BottomSheetSnapPoints;
  initialSnapPoint: Exclude<BottomSheetSnap, 'hidden'>;
  preservePositionOnSnapPointsChange: boolean;
  preventSwipeDismiss: boolean;
  interactionEnabled: boolean;
  animateOnMount: boolean;
  dismissThreshold?: number;
  sheetCommand?: BottomSheetMotionCommand | null;
  onSheetHostEvent?: (event: NativeEventPayload) => void;
};

type BottomSheetNativeHostProps = Omit<NativeBottomSheetHostProps, 'onSheetHostEvent'> & {
  onHostEvent?: (event: BottomSheetNativeHostEvent) => void;
  children?: React.ReactNode;
};

const buildFallbackViewProps = (props: NativeBottomSheetHostProps): ViewProps => {
  const viewProps = { ...props } as Partial<NativeBottomSheetHostProps>;
  delete viewProps.hostKey;
  delete viewProps.visible;
  delete viewProps.snapPoints;
  delete viewProps.initialSnapPoint;
  delete viewProps.preservePositionOnSnapPointsChange;
  delete viewProps.preventSwipeDismiss;
  delete viewProps.interactionEnabled;
  delete viewProps.animateOnMount;
  delete viewProps.dismissThreshold;
  delete viewProps.sheetCommand;
  return viewProps as ViewProps;
};

let NativeBottomSheetHostView: HostComponent<NativeBottomSheetHostProps> | null = null;

try {
  NativeBottomSheetHostView = requireNativeComponent<NativeBottomSheetHostProps>(
    'CraveBottomSheetHostView'
  ) as HostComponent<NativeBottomSheetHostProps>;
} catch {
  NativeBottomSheetHostView = null;
}

export const BottomSheetNativeHost = ({
  onHostEvent,
  children,
  ...props
}: BottomSheetNativeHostProps): React.ReactElement => {
  const handleSheetHostEvent = React.useCallback(
    (event: NativeEventPayload) => {
      const nativeEvent = event.nativeEvent;
      onHostEvent?.(nativeEvent);
    },
    [onHostEvent]
  );

  if (!NativeBottomSheetHostView) {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      throw new Error('CraveBottomSheetHostView is not registered');
    }
    return <View {...buildFallbackViewProps(props)}>{children}</View>;
  }

  return (
    <NativeBottomSheetHostView {...props} onSheetHostEvent={handleSheetHostEvent}>
      {children}
    </NativeBottomSheetHostView>
  );
};

export type { BottomSheetNativeHostProps };
