#!/usr/bin/env bash
# Re-derive WHICH Gemini surfaces cost money, from the bill.
#
# SURFACE_BILLING in apps/api/src/modules/external-integrations/llm/
# gemini-billable-surfaces.ts declares each surface paid or free. That claim is
# about GOOGLE's billing, so no amount of local code can verify it — this is
# how you check. Run it when adding a surface, or when a vendor changes pricing.
#
# What to look for: every SKU should map to a surface already declared `paid`.
# A SKU family you cannot attribute means something bills that we do not gate.
# An absent family (no control-plane SKUs) is why get/list/cancel/delete are
# free. Cache STORAGE token-hours are the trap — they accrue while a cache
# LIVES, which is why deleteCache must never be gated: it stops the charge.
set -euo pipefail
DAYS="${1:-90}"
TABLE='crave-467301.billing_export.gcp_billing_export_resource_v1_01B5D1_11D0D6_23E783'
echo "Gemini SKUs billed in the last ${DAYS} days:"
bq query --nouse_legacy_sql --format=sparse --max_rows=100 "
SELECT sku.description AS sku, ROUND(SUM(cost), 4) AS cost_usd, COUNT(*) AS lines
FROM \`${TABLE}\`
WHERE service.description = 'Gemini API'
  AND usage_start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${DAYS} DAY)
GROUP BY 1 ORDER BY cost_usd DESC"
