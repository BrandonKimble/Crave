#!/usr/bin/env bash
# @script-class: gate
# @run-by: .github/workflows/ci.yml (job **native-tests**, step 'Static guard:
#     apps/mobile/ios is authoritative (anti-prebuild)'). There is no job named
#     mobile-native-authority — the header claimed one until 2026-08-04; the
#     guard lives in the macOS job because it needs `plutil`.
#
# D44/F1103. apps/mobile/ios/ is COMMITTED and AUTHORITATIVE (bare workflow);
# apps/mobile/app.json's `expo.ios` block is fossil that only `expo prebuild`
# reads. Prebuild would regenerate ios/ from app.json and thereby DELETE ~15k
# lines of owner-precious native code plus the entire shipped permission and
# privacy surface. This gate is the tripwire: if that ever happens (or a
# permission string silently diverges between the two sources of truth), CI
# goes red instead of a template shipping to the App Store.
#
# RED-PROOF (how to check this gate is not lying): delete any file from the
# PRESENCE list below, or change one of the two strings app.json duplicates,
# and re-run — it must exit 1 naming the exact item.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
IOS="$REPO_ROOT/apps/mobile/ios"
APP_JSON="$REPO_ROOT/apps/mobile/app.json"
INFO_PLIST="$IOS/cravesearch/Info.plist"

# Missing tooling is a FAILURE, never a pass (the lesson from
# no-bypass-search-runtime.sh's silent-green ripgrep bug).
for tool in plutil node; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "[native-authority] FAIL: '$tool' is not installed — this gate cannot verify anything." >&2
    exit 1
  fi
done

failures=0
checks=0

fail() {
  echo "[native-authority] FAIL: $1" >&2
  failures=$((failures + 1))
}

# ---------------------------------------------------------------------------
# 1. PRESENCE. The native surface prebuild would erase must exist.
# ---------------------------------------------------------------------------
PRESENCE=(
  "cravesearch/Info.plist"
  "cravesearch/PrivacyInfo.xcprivacy"
  "cravesearch/cravesearch.entitlements"
  "cravesearch/SearchMapRenderController.swift"
  "cravesearch/CraveBottomSheetHostView.swift"
  "cravesearch/UIFrameSamplerBridge.m"
  "MapLodKit/Package.swift"
  "MapLodKit/Sources/MapLodKit/LodEngine.swift"
  "TrackScrollKit"
  "Podfile"
  "cravesearch.xcodeproj/project.pbxproj"
)
for rel in "${PRESENCE[@]}"; do
  checks=$((checks + 1))
  [[ -e "$IOS/$rel" ]] || fail "apps/mobile/ios/$rel is MISSING — did something run \`expo prebuild\`?"
done

# ---------------------------------------------------------------------------
# 2. PLIST VALIDITY. A corrupt plist is a build/submission failure that no
#    other CI job would catch (nothing else parses these).
# ---------------------------------------------------------------------------
for rel in cravesearch/Info.plist cravesearch/PrivacyInfo.xcprivacy cravesearch/cravesearch.entitlements; do
  checks=$((checks + 1))
  plutil -lint "$IOS/$rel" >/dev/null 2>&1 || fail "apps/mobile/ios/$rel does not lint as a plist"
done

# ---------------------------------------------------------------------------
# 3. AGREEMENT. app.json duplicates two Info.plist purpose strings and one
#    entitlement value. Two sources of truth cannot be prevented cheaply, but
#    silent DIVERGENCE can be: if someone edits app.json expecting an effect,
#    this says out loud that the plist is what ships.
# ---------------------------------------------------------------------------
read_app_json() {
  node -e '
    const fs = require("fs");
    const j = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const path = process.argv[2].split(".");
    let v = j;
    for (const k of path) { v = v && v[k]; }
    process.stdout.write(v === undefined || v === null ? "" : String(v));
  ' "$APP_JSON" "$1"
}
# F8900: this was `plutil … || true`, which returns the empty string both when
# the key is genuinely absent (a real finding) and when plutil BROKE. The two
# are different facts. plutil exits 1 for a missing key; anything else means the
# plist could not be read at all, and a comparison against an unread plist is
# not evidence.
read_plist() {
  local out status
  set +e
  out="$(plutil -extract "$1" raw -o - "$INFO_PLIST" 2>&1)"
  status=$?
  set -e
  if [[ "$status" -eq 0 ]]; then
    printf '%s' "$out"
  elif [[ "$status" -eq 1 ]]; then
    printf ''
  else
    gate_fail_hard "plutil exited $status reading '$1' from $INFO_PLIST — the plist could not be read, so no comparison against it is evidence."
  fi
}

for key in NSLocalNetworkUsageDescription NSCameraUsageDescription; do
  checks=$((checks + 1))
  a="$(read_app_json "expo.ios.infoPlist.$key")"
  p="$(read_plist "$key")"
  if [[ -n "$a" && "$a" != "$p" ]]; then
    fail "$key disagrees: app.json says '$a', the AUTHORITATIVE Info.plist says '$p' (the plist is what ships)"
  fi
done

# ---------------------------------------------------------------------------
# 4. NO SILENT PLUGIN REINTRODUCTION. A non-empty `plugins` array in app.json
#    means someone is heading back toward prebuild; that is a deliberate
#    migration (see the `//` note in app.json), never a drive-by edit.
# ---------------------------------------------------------------------------
checks=$((checks + 1))
plugin_count="$(node -e '
  const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  process.stdout.write(String((j.expo && j.expo.plugins ? j.expo.plugins : []).length));
' "$APP_JSON")"
if [[ "$plugin_count" != "0" ]]; then
  fail "app.json expo.plugins is non-empty ($plugin_count) — config plugins only take effect through \`expo prebuild\`, which would delete apps/mobile/ios/. Read the '//' note in app.json."
fi

# ---------------------------------------------------------------------------
# 5. THE PREBUILD TRAP NOTE ITSELF MUST SURVIVE. The loudest part of this
#    defence is the note a human reads before typing the command.
# ---------------------------------------------------------------------------
checks=$((checks + 1))
if ! grep -q "DO NOT RUN .expo prebuild" "$APP_JSON"; then
  fail "the prebuild trap note ('//' key) is gone from app.json — restore it (D44/F1103)"
fi

if ((failures > 0)); then
  echo "[native-authority] $failures/$checks checks FAILED" >&2
  exit 1
fi
echo "[native-authority] OK — $checks checks passed (ios/ is authoritative and intact)"
