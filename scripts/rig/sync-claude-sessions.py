#!/usr/bin/env python3
"""Carry Claude Code desktop sessions across accounts, latest-content-wins.

    ./scripts/rig/sync-claude-sessions.py            # dry run: show what WOULD change
    ./scripts/rig/sync-claude-sessions.py --apply    # do it (backs up first)
    ./scripts/rig/sync-claude-sessions.py --verify    # audit only: dead/duplicate entries

For when one account runs out of usage and you switch to another: mirrors every
session from every local account into the CURRENT account, preferring the newest
copy, without ever clobbering live or divergent history.

The laws below were each learned by breaking them (2026-07-29):

1. `cp -n` IS THE ENEMY. No-clobber SKIPS sessions that already exist in the
   destination, which is exactly the stale-copy case you're trying to fix. The
   titles then look right while the conversations are old. Always compare
   `lastActivityAt` and take the newer.

2. local_*.json IS METADATA ONLY (a few KB). The conversation lives in
   ~/.claude/projects/<cwd-slug>/<cliSessionId>.jsonl. That store is NOT
   per-account, so syncing is only ever about pointing a session slot at the
   right cliSessionId. A session file whose cliSessionId has no .jsonl is a
   dead shell — it will open empty.

3. SAME SLOT, DIFFERENT cliSessionId = DIVERGENT BRANCHES, NOT A STALE COPY.
   Each account can continue the same session independently, forking the
   transcript. Overwriting then destroys real history — and if the slot is the
   conversation you're sitting in, it destroys THAT. So: same cliSessionId +
   newer activity -> update in place; different cliSessionId -> import as a NEW
   session entry (fresh sessionId) and leave the incumbent alone. Nothing is
   ever orphaned and the live chat is never touched.

4. PINS/STARS ARE GLOBAL, not per-account: claude_desktop_config.json ->
   preferences.epitaxyPrefs.{starred-local-code-sessions,dframe-local-slice.pinnedOrder},
   keyed by session id. They carry over for free — but a pin can point at a slot
   some other conversation has since reused, so a pinned title is not proof the
   pinned CONTENT is what you want. --verify reports that.

5. QUIT THE APP FIRST (Cmd-Q). A running app holds sessions in memory and
   flushes its own copies over yours on quit; config.json edits made while it
   runs vanish the same way. This script refuses to --apply while Claude is
   running unless you pass --force.
"""
import argparse
import datetime
import glob
import json
import os
import shutil
import subprocess
import sys
import uuid

SUPPORT = os.path.expanduser("~/Library/Application Support/Claude")
SESSIONS = os.path.join(SUPPORT, "claude-code-sessions")
PROJECTS = os.path.expanduser("~/.claude/projects")


def ts(ms):
    if not ms or ms <= 0:
        return "----- --:--"
    return datetime.datetime.fromtimestamp(ms / 1000).strftime("%m-%d %H:%M")


def load(path):
    try:
        with open(path) as fh:
            return json.load(fh)
    except Exception:
        return None


def transcript(cli):
    if not cli:
        return None
    hits = glob.glob(os.path.join(PROJECTS, "*", f"{cli}.jsonl"))
    return hits[0] if hits else None


def current_account():
    """The account the app will open as — config.json is the only authority."""
    cfg = load(os.path.join(SUPPORT, "config.json")) or {}
    uid = cfg.get("lastKnownAccountUuid")
    if not uid:
        sys.exit("config.json has no lastKnownAccountUuid — open the app once, then retry.")
    orgs = sorted(glob.glob(os.path.join(SESSIONS, uid, "*")))
    orgs = [d for d in orgs if os.path.isdir(d)]
    if not orgs:
        sys.exit(f"no org dir under {os.path.join(SESSIONS, uid)}")
    # Multiple orgs for one account: the most recently touched is the live one.
    return uid, max(orgs, key=os.path.getmtime)


def profile_dirs():
    out = []
    for acct in sorted(glob.glob(os.path.join(SESSIONS, "*"))):
        if not os.path.isdir(acct):
            continue
        for org in sorted(glob.glob(os.path.join(acct, "*"))):
            if os.path.isdir(org):
                out.append(org)
    return out


def sessions_in(d):
    out = {}
    for f in sorted(os.listdir(d)):
        if f.startswith("local_") and f.endswith(".json"):
            meta = load(os.path.join(d, f))
            if meta:
                out[f] = meta
    return out


def app_running():
    try:
        return subprocess.run(["pgrep", "-x", "Claude"], capture_output=True).returncode == 0
    except FileNotFoundError:
        return False


def plan_sync(dest):
    """(updates, imports) — law 3 decides which bucket each candidate lands in."""
    mine = sessions_in(dest)
    updates, imports = [], []
    for src in profile_dirs():
        if os.path.realpath(src) == os.path.realpath(dest):
            continue
        for fname, meta in sessions_in(src).items():
            incoming_cli = meta.get("cliSessionId")
            incoming_at = meta.get("lastActivityAt") or 0
            here = mine.get(fname)
            if here is None:
                imports.append((os.path.join(src, fname), meta, fname, "absent here"))
            elif here.get("cliSessionId") == incoming_cli:
                if incoming_at > (here.get("lastActivityAt") or 0):
                    updates.append((os.path.join(src, fname), meta, fname, here))
            else:
                # Divergent branch: import beside the incumbent, never over it.
                imports.append((os.path.join(src, fname), meta, fname, "divergent branch"))
    # Keep only the newest candidate per destination filename / per cliSessionId.
    best_u = {}
    for u in updates:
        k = u[2]
        if (u[1].get("lastActivityAt") or 0) > (best_u.get(k, (None, {"lastActivityAt": -1}))[1].get("lastActivityAt") or 0):
            best_u[k] = u
    have_cli = {m.get("cliSessionId") for m in mine.values()}
    best_i = {}
    for i in imports:
        cli = i[1].get("cliSessionId")
        if i[3] == "divergent branch" and cli in have_cli:
            continue  # that transcript is already reachable from some slot here
        prev = best_i.get(cli)
        if prev is None or (i[1].get("lastActivityAt") or 0) > (prev[1].get("lastActivityAt") or 0):
            best_i[cli] = i
    return list(best_u.values()), list(best_i.values())


