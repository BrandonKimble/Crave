#!/usr/bin/env bash
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

echo "== GOOGLE BILLED (last ${DAYS}d, export may lag ~24h) =="
bq query --use_legacy_sql=false --format=pretty "
SELECT service.description AS service, sku.description AS sku, ROUND(SUM(cost),2) AS billed_usd
FROM \`${BQ_TABLE}\`
WHERE usage_start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${DAYS} DAY)
GROUP BY 1,2 HAVING SUM(cost) > 0.05 ORDER BY 3 DESC"

echo "== OUR LEDGER (prod, same window) =="
PRODURL=$(railway variables --service api --kv 2>/dev/null | grep -m1 '^DATABASE_URL=' | cut -d= -f2-)
export PGPASSWORD=$(echo "$PRODURL" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')
psql -h sakura.proxy.rlwy.net -p 48622 -U postgres -d crave_search -c "
SELECT service, operation, sku_tier, mode, count(*) AS calls,
  sum(input_tokens) AS in_tok, sum(cached_tokens) AS cached_tok,
  sum(output_tokens) AS out_tok, sum(duration_hours) AS storage_hrs
FROM api_usage_ledger
WHERE created_at >= now() - interval '${DAYS} days'
GROUP BY 1,2,3,4 ORDER BY 1,5 DESC;"

cat <<'NOTE'
== HOW TO JUDGE ==
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
