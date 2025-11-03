// Expo expects an `App` entry at the workspace root; re-export the
// mobile bundle so monorepo tooling resolves the Expo entrypoint.
export { default } from './apps/mobile/App';