def verify(dest):
    print(f"\n=== audit of {dest}")
    cfg = load(os.path.join(SUPPORT, "claude_desktop_config.json")) or {}
    ep = (cfg.get("preferences") or {}).get("epitaxyPrefs") or {}
    starred = set(ep.get("starred-local-code-sessions") or [])
    pinned = {p.split(":", 1)[-1] for p in (ep.get("dframe-local-slice") or {}).get("pinnedOrder") or []}

    dead, mism, ok = [], [], 0
    for fname, meta in sessions_in(dest).items():
        sid = fname[:-5]
        if meta.get("sessionId") != sid:
            mism.append((fname, meta.get("sessionId")))
        if transcript(meta.get("cliSessionId")):
            ok += 1
        else:
            dead.append((sid, meta.get("title"), sid in starred or sid in pinned))
    print(f"sessions: {ok} with a live transcript, {len(dead)} dead shells")
    for sid, title, is_pinned in sorted(dead, key=lambda x: -x[2]):
        print(f"  DEAD{' (PINNED!)' if is_pinned else ''}: {title}  [{sid[:26]}]")
    for fname, inner in mism:
        print(f"  ID MISMATCH: {fname[:34]} contains sessionId {str(inner)[:26]} (duplicate/broken entry)")

    print("\n--- pinned/starred: does the pin point at the content the title implies?")
    for sid in sorted(starred | pinned):
        meta = load(os.path.join(dest, sid + ".json"))
        if not meta:
            print(f"  MISSING FILE: {sid[:26]}")
            continue
        tp = transcript(meta.get("cliSessionId"))
        size = f"{os.path.getsize(tp) / 1e6:.1f}MB" if tp else "NO TRANSCRIPT"
        tag = "*" if sid in starred else " "
        print(f"  {tag} {ts(meta.get('lastActivityAt'))} {size:>12}  {meta.get('title')}")
    print("\nA pin whose transcript looks unrelated to its title means another")
    print("conversation reused that slot (law 3) — repoint the pin, don't re-copy.")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="actually write (default is a dry run)")
    ap.add_argument("--verify", action="store_true", help="audit only: dead shells, duplicates, pin sanity")
    ap.add_argument("--force", action="store_true", help="allow --apply while the Claude app is running")
    args = ap.parse_args()

    uid, dest = current_account()
    print(f"current account : {uid}")
    print(f"destination     : {dest}")
    others = [d for d in profile_dirs() if os.path.realpath(d) != os.path.realpath(dest)]
    print(f"source profiles : {len(others)}")

    if args.verify:
        verify(dest)
        return

    updates, imports = plan_sync(dest)
    print(f"\n=== {len(updates)} stale in place (same conversation, newer copy)")
    for _, meta, fname, here in updates:
        print(f"  {ts(here.get('lastActivityAt'))} -> {ts(meta.get('lastActivityAt'))}  {meta.get('title')}")
    print(f"\n=== {len(imports)} to import as new entries")
    for _, meta, fname, why in imports:
        tp = transcript(meta.get("cliSessionId"))
        size = f"{os.path.getsize(tp) / 1e6:.1f}MB" if tp else "NO TRANSCRIPT"
        print(f"  {ts(meta.get('lastActivityAt'))} {size:>12}  {meta.get('title')}  ({why})")

    if not args.apply:
        print("\nDRY RUN — nothing written. Re-run with --apply.")
        return
    if not updates and not imports:
        print("\nnothing to do.")
        return
    if app_running() and not args.force:
        sys.exit("\nClaude is RUNNING. Quit it (Cmd-Q) — a running app flushes its own\n"
                 "copies over yours on quit. Use --force only if you accept that.")

    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = os.path.join(SESSIONS, f".backup-{os.path.basename(dest)}-{stamp}")
    shutil.copytree(dest, backup)
    print(f"\nbackup: {backup}")

    for path, meta, fname, _ in updates:
        shutil.copy2(path, os.path.join(dest, fname))
        print(f"  updated  {meta.get('title')}")
    for path, meta, fname, why in imports:
        if why == "absent here":
            shutil.copy2(path, os.path.join(dest, fname))
            print(f"  imported {meta.get('title')}")
        else:
            new = "local_" + str(uuid.uuid4())
            meta = dict(meta)
            meta["sessionId"] = new
            meta["isArchived"] = False
            when = ts(meta.get("lastActivityAt")).split()[0]
            if "(branch" not in (meta.get("title") or ""):
                meta["title"] = f"{meta.get('title')} (branch {when})"
            with open(os.path.join(dest, new + ".json"), "w") as fh:
                json.dump(meta, fh, indent=1)
            print(f"  imported {meta['title']}  [new slot, incumbent untouched]")

    print("\nDone. Launch the app — pins/stars are global and carry over on their own.")
    print("Then run --verify to confirm no pin points at a slot another chat reused.")


if __name__ == "__main__":
    main()
