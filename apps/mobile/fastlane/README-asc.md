# App Store Connect setup

fastlane 2.237.0 (`brew install fastlane`). Lanes live in `Fastfile`; identity
in `Appfile`. Run from `apps/mobile`.

## Keys — outside the repo, by design

`/Users/brandonkimble/Crave/Crave Labs LLC/apple/` (mode 600, not in git):

| File                            | Key ID     | What it is                                                                  |
| ------------------------------- | ---------- | --------------------------------------------------------------------------- |
| `AuthKey_87UM3R85SH.p8`         | 87UM3R85SH | ✅ **App Store Connect API key** — confirmed 2026-08-02                     |
| `AuthKey_9G6G25Y63M.p8`         | 9G6G25Y63M | Sign in with Apple, for Clerk production SSO. **Not** for fastlane.         |
| `SubscriptionKey_73L9K7SFAR.p8` | 73L9K7SFAR | In-App Purchase key — RevenueCat StoreKit validation. **Not** for fastlane. |

ASC API keys and APNs keys share the `AuthKey_<KEYID>.p8` naming, so the file
name proves nothing. `87UM3R85SH` was settled empirically by `verify_asc`.

⚠️ **Open, unrelated:** the app ships `expo-notifications` and
`src/services/push-permission.ts`, so push needs an **APNs key** — and none of
the three keys in the vault is one. Either Expo holds a separate key
(`eas credentials -p ios`, interactive-only) or push is not yet provisioned.

## Config

In `apps/mobile/.env` — path only, never the key contents:

```
ASC_KEY_ID=87UM3R85SH
ASC_ISSUER_ID=<uuid from App Store Connect>
ASC_PRIVATE_KEY_PATH=/Users/brandonkimble/Crave/Crave Labs LLC/apple/AuthKey_87UM3R85SH.p8
```

The **issuer ID** is a UUID, not on the key file. Get it at App Store Connect →
Users and Access → Integrations → App Store Connect API; it is displayed once
at the top of the key list and is the same for every key in the team.

## Verify

```bash
cd apps/mobile
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8   # fastlane requires a UTF-8 locale
set -a; . ./.env; set +a
fastlane verify_asc
```

- `✅ Authenticated. App: …` — done.
- "Key authenticated, but no app record found" — key is good; the app record
  doesn't exist in ASC yet. Create it, or run `produce`.
- `401 NOT_AUTHORIZED` — wrong key or wrong issuer id. Try `9G6G25Y63M`; if
  neither works, generate a fresh ASC API key.

## ✅ Bundle identifier — settled 2026-08-02

`com.brandonkimble.cravesearch` is canonical, because **App Store Connect holds
the app record under it**: app id `6793724490`, "Crave - Find what to eat".
Apple's record outranks every local file.

`app.config.js` said `com.crave.search` and was corrected. The Xcode project,
every maestro flow, and the RevenueCat project already agreed.

⚠️ `app.config.js` still declares `android.package = 'com.crave.search'`. Left
alone deliberately — nothing external registers it yet, so it is an open owner
choice, not a mismatch. Settle it before any Play Console listing.

Override without editing files: `ASC_APP_BUNDLE_ID`, `ASC_TEAM_ID`.

## Lanes

| Lane              | Does                                  |
| ----------------- | ------------------------------------- |
| `verify_asc`      | read-only auth check                  |
| `builds`          | list TestFlight builds                |
| `beta ipa:<path>` | upload an existing .ipa to TestFlight |

`beta` uploads only — it does not build. EAS still builds the binary
(`npx eas-cli build -p ios`); fastlane handles what EAS can't: TestFlight
groups, metadata, and subscription products.

Team ID `FDT67MY727`. Auth is JWT — no Apple ID password, no 2FA prompt.
