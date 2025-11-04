import type React from 'react';
import * as ReactNative from 'react-native';

type CodegenNativeComponent = <T extends object>(
  componentName: string,
  options?: unknown
) => React.ComponentType<T>;

const rn = ReactNative as unknown as {
  codegenNativeComponent?: CodegenNativeComponent;
  requireNativeComponent: CodegenNativeComponent;
};

if (typeof rn.codegenNativeComponent !== 'function') {
  rn.codegenNativeComponent = (componentName: string, options?: unknown) =>
    rn.requireNativeComponent(componentName, options);
}
