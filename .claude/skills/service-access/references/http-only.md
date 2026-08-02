# TomTom, Mapbox, Reddit — curl only

None of these has a usable CLI. All three authenticate from `.env` and are
verified working.

## TomTom

No CLI exists (TomTom ships an MCP instead — already loaded, prefer it for
geocode/search/routing). For raw calls:

```bash
source scripts/rig/svc-env.sh
curl -s "https://api.tomtom.com/search/2/geocode/austin.json?key=$TOMTOM_API_KEY&limit=1" | jq .
```

`TOMTOM_GEOMETRY_ZOOM` is the repo's zoom setting for geometry fetches.

## Mapbox

`mapbox-cli-py` exists but the repo was **archived Feb 2025** and the SDK under
it is deprecated. Don't install it.

Token lives in `apps/mobile/.env` as `EXPO_PUBLIC_MAPBOX_TOKEN`; `svc-env.sh`
re-exports it as `MAPBOX_TOKEN`.

```bash
curl -s "https://api.mapbox.com/tokens/v2?access_token=$MAPBOX_TOKEN" | jq .
```

⚠️ It's an `EXPO_PUBLIC_` var — it ships in the client bundle and is public by
design. Scope-limited, but never treat it as a secret.

The custom iOS map is **shipped and precious** (~9.7k lines). Don't make map
changes as a side effect of anything else.

## Reddit

No official CLI; the community ones are wrappers. Script OAuth directly —
verified working (password grant, 200):

```bash
source scripts/rig/svc-env.sh
TOKEN=$(curl -s -X POST -A "$REDDIT_USER_AGENT" \
  -u "$REDDIT_CLIENT_ID:$REDDIT_CLIENT_SECRET" \
  -d "grant_type=password&username=$REDDIT_USERNAME&password=$REDDIT_PASSWORD" \
  https://www.reddit.com/api/v1/access_token | jq -r .access_token)

curl -s -H "Authorization: Bearer $TOKEN" -A "$REDDIT_USER_AGENT" \
  "https://oauth.reddit.com/r/austinfood/new?limit=5" | jq '.data.children[].data.title'
```

`REDDIT_USER_AGENT` is **required** on every call — Reddit 429s or blocks
requests without a descriptive one.

Historical bulk data comes from the local Pushshift archive
(`PUSHSHIFT_LOCAL_ARCHIVE_PATH`), not the API. The collector lives in
`apps/api/src/modules/content-processing/reddit-collector/`. Collection is
scheduled in prod — don't hand-run collection against the live API to "test"
without checking whether the scheduler is already doing it.
