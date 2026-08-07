#!/usr/bin/env bash
# @script-class: gate
# @run-by: LOCAL/OPT-IN ONLY — per-push CI cannot build iOS (no macOS builder on
#     the push path), so this gate runs after any local simulator build that
#     follows a `yarn install` / `pod install` / rnmapbox patch change:
#       ./scripts/ios-camera-symbol-gate.sh [path/to/cravesearch.debug.dylib]
#     Default target: the standard DerivedData Debug-iphonesimulator dylib.
#     It is also the FINAL step of the CLAUDE.md build-trust recipe for any
#     session that touches the rnmapbox patch or the camera lane.
#
# D61/F1722. The camera lane's completion channel lives in the PATCHED
# @rnmapbox/maps pod (`onCameraAnimationComplete` + animationCompletionId). The
# 10.3.1 re-port silently shipped a patch whose native half never reached the
# binary: the installed dev client carried ZERO patch symbols, so every animated
# camera commit's completion could never arrive and the deferred JS state sync
# stranded (the F1716 stuck-map class) — and later the pod stopped COMPILING
# outright, unnoticed, because nothing checked the built artifact. This gate
# makes "the patch is really in the binary" a fact:
#   - the completion symbols MUST be present (the patch applied and compiled);
#   - the deleted host-registry symbols MUST be absent (D61 removed the second,
#     stale-replaying parker — it must not return).
# Xcode 16 puts app code in cravesearch.debug.dylib; the `cravesearch`
# executable is a thin shim containing none of the app's symbols (CLAUDE.md).
#
# RED-PROOF (how to check this gate is not lying): point it at a pre-repair
# dylib (one built before 2026-08-04, or any binary lacking the patch) — it
# must exit 1 on the completion-symbol check. Proven RED against the preserved
# pre-repair binary the day it was written.
set -euo pipefail

DEFAULT_DYLIB="$HOME/Library/Developer/Xcode/DerivedData/cravesearch-ebulueazabvxrcfekwsqmhnjeydn/Build/Products/Debug-iphonesimulator/cravesearch.app/cravesearch.debug.dylib"
DYLIB="${1:-$DEFAULT_DYLIB}"

if [[ ! -f "$DYLIB" ]]; then
  echo "[ios-camera-symbol-gate] FAIL: dylib not found: $DYLIB" >&2
  exit 1
fi

# TOOL PRECONDITION (F8700, 2026-08-07 — the F8500 class transposed from rg to
# nm/strings). Each check below was `nm/strings … 2>/dev/null | grep -c … ||
# true`. When the extractor is absent (127) or errors on a non-mach-O input, the
# pipeline yields empty → `grep -c` prints 0 → `|| true` flattens it — so the
# NEGATIVE ban (check 2) read "0 banned symbols → PASS" having inspected nothing;
# the banned host-registry symbols could be resurrected in the binary and this
# check would still read green. (Check 1, a PRESENCE test, happened to fail
# closed on 0, which co-mitigated it — but a negative ban must be sound on its
# OWN, not borrow a sibling's tool-presence guarantee that evaporates if that
# sibling is reordered or repointed.) Missing tooling is a FAILURE, never a pass.
for tool in nm strings; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "[ios-camera-symbol-gate] FAIL: \`$tool\` is not installed — cannot inspect the binary; refusing a green that means nothing." >&2
    exit 1
  fi
done

# Count matches of PATTERN in the output of EXTRACTOR over the dylib, proving the
# extractor actually ran (exit 0) before trusting the count. grep -c's own exit 1
# on zero matches is legitimate here — the tool ran and found none — so it is the
# only swallowed case; a broken extractor (any non-zero) is a hard failure.
count_matches() {
  local extractor="$1" pattern="$2"
  local raw status
  set +e
  raw="$("$extractor" "$DYLIB" 2>/dev/null)"
  status=$?
  set -e
  if [[ "$status" -ne 0 ]]; then
    echo "[ios-camera-symbol-gate] FAIL: \`$extractor\` exited $status on $DYLIB — cannot inspect the binary; a symbol check that could not run is a failure, never a pass." >&2
    exit 1
  fi
  grep -c "$pattern" <<<"$raw" || true
}

failures=0

# 1. Completion channel PRESENT — the patch's native half compiled into the app.
completion_count="$(count_matches nm "onCameraAnimationComplete")"
event_string_count="$(count_matches strings "cameraanimationcomplete")"
if [[ "$completion_count" -eq 0 || "$event_string_count" -eq 0 ]]; then
  echo "[ios-camera-symbol-gate] FAIL completion_channel_absent: onCameraAnimationComplete symbols=$completion_count, 'cameraanimationcomplete' strings=$event_string_count — the rnmapbox camera patch is NOT in this binary. Every animated camera commit will strand on its deferred state sync (F1716/F1722). Re-run yarn install (patch-package postinstall), pod install, and rebuild." >&2
  failures=$((failures + 1))
else
  echo "[ios-camera-symbol-gate] PASS completion_channel_present (symbols=$completion_count strings=$event_string_count)"
fi

# 2. Host-registry parker ABSENT — D61 deleted it (never-cleared pending = stale
#    replay); a resurrected registry would double-park underneath the arbiter.
registry_count="$(count_matches nm "ProfilePresentationCameraHostRegistry")"
camera_reject_count="$(count_matches strings "camera_command_unavailable")"
if [[ "$registry_count" -ne 0 || "$camera_reject_count" -ne 0 ]]; then
  echo "[ios-camera-symbol-gate] FAIL host_registry_resurrected: ProfilePresentationCameraHostRegistry symbols=$registry_count, camera_command_unavailable strings=$camera_reject_count — the deleted native camera fallback is back in the binary (D61 forbids it; the arbiter park-and-replay owns the hostless window)." >&2
  failures=$((failures + 1))
else
  echo "[ios-camera-symbol-gate] PASS host_registry_absent"
fi

if [[ "$failures" -gt 0 ]]; then
  echo "[ios-camera-symbol-gate] FAILED ($failures checks) on $DYLIB" >&2
  exit 1
fi
echo "[ios-camera-symbol-gate] OK: $DYLIB"
