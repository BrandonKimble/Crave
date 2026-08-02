# Expo / EAS / App Store Connect

## ⚠️ There are THREE app configs. Only two are live.

| File                         | Status                                             |
| ---------------------------- | -------------------------------------------------- |
| `apps/mobile/app.json`       | ✅ base config Expo actually reads                 |
| `apps/mobile/app.config.js`  | ✅ wrapper that spreads app.json + injects `extra` |
| `/app.config.js` (repo root) | ❌ **DEAD** — nothing reads it                     |

Always confirm with `cd apps/mobile && npx expo config --type public --json`.
That is the only trustworthy answer. The root file declares a different slug
(`crave-search`), a different android package, and `expo-apple-authentication`
in `plugins` — none of which take effect. Reading it will mislead you.

Effective: slug `crave-search-mobile`, owner `brandonk`, project
`afbb04ee-213b-4227-a9d2-c87a8f413034`, bundle `com.brandonkimble.cravesearch`,
android package `com.crave`.

## eas.json — configured 2026-08-02

Profiles: `base` (shared node + `EXPO_PUBLIC_API_URL`), `development`
(dev-client, simulator), `development-device`, `preview` (internal),
`production` (store, autoIncrement). `submit.production` carries
`ascAppId 6793724490` + `appleTeamId FDT67MY727`.

Validate with `npx eas-cli config --platform ios --profile production`.

## EAS — installed, logged in

`npx eas-cli` v21.4.0. No global install needed.

```bash
npx eas-cli whoami
npx eas-cli login          # owner action, browser
npx eas-cli build:list
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios
```

`EXPO_PUBLIC_PROJECT_ID` is in `apps/mobile/.env`.

⚠️ **`EXPO_PUBLIC_*` vars inline at Metro start, not per bundle.** Changing one
requires a Metro restart — `./scripts/rig/sim-target.sh prod|local` does this
correctly. Everything `EXPO_PUBLIC_` ships in the client bundle: never put a
secret behind that prefix.

For local dev the relevant rig is `./scripts/rig/reload-dev-client.sh`, not EAS.

## App Store Connect — enrollment DONE, API key not yet created

Apple Developer enrollment completed (confirmed by owner 2026-08-02), so ASC is
**unblocked** — but no ASC API key exists yet, so nothing here is wired.

`eas submit` uploads a build but does not give you App Store Connect itself:
subscription products, TestFlight groups, review submission, and pricing all
live there. Bundle id is `com.brandonkimble.cravesearch` (matches the
RevenueCat project).

Options, in order of fit:

1. **`fastlane`** (`brew install fastlane`) — mature, handles `deliver`,
   `pilot` (TestFlight), and `produce`. Heaviest, most capable.
2. **`asc` CLI** (`asccli.sh`) — third-party, purpose-built for subscription
   setup, pairs with RevenueCat. Third-party: vet before granting an ASC key.
3. **ASC App Store Connect API directly** — an issuer id + key id + `.p8`
   private key, signed as a JWT. No new tool, most control.

**Chosen: fastlane 2.237.0, installed and configured 2026-08-02.**
Full detail in `apps/mobile/fastlane/README-asc.md` — read that before using it.

```bash
cd apps/mobile
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8   # fastlane requires UTF-8
fastlane verify_asc      # read-only auth check
fastlane builds          # list TestFlight builds
fastlane beta ipa:<path> # upload an existing .ipa
```

⚠️ **Blocked on `ASC_ISSUER_ID`** — a UUID only visible at App Store Connect →
Users and Access → Integrations. Not derivable from the key file.

⚠️ The `.p8` keys live OUTSIDE the repo at
`~/Crave/Crave Labs LLC/apple/` (mode 600). Only the _path_ is in
`apps/mobile/.env`. Three keys are there and only one is the ASC key —
ASC and APNs keys share the same `AuthKey_<ID>.p8` naming, so the filename
proves nothing. `verify_asc` is the discriminator.

⚠️ **Bundle id mismatch:** `app.config.js` says `com.crave.search`; the Xcode
project and RevenueCat both say `com.brandonkimble.cravesearch`. An Expo
prebuild would rewrite the native id from `app.config.js` and break
provisioning + the RevenueCat mapping. Resolve before first submission.

fastlane uploads; **EAS still builds** (`npx eas-cli build -p ios`).
