# Railway

Authed as Brandon Kimble. Project **Crave** (`4d4b68b5-1c41-49e3-9dfa-744b5dac6766`),
environment `production`. Services: `api`, `worker`, `postgis-db`, redis.

The CLI's _linked_ service is sticky and currently `postgis-db` — always pass
`-s <service>` explicitly rather than trusting the link.

```bash
railway status
railway logs -s api
railway variables -s api --kv          # NAME=value, greppable
railway run -s api -- <cmd>            # runs locally with prod env injected
```

⚠️ **Always pass `--kv` when checking whether a variable exists.** Bare
`railway variables` renders a box-drawing TABLE that wraps long values across
lines; a `grep` against it can match nothing and read as "the var is absent"
when it is present. This produced a wrong conclusion on 2026-08-01 — a
`RESEND_API_KEY` that _was_ set in prod got reported as missing. `--kv` gives
one `NAME=value` per line.

⚠️ **`railway run -s <svc> -- <cmd>` is the way to use a prod credential
without copying it.** It injects the service's env into a local process, so you
can exercise a prod key without it ever landing in a `.env` or on screen.

🚨 **`railway domain` with no arguments CREATES a domain — it does not list
one.** Run against the linked service, which is sticky and currently
`postgis-db`. On 2026-08-02 this accidentally published a public hostname
pointing at the production database (deleted immediately; the DB serves no HTTP
so nothing was actually exposed, but it was an unintended prod mutation).
**To READ domains, use the Railway MCP `list-domains`**, never the CLI verb.
Delete needs `--yes` in non-interactive mode.

**Prod vars ≠ `.env` vars.** They drift. A var absent locally may be set in
prod and vice versa; check both before concluding anything is unconfigured.

## Deploys: use the script, not `railway up`

```bash
./scripts/rig/deploy.sh [api|worker]
```

It encodes laws that are expensive to rediscover: repo-ROOT build context, push
main first, watch to terminal state, one retry, `/health` smoke.

**GOTCHA — the watchPattern guard silently skips CLI deploys.** With
`watchPatterns` set to `MANUAL-DEPLOYS-ONLY/never-matches`, every `railway up`
lands status **SKIPPED** with no error. To deploy: clear `watchPatterns` to `[]`
on api + worker, run deploy.sh, then restore the guard.

**GOTCHA — never add `startCommand` to railway.json.** It overrides the
Dockerfile CMD and is exec'd without a shell, so `&&` becomes argv and the
container exits 0 after the first command. Migrations self-apply at boot via
`prisma migrate deploy` in the Dockerfile CMD.

**GOTCHA — prod postgres has a small `/dev/shm`.** Heavy migrations must
`SET max_parallel_workers_per_gather = 0; SET max_parallel_maintenance_workers = 0;`
or they die on "could not resize shared memory segment" and P3009 crash-loop
the boot.

Prod also auto-deploys from GitHub — a push to `main` can deploy on its own.

## MCP alternative

The Railway MCP is loaded and gives typed responses; it's the better tool for
reading service config and setting variables. The CLI is the fallback and the
only path for `deploy.sh`.
