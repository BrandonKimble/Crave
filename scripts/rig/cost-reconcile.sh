#!/usr/bin/env bash
# @script-class: operational
# @run-by: CLAUDE.md, .claude/settings.json, the service-access + reextract
#     skills.
# LEDGER-vs-INVOICE RECONCILIATION (routine check, born 2026-07-30).
#
# THE BILLING TRUTH LIVES IN BIGQUERY: project crave-467301, dataset
# `billing_export`, table gcp_billing_export_resource_v1_01B5D1_11D0D6_23E783
# (partitioned by day; export lags up to ~24h). gcloud on this machine is
# authenticated as the owner. This was undocumented until the first
# reconciliation (2026-07-30) — which found the ledger EXACT to the cent on
# Places and within 5% on Gemini, but also found a $118 Places line the
# "all-in" report had missed because only the gemini column was summed.
#
# Run after any one-off spend event (reload, city onboarding, backfill) and
# ~monthly otherwise:   ./scripts/rig/cost-reconcile.sh [days]
set -euo pipefail
DAYS="${1:-1}"
BQ_TABLE='crave-467301.billing_export.gcp_billing_export_resource_v1_01B5D1_11D0D6_23E783'
# THE BILL COVERS THE WHOLE BILLING ACCOUNT, NOT ONE PROJECT — and that is the
# whole reason a $907 month once looked like a mystery (2026-09-03). Two
# projects bill here: `crave-467301` is PROD, `crave-dev-2026` is dev+staging
# (isolated keys, set up 2026-08-01). Everything below that compares billed
# against OUR LEDGER must be scoped to PROD, because the ledger only ever holds
# prod. Comparing an account-wide bill to a prod-only ledger is not a
# reconciliation; it is two different questions subtracted from each other.
PROD_PROJECT='crave-467301'

echo "== WHICH ENVIRONMENT SPENT IT (last ${DAYS}d) =="
echo "#  Answer this BEFORE reading any total. In Aug 2026 the account billed"
echo "#  \$907 and prod's share was \$6.67 — the rest was dev/staging. A bill"
echo "#  read without this split invites hunting a runaway prod job that does"
echo "#  not exist."
bq query --use_legacy_sql=false --format=pretty "
SELECT
  CASE project.id WHEN '${PROD_PROJECT}' THEN 'PROD' ELSE 'dev+staging' END AS env,
  project.id AS project,
  service.description AS service,
  ROUND(SUM(cost),2) AS billed_usd
