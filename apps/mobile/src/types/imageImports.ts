import type { ImageSourcePropType } from 'react-native';

export {};

declare module '*.png' {
  const value: ImageSourcePropType;
  export default value;
}
