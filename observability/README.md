# Observability Stack

## Quick Start

1. Start the full stack (API + Prometheus/Grafana/Loki/Promtail + backing stores):
   ```bash
   docker compose -f docker-compose.observability.yml up -d
   ```
   The compose file spins up Postgres, Redis, the API (hot-reloading against your working copy), plus the observability services. The API container uses `NODE_ENV=production` so console logs are JSON for Promtail.
2. Verify Prometheus can scrape the API at [http://localhost:9090/targets](http://localhost:9090/targets).
3. Sign in to Grafana at [http://localhost:3001](http://localhost:3001) (admin / admin) and open the **Crave Search Overview** dashboard.
4. Tail logs in Grafana Explore using the `Loki` datasource and a query such as `{app="crave-search-api"}`.

## Dashboards & Metrics

- **Crave Search Overview** (provisioned automatically) tracks:
  - P95 search execution latency split by format and `open_now` flag
  - Error throughput from `search_errors_total`
  - Queue depth for `keyword_search_execution` and `keyword_batch_processing`
  - Open-now filter drop rate via `search_open_now_filtered_count`
  - Recent `SearchService` log lines for context
- Prisma ORM instrumentation surfaces:
  - `prisma_query_duration_seconds` for slow queries by model/action
  - `prisma_query_errors_total` spikes when database exceptions occur
  - `prisma_in_flight_queries` to spot connection pool pressure
- Keyword ingestion counters cover on-demand vs scheduled enqueue volume, job failures, and per-job entity counts.

## Daily Workflow

1. **Morning health check**
   - Ensure the `crave-search-api` target is `UP` in Prometheus.
   - Review the Grafana dashboard for overnight spikes in latency, queue backlog, or error counts.
   - Scan Loki logs for WARN/ERROR entries with unusual `operation` or `subreddit` labels.
2. **While developing frontend features**
   - Keep Grafana open to watch `search_requests_total` and latency as you hit the API from the app.
   - Use Prometheus’ graph tab for ad-hoc queries (e.g., compare specific `format` combinations).
   - Investigate unexpected behaviour by jumping into Loki with the correlation ID emitted by the API response headers.
3. **Before wrapping up**
   - Confirm queues have drained (all statuses near zero) so enrichment isn’t backlogged.
   - Check Prisma error counter to ensure no DB instability was introduced.
   - Snapshot any relevant panels for sprint notes or to inform backend tweaks.

## Deployment Notes

- Production should run the same stack (Prometheus scraper, Grafana, Loki/Promtail or equivalent) with environment-specific dashboard folders.
- Set `PROMETHEUS_SCRAPE_ENDPOINT` firewall rules or service discovery as appropriate; the local compose scrapes the in-cluster `api:3000` service.
- Promtail expects JSON console logs; in containerized deployments set `LOG_CONSOLE=true` and avoid mounting log files unless needed for retention.
- When scaling to multiple pods, add identifying labels (`pod`, `region`, `env`) via promtail or the log driver so dashboards can filter by environment.

## Troubleshooting

- If `/metrics` returns HTTP 404, confirm the API is running a build that includes the `MetricsModule` (added in this branch).
- Queue gauges stuck at zero usually mean the Bull worker is idle; trigger `/search/run` or keyword scheduling to push jobs through before debugging instrumentation.
- Grafana provisioning errors can be inspected in the container logs (`docker logs crave-grafana`); most often it’s a YAML indentation issue or missing datasource UID.
