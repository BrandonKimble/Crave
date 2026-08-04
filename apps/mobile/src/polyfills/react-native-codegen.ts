// Ensure React Native exposes `codegenNativeComponent` before any module that expects it.
// Imported FIRST in App.tsx (App.tsx:3) — a library whose codegen'd component is required
// during module evaluation would otherwise see `undefined`.
//
// F863 (2026-08-03): this used to be a three-file graveyard — this file merely re-exported
// `src/shims/registerCodegenNativeComponent.ts`, and `src/shims/codegen-native-component.ts`
// was a near-duplicate 8-line implementation with ZERO importers. Both were the abandoned
// `.ts` half of the `.js` shims metro.config named in the dead `resolver.alias` block that
// F807 deleted (Metro has no `resolver.alias` option — verified against metro-config,
// metro-resolver and @expo/metro-config). ONE file now: this one.
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

export {};
