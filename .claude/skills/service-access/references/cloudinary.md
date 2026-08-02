# Cloudinary

`cld` v1.16.0 (pipx, at `~/.local/bin/cld`). Verified working.

Auth is `CLOUDINARY_URL`, derived by `svc-env.sh` from the three `.env` vars.
No `cld config` step, no credential file.

```bash
source scripts/rig/svc-env.sh
cld ping                          # {"status": "ok"}
cld usage                         # plan, credits, storage, bandwidth
cld admin resources max_results=10
cld search "resource_type:image AND uploaded_at>1d"
cld admin usage
```

`cld --help` and `cld admin --help` enumerate the rest; the CLI is a thin,
complete wrapper over the Admin + Upload APIs.

## Repo context

`CLOUDINARY_ENV_PREFIX` scopes assets per environment — **respect it when
searching or deleting**, or you will hit another environment's assets.
`CLOUDINARY_UPLOAD_PRESET` governs client uploads;
`CLOUDINARY_WEBHOOK_SECRET` signs notification callbacks.

Image strategy and open questions live in `product/images.md`.

## Confirm first

`cld admin destroy` / `delete_resources` are irreversible and delete real user
imagery. Never run a delete without explicit owner approval on that call.
Prefer `cld search` to scope the blast radius and show the owner the count
before proposing anything destructive.