FROM \`${BQ_TABLE}\`
WHERE usage_start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${DAYS} DAY)
GROUP BY 1,2,3 HAVING SUM(cost) > 0.05 ORDER BY 4 DESC"

echo "== GOOGLE BILLED — PROD ONLY (last ${DAYS}d, export may lag ~24h) =="
echo "#  Scoped to ${PROD_PROJECT} so it is the SAME GRAIN as the ledger below."
bq query --use_legacy_sql=false --format=pretty "
SELECT service.description AS service, sku.description AS sku, ROUND(SUM(cost),2) AS billed_usd
FROM \`${BQ_TABLE}\`
WHERE usage_start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${DAYS} DAY)
  AND project.id = '${PROD_PROJECT}'
GROUP BY 1,2 HAVING SUM(cost) > 0.05 ORDER BY 3 DESC"

echo "== OUR LEDGER (prod, same window) =="
# Capture THEN grep — `railway | grep -m1` closes the pipe early, railway
# dies of SIGPIPE (141), and pipefail turns a working lookup into a silent
# exit 1 (race: only when railway is still writing when grep quits).
RAILWAY_VARS=$(railway variables --service api --environment production --kv 2>/dev/null)
PRODURL=$(printf '%s\n' "$RAILWAY_VARS" | grep -m1 '^DATABASE_URL=' | cut -d= -f2-)
export PGPASSWORD=$(echo "$PRODURL" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')
# The laptop cannot resolve postgis-db.railway.internal — build the PROXY url
# for anything that dials from here (the psql below and --publish).
PROD_PROXY_URL="postgresql://postgres:${PGPASSWORD}@sakura.proxy.rlwy.net:48622/crave_search"
psql -h sakura.proxy.rlwy.net -p 48622 -U postgres -d crave_search -c "
SELECT service, operation, sku_tier, mode, count(*) AS calls,
  sum(input_tokens) AS in_tok, sum(cached_tokens) AS cached_tok,
  sum(output_tokens) AS out_tok, sum(duration_hours) AS storage_hrs
FROM api_usage_ledger
WHERE created_at >= now() - interval '${DAYS} days'
GROUP BY 1,2,3,4 ORDER BY 1,5 DESC;"

cat <<'NOTE'
== HOW TO JUDGE ==
- FIRST, read the environment split. The ledger is PROD ONLY, so only the
  prod-scoped billed table is comparable to it. dev+staging spend is real
  money and belongs in the monthly number, but it is NOT drift.
- Places: calls x list rate (essentials $2.83/1k autocomplete, pro $17/1k,
  enterprise $35/1k, enterprise+atmosphere $25/1k details) must match the
  billed SKU lines TO THE CENT — they did on 2026-07-30.
- Gemini: price the token sums via gemini-pricing.ts rates; expect within
  ~5% of billed (window edges + local same-key runs explain the gap).
- Cache storage: billed "cached text storage token hours" validates our
  $1.00/M token-hour rate (confirmed 2026-07-30: $5.37/day).
- ANY larger drift = the ledger is mis-metering somewhere. Reconcile line
  by line before trusting either number again.
NOTE

echo ""
echo "== VERDICT: ledger-vs-billed RATIO per vendor (the drift detector) =="
echo "#  ~1.00 = honest meter. Below 0.85 the ledger is UNDER-metering and"
echo "#  every cap/estimate built on it is silently loose — investigate the"
echo "#  SKU breakdown above. (History: July 2026 ran at 0.59 because the"
echo "#  cache registry + several pricing fixes were undeployed; the gap hid"
echo "#  for a month because nothing computed this number.)"
echo "#  Ledger-priced totals come from spend-analytics' pricers; recompute"
echo "#  manually if in doubt: BigQuery is the only truth."

# == THE FEEDBACK EDGE (round-six ideal shape) ==
# `--publish` (2nd arg) closes the loop: sums BILLED per vendor from BigQuery
# over the same window and writes the billed/ledger multiplier into
# spend_unit_costs (reconciliation.<vendor> / multiplier) on PROD — which
# prepareManifestEstimate reads to gross every estimate line to BILLED
# dollars. Ledger pricing happens in publish-reconciliation.ts with the SAME
# pricers the live meter uses; nothing here invents a rate.
if [[ "${2:-}" == "--publish" ]]; then
  echo ""
  echo "== PUBLISHING reconciliation multipliers to prod spend_unit_costs =="
  BILLED_GEMINI=$(bq query --use_legacy_sql=false --format=csv "
    SELECT ROUND(SUM(cost),2) FROM \`${BQ_TABLE}\`
    WHERE usage_start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${DAYS} DAY)
      AND project.id = '${PROD_PROJECT}'
      AND service.description LIKE '%Gemini%'" | tail -1)
  BILLED_PLACES=$(bq query --use_legacy_sql=false --format=csv "
    SELECT ROUND(SUM(cost),2) FROM \`${BQ_TABLE}\`
    WHERE usage_start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${DAYS} DAY)
      AND project.id = '${PROD_PROJECT}'
      AND service.description LIKE '%Places%'" | tail -1)
  echo "billed (PROD ONLY, ${PROD_PROJECT}): gemini=\$${BILLED_GEMINI:-0} places=\$${BILLED_PLACES:-0}"
  # THE LANDMINE THIS DEFUSES (2026-09-03). These two sums used to span the
  # whole billing account while the ledger they are divided by holds prod
  # alone, so the multiplier written into prod's spend_unit_costs would have
  # been the ratio of two different questions. On August's numbers that is
  # ~$840 billed against ~$6.67 of prod ledger — a ~125x multiplier applied to
  # every estimate prepareManifestEstimate produces. It never fired only
  # because --publish had not been run since dev got its own project; the
  # first run would have been silently catastrophic.
  # THE RECONCILER ROLE, not superuser (2026-08-04). ALLOW_REMOTE_DB is
  # GONE — the boot guard now probes actual privileges, and a laptop holding
  # a prod superuser handle is refused with no override. crave_reconciler
  # can write spend_unit_costs and NOTHING else (no INSERT on signals, no
  # superuser), so it passes the probe honestly: the guard admits it because
  # Postgres says it cannot do the catastrophic thing, not because an env
  # var promised it wouldn't.
  #
  # TomTom: not in BigQuery (not GCP). Its billed truth is the vendor
  # portal's invoice, read by a human — pass it explicitly when you have it:
  #   BILLED_TOMTOM_USD=12.34 scripts/rig/cost-reconcile.sh 30 --publish
  if [[ -z "${PROD_RECONCILER_PASSWORD:-}" ]]; then
    echo "PROD_RECONCILER_PASSWORD not set (source scripts/rig/svc-env.sh)"; exit 1
  fi
  RECONCILER_URL="postgresql://crave_reconciler:${PROD_RECONCILER_PASSWORD}@sakura.proxy.rlwy.net:48622/crave_search"
  TOMTOM_ARG=()
  if [[ -n "${BILLED_TOMTOM_USD:-}" ]]; then
    TOMTOM_ARG=(--billed-tomtom-usd "$BILLED_TOMTOM_USD")
  fi
  (cd "$(dirname "$0")/../../apps/api" && DATABASE_URL="$RECONCILER_URL" \
    npx ts-node scripts/publish-reconciliation.ts \
      --days "$DAYS" \
      --billed-gemini-usd "${BILLED_GEMINI:-0}" \
      --billed-places-usd "${BILLED_PLACES:-0}" \
      "${TOMTOM_ARG[@]}")
fi
