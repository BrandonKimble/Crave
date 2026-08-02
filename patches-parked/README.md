# Parked patches — NOT applied by postinstall

`@rnmapbox+maps+10.2.9.patch` was written against 10.2.9; the package is now
10.3.1 and the patch no longer applies ANYWHERE (not locally, not CI — it
silently stopped applying at the version bump, and killed `yarn install` in CI
for 100 straight runs, 2026-08-02). It contains ~1,007 lines of real
map-camera native customisation buried in ~12,497 lines of accidentally
captured Android build artifacts. Re-porting it to 10.3.1 needs the map owner

- an Xcode build to verify (`RNMBXCameraViewManager.m` no longer exists
  upstream; two other files moved). Until then it lives here so installs succeed
  and its absence is EXPLICIT rather than silent.
