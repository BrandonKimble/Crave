// Lane-local ambient types: react-test-renderer@19 ships no .d.ts, and the
// mocks render marker host elements ('mounted-body', 'scene-loading-surface',
// …) that are not React Native intrinsics. Scoped to this lane by the main
// tsconfig's exclude.

declare module 'react-test-renderer';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: Record<string, unknown>;
    }
  }
}

export {};
