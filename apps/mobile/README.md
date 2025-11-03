# Mobile App Notes

- `App.tsx` at the repository root re-exports this bundle so Expo can resolve the workspace entrypoint when running from the monorepo root.
- Search history now persists through `@react-native-async-storage/async-storage`. To verify manually: run `yarn workspace @crave-search/mobile start`, execute a search, reload the app, and confirm the history chip still appears on Discover.
