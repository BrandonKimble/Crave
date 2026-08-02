# Google Cloud — billing, Gemini, Places

`gcloud` is authed as the project owner. Project **`crave-467301`**.
This one login covers the console, BigQuery, Gemini, and Places — none of those
need a separate CLI.

```bash
gcloud config list
gcloud services list --enabled
```

## The real bill lives in BigQuery

```
project  crave-467301
dataset  billing_export
table    gcp_billing_export_resource_v1_01B5D1_11D0D6_23E783
```

The export **lags ~24h**. `api_usage_ledger` in our own DB is the live meter —
verified exact to the cent on Places and within 5% on Gemini.

```bash
bq query --use_legacy_sql=false 'SELECT service.description, SUM(cost) ...'
```

**A cost report is only as complete as the columns you sum.** The first "all-in"
reload figure missed a $118 Places line by summing Gemini only. Any one-off
estimate must carry BOTH lines: LLM (per-doc, measured) and Places
re-enrichment (~$0.028 per newly-created restaurant, measured 2026-07-30).

```bash
./scripts/rig/cost-reconcile.sh [days]
```

Run after every one-off spend event (reload, city onboarding, backfill) and
roughly monthly.

## Places and Gemini cost money per call

Both are billed per request, and both are reachable with the keys in
`apps/api/.env` (`GOOGLE_PLACES_API_KEY`, `LLM_API_KEY`). A loop here spends
real money. Details enterprise+atmosphere runs ~$25/1k, text search ~$35/1k.
Confirm with the owner before issuing anything beyond a single probe.

Related law: a restaurant grounded to a real `google_place_id` is expensive,
verified knowledge and is **never deleted** — re-creating one forces full Places
re-enrichment.
