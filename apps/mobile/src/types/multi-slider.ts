export {};

declare module '@ptomasroos/react-native-multi-slider' {
  import * as React from 'react';
  import type { ViewStyle } from 'react-native';

  export interface MultiSliderProps {
    values: number[];
    min?: number;
    max?: number;
    step?: number;
    sliderLength?: number;
    allowOverlap?: boolean;
    snapped?: boolean;
    onValuesChange?: (values: number[]) => void;
    onValuesChangeStart?: (values: number[]) => void;
    onValuesChangeFinish?: (values: number[]) => void;
    containerStyle?: ViewStyle;
    trackStyle?: ViewStyle;
    selectedStyle?: ViewStyle;
    unselectedStyle?: ViewStyle;
    markerStyle?: ViewStyle;
    pressedMarkerStyle?: ViewStyle;
  }

  export default class MultiSlider extends React.Component<MultiSliderProps> {}
}
