## fastlane documentation

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## iOS

### ios verify_asc

```sh
[bundle exec] fastlane ios verify_asc
```

Prove the ASC API key works. Read-only — changes nothing.

### ios builds

```sh
[bundle exec] fastlane ios builds
```

List TestFlight builds.

### ios beta

```sh
[bundle exec] fastlane ios beta
```

Upload an already-built .ipa to TestFlight. Pass ipa:path/to.ipa

---

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
