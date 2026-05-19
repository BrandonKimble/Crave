import { requireNativeComponent, type ColorValue, type ViewProps } from 'react-native';

export type SearchRouteNavSilhouetteHostNativeProps = ViewProps & {
  materialEnabled?: boolean;
  materialBlurAmount?: number;
  materialBlurType?: 'light' | 'dark' | 'default';
  materialTintColor?: ColorValue;
  navMaterialTopInset?: number;
  cutoutHeight?: number;
  cutoutRadius?: number;
};

export const SearchRouteNavSilhouetteHostNativeView =
  requireNativeComponent<SearchRouteNavSilhouetteHostNativeProps>(
    'SearchRouteNavSilhouetteHostView'
  );
