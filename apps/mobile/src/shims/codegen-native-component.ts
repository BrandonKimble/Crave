import type React from 'react';
import * as ReactNative from 'react-native';

type CodegenNativeComponent = <T extends object>(
  componentName: string,
  options?: unknown
) => React.ComponentType<T>;

if (
  typeof (ReactNative as unknown as { codegenNativeComponent?: unknown }).codegenNativeComponent !==
  'function'
) {
  const shim: CodegenNativeComponent = (componentName) => {
    return ReactNative.requireNativeComponent(componentName);
  };

  Object.assign(ReactNative, { codegenNativeComponent: shim });
}
