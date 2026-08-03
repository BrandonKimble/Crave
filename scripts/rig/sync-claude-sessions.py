#!/usr/bin/env python3
# @script-class: operational
# @run-by: run by hand by the owner; self-documenting
#     --dry-run/--apply/--verify interface.
"""Carry Claude Code desktop sessions across accounts, latest-content-wins.

    ./scripts/rig/sync-claude-sessions.py            # dry run: show what WOULD change
    ./scripts/rig/sync-claude-sessions.py --apply    # do it (backs up first)
    ./scripts/rig/sync-claude-sessions.py --verify   # audit only: dead/duplicate entries
    ./scripts/rig/sync-claude-sessions.py --dedupe   # collapse slots sharing one transcript
    ./scripts/rig/sync-claude-sessions.py --repin    # point pins at the best copy, order kept

You have several accounts and can arrive from any of them. This mirrors every
session from every OTHER local profile into the one the app is writing NOW,
preferring the best copy, without clobbering live or divergent history.

The laws below were each learned by breaking them (2026-07-29, revised 2026-08-02):

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
   session entry (fresh sessionId) and leave the incumbent alone.

4. NEVER IMPORT A TRANSCRIPT THAT IS ALREADY REACHABLE HERE. Law 3's "import as
   a new entry" must ALSO check cliSessionId against every slot in the
   destination, not just the same-named one. Skipping that check (the bug fixed
   2026-08-02) mints a second slot for a transcript you already have — the same
   chat appears twice, and a pin sits on one twin while you click the other.

5. QUIT THE APP FIRST (Cmd-Q), AND THE REASON IS THE *SOURCES*, NOT THE
   DESTINATION. A running app holds each profile's metadata in memory and
   flushes on quit. Sync while it runs and you copy a profile's LAST-FLUSHED
   state: on 2026-08-02 this imported a 36.3MB 08-01 snapshot of a session whose
   live copy was 61.4MB from 08-02, because the owning profile had not flushed.
   The result looks like a successful sync and is silently a day stale.
   --force exists; it buys you stale sources. It is not a shortcut.

6. THE DESTINATION IS `lastKnownAccountUuid`, AND IT IS RIGHT. Do NOT infer the
   destination from which profile resolves the most pins, or from directory
   mtimes. The sidebar keeps showing the OLD account's pinned list after a
   switch, and this script's own writes bump mtimes — both "smarter" heuristics
   pick the account you just LEFT. The only cross-check used here is that the
   globally-newest session activity should live in the chosen profile (the app
   writes the current chat there); a disagreement is reported, never
   auto-resolved. Force with --dest when you truly mean another profile.

7. PINS ARE GLOBAL AND SLOT-KEYED, so they carry across accounts for free but
   never follow content: pinnedOrder holds `code:local_<sessionId>` strings, and
   both this script (law 3) and the app's own Fork button mint NEW slot ids. The
   pin therefore stays on the pre-fork copy while the newer one lands unpinned.
   --repin rewrites each entry IN PLACE — same list, same positions, so nothing
   moves in your sidebar — retargeting it at the best copy of that conversation.

8. THERE IS NO SAFE ONE-AXIS DEFINITION OF "THE BEST COPY". Ranking by size
   alone proposed dragging the live `Wave-4 audit and status (latest)` onto a
   fatter 07-27 branch; ranking by recency alone proposed dragging a 57MB main
   line onto a 15MB offshoot. Both were measured, not imagined. So the default
   policy is `safe`: move a pin only when the current target is a DEAD shell
   (nothing to lose) or the candidate wins on BOTH recency and size. Anything
   ambiguous keeps its pin and gets reported by --verify. `--repin-policy
   largest|newest` restores the one-axis behaviour when you want it.
"""
import argparse
import datetime
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import uuid

SUPPORT = os.path.expanduser("~/Library/Application Support/Claude")
SESSIONS = os.path.join(SUPPORT, "claude-code-sessions")
PROJECTS = os.path.expanduser("~/.claude/projects")
DESKTOP_CFG = os.path.join(SUPPORT, "claude_desktop_config.json")


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


def tsize(meta):
    p = transcript(meta.get("cliSessionId"))
    return os.path.getsize(p) if p else 0


def profile_dirs():
    out = []
    for acct in sorted(glob.glob(os.path.join(SESSIONS, "*"))):
        if not os.path.isdir(acct) or os.path.basename(acct).startswith("."):
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


def short(d):
    return f"{os.path.basename(os.path.dirname(d))[:8]}…/{os.path.basename(d)[:8]}…"


def app_running():
    """`pgrep -x Claude` returns nothing under a sandboxed shell even while the
    app is plainly running (proven 2026-08-02 — it let an --apply through that
    law 5 should have blocked). ps sees it, so ask ps and match the basename.
    If we cannot tell, assume it IS running: the safe answer is to refuse."""
    try:
        out = subprocess.run(["ps", "-Ao", "comm="], capture_output=True, text=True)
        if out.returncode != 0:
            return True
        return any(os.path.basename(l.strip()) == "Claude" for l in out.stdout.splitlines())
    except Exception:
        return True


# ---------------------------------------------------------------- destination

def destination(override):
    """Law 6: config.json names it; newest-activity only cross-checks."""
    if override:
        d = os.path.abspath(os.path.expanduser(override))
        if not os.path.isdir(d):
            sys.exit(f"--dest {d} is not a directory")
        return d
    cfg = load(os.path.join(SUPPORT, "config.json")) or {}
    uid = cfg.get("lastKnownAccountUuid")
    if not uid:
        sys.exit("config.json has no lastKnownAccountUuid — open the app once, then retry.")
    orgs = [d for d in sorted(glob.glob(os.path.join(SESSIONS, uid, "*"))) if os.path.isdir(d)]
    if not orgs:
        sys.exit(f"no org dir under {os.path.join(SESSIONS, uid)}")
    dest = max(orgs, key=os.path.getmtime)

    # Cross-check: the app writes the CURRENT chat into the live profile, so the
    # globally-newest lastActivityAt should be here. Report, never auto-switch.
    best, best_at = None, -1
    for p in profile_dirs():
        for meta in sessions_in(p).values():
            at = meta.get("lastActivityAt") or 0
            if at > best_at:
                best, best_at = p, at
    if best and os.path.realpath(best) != os.path.realpath(dest):
        print(f"!! config says {short(dest)} but the newest activity ({ts(best_at)}) is in")
        print(f"!! {short(best)}. Trusting config (law 6). Override with --dest if wrong.\n")
    return dest


# ------------------------------------------------------------------- pins

def pin_state():
    cfg = load(DESKTOP_CFG) or {}
    ep = (cfg.get("preferences") or {}).get("epitaxyPrefs") or {}
    order = (ep.get("dframe-local-slice") or {}).get("pinnedOrder") or []
    starred = ep.get("starred-local-code-sessions") or []
    return cfg, ep, order, starred


def preflight(dest, order):
    """Law 6/7: show the pinned list AS THE APP ORDERS IT, resolved here."""
    here = sessions_in(dest)
    print(f"\n=== pinned list resolved in {short(dest)} (compare to your sidebar)")
    shown = 0
    for i, p in enumerate(order, 1):
        sid = p.split(":", 1)[-1]
        meta = here.get(sid + ".json")
        if meta:
            print(f"{i:3}. {ts(meta.get('lastActivityAt'))} {tsize(meta)/1e6:7.1f}MB  {meta.get('title')}")
        else:
            elsewhere = [short(d) for d in profile_dirs() if os.path.exists(os.path.join(d, sid + ".json"))]
            print(f"{i:3}. {'—':>11} {'':>9}  (not in this profile; in {', '.join(elsewhere) or 'nowhere'})")
        shown += 1
        if shown >= 12:
            print(f"     … {len(order)-shown} more")
            break


def family(title):
    t = re.sub(r"\s*\((fork|branch)[^)]*\)", "", title or "")
    t = re.sub(r"\s*\(latest\)|\s*\(\d+-\d+ branch\)", "", t)
    return t.strip().lower()


def plan_repin(dest, order, policy):
    """Retarget each pin at the best copy of its conversation. Order preserved."""
    here = sessions_in(dest)
    pinset = {p.split(":", 1)[-1] for p in order}
    # Collapse slots that share a cliSessionId FIRST: they are one conversation
    # reached two ways (law 4), so they must offer a single candidate here —
    # otherwise two pins each grab a different twin and both point at one chat.
    # Doing it inside repin keeps --repin and --dedupe order-independent.
    by_cli = {}
    for fname, meta in here.items():
        cli = meta.get("cliSessionId") or fname
        prev = by_cli.get(cli)
        rank = (fname[:-5] in pinset, meta.get("lastActivityAt") or 0)
        if prev is None or rank > prev[0]:
            by_cli[cli] = (rank, fname[:-5], meta)
    fams = {}
    for _, sid, meta in by_cli.values():
        fams.setdefault(family(meta.get("title")), []).append((sid, meta))
    key = (lambda m: tsize(m)) if policy == "largest" else (lambda m: m.get("lastActivityAt") or 0)

    # Two pins in one family must not collapse onto the same slot, or you get the
    # same conversation pinned twice and lose the other one entirely. Every slot
    # already spoken for — by a pin we are leaving alone, or by an earlier
    # retarget — is off the table.
    claimed = {p.split(":", 1)[-1] for p in order}

    moves = []
    for idx, p in enumerate(order):
        sid = p.split(":", 1)[-1]
        cur = here.get(sid + ".json")
        if not cur:
            continue
        cands = [c for c in fams.get(family(cur.get("title")), []) if c[0] == sid or c[0] not in claimed]
        if len(cands) < 2:
            continue
        best_sid, best_meta = max(cands, key=lambda c: key(c[1]))
        if best_sid == sid:
            continue
        if policy == "safe":
            # Move only when there is no judgement call to make: the pin is on a
            # dead shell (nothing to lose), or the candidate beats it on BOTH
            # axes. "Bigger" alone drags an active chat onto a fat old branch;
            # "newer" alone drags it onto a thin new one. Ambiguous -> leave it,
            # and let --verify report it rather than guessing wrong silently.
            newer = (best_meta.get("lastActivityAt") or 0) > (cur.get("lastActivityAt") or 0)
            bigger = tsize(best_meta) > tsize(cur)
            if not (tsize(cur) == 0 or (newer and bigger)):
                continue
        elif not key(best_meta) > key(cur):
            continue
        claimed.discard(sid)
        claimed.add(best_sid)
        moves.append((idx, sid, cur, best_sid, best_meta))
    return moves


# ------------------------------------------------------------------ dedupe

def plan_dedupe(dest, pinset):
    """Slots sharing a cliSessionId are the same conversation twice (law 4)."""
    by_cli = {}
    for fname, meta in sessions_in(dest).items():
        cli = meta.get("cliSessionId")
        if cli:
            by_cli.setdefault(cli, []).append((fname, meta))
    drops = []
    for cli, v in by_cli.items():
        if len(v) < 2:
            continue
        # Keep a pinned slot if there is one, else the newest-activity slot.
        v.sort(key=lambda x: (x[0][:-5] in pinset, x[1].get("lastActivityAt") or 0), reverse=True)
        keep = v[0]
        for fname, meta in v[1:]:
            if fname[:-5] in pinset:
                continue  # never delete a pinned slot; repin handles it
            drops.append((fname, meta, keep[1].get("title")))
    return drops


# -------------------------------------------------------------------- sync

def plan_sync(dest):
    """(updates, imports) — laws 1, 3 and 4."""
    mine = sessions_in(dest)
    have_cli = {m.get("cliSessionId") for m in mine.values() if m.get("cliSessionId")}
    updates, imports = [], []
    for src in profile_dirs():
        if os.path.realpath(src) == os.path.realpath(dest):
            continue
        for fname, meta in sessions_in(src).items():
            incoming_cli = meta.get("cliSessionId")
            incoming_at = meta.get("lastActivityAt") or 0
            here = mine.get(fname)
            if here is not None and here.get("cliSessionId") == incoming_cli:
                if incoming_at > (here.get("lastActivityAt") or 0):
                    updates.append((os.path.join(src, fname), meta, fname, here))
                continue
            # Law 4: never import a transcript already reachable in this profile.
            if incoming_cli in have_cli:
                continue
            why = "absent here" if here is None else "divergent branch"
            imports.append((os.path.join(src, fname), meta, fname, why))

    best_u = {}
    for u in updates:
        k = u[2]
        prev = best_u.get(k)
        if prev is None or (u[1].get("lastActivityAt") or 0) > (prev[1].get("lastActivityAt") or 0):
            best_u[k] = u
    best_i = {}
    for i in imports:
        cli = i[1].get("cliSessionId")
        prev = best_i.get(cli)
        if prev is None or (i[1].get("lastActivityAt") or 0) > (prev[1].get("lastActivityAt") or 0):
            best_i[cli] = i
    return list(best_u.values()), list(best_i.values())


def verify(dest, order, starred):
    print(f"\n=== audit of {short(dest)}")
    pinset = {p.split(":", 1)[-1] for p in order} | set(starred)
    dead, mism, ok = [], [], 0
    for fname, meta in sessions_in(dest).items():
        sid = fname[:-5]
        if meta.get("sessionId") != sid:
            mism.append((fname, meta.get("sessionId")))
        if transcript(meta.get("cliSessionId")):
            ok += 1
        else:
            dead.append((sid, meta.get("title"), sid in pinset))
    print(f"sessions: {ok} with a live transcript, {len(dead)} dead shells")
    for sid, title, is_pinned in sorted(dead, key=lambda x: -x[2]):
        print(f"  DEAD{' (PINNED!)' if is_pinned else ''}: {title}  [{sid[:26]}]")
    for fname, inner in mism:
        print(f"  ID MISMATCH: {fname[:34]} holds sessionId {str(inner)[:26]}")
    dups = plan_dedupe(dest, pinset)
    print(f"\nduplicate slots (same transcript twice): {len(dups)}  — fix with --dedupe")
    for fname, meta, kept in dups:
        print(f"  DUP: {meta.get('title')}   (keeping: {kept})")


def backup(dest):
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    path = os.path.join(SESSIONS, f".backup-{os.path.basename(dest)}-{stamp}")
    shutil.copytree(dest, path)
    print(f"\nbackup: {path}")
    return path


def write_pins(cfg, ep, order):
    shutil.copy2(DESKTOP_CFG, DESKTOP_CFG + ".bak")
    ep.setdefault("dframe-local-slice", {})["pinnedOrder"] = order
    cfg["preferences"]["epitaxyPrefs"] = ep
    with open(DESKTOP_CFG, "w") as fh:
        json.dump(cfg, fh, indent=1)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="actually write (default is a dry run)")
    ap.add_argument("--verify", action="store_true", help="audit only")
    ap.add_argument("--dedupe", action="store_true", help="collapse slots sharing one transcript")
    ap.add_argument("--repin", action="store_true", help="retarget pins at the best copy")
    ap.add_argument("--repin-policy", choices=("safe", "largest", "newest"), default="safe")
    ap.add_argument("--keep-pins", type=int, metavar="N",
                    help="drop every pin past the first N (the app's own order). Combine "
                         "with --repin so the survivors point at this profile's copies.")
    ap.add_argument("--dest", help="force a destination profile dir (law 6 escape)")
    ap.add_argument("--force", action="store_true", help="run while the app is up (buys stale sources)")
    args = ap.parse_args()

    dest = destination(args.dest)
    cfg, ep, order, starred = pin_state()
    print(f"destination : {dest}")
    print(f"sources     : {len([d for d in profile_dirs() if os.path.realpath(d) != os.path.realpath(dest)])} other profiles")
    print(f"pins        : {len(order)} pinned, {len(starred)} starred")

    if args.verify:
        preflight(dest, order)
        verify(dest, order, starred)
        return

    pinset = {p.split(":", 1)[-1] for p in order} | set(starred)
    updates, imports = ([], [])
    drops, moves = ([], [])
    if not (args.dedupe or args.repin or args.keep_pins):
        updates, imports = plan_sync(dest)
    if args.dedupe:
        drops = plan_dedupe(dest, pinset)
    if args.repin:
        moves = plan_repin(dest, order, args.repin_policy)

    preflight(dest, order)

    if not (args.dedupe or args.repin):
        print(f"\n=== {len(updates)} stale in place (same conversation, newer copy)")
        for _, meta, fname, here in updates:
            print(f"  {ts(here.get('lastActivityAt'))} -> {ts(meta.get('lastActivityAt'))}  {meta.get('title')}")
        print(f"\n=== {len(imports)} to import as new entries")
        for _, meta, fname, why in imports:
            print(f"  {ts(meta.get('lastActivityAt'))} {tsize(meta)/1e6:7.1f}MB  {meta.get('title')}  ({why})")
    if args.dedupe:
        print(f"\n=== {len(drops)} duplicate slots to remove")
        for fname, meta, kept in drops:
            print(f"  - {meta.get('title')}  (same transcript as: {kept})")
    if args.repin:
        print(f"\n=== {len(moves)} pins to retarget (policy: {args.repin_policy}; positions unchanged)")
        for idx, sid, cur, bsid, bmeta in moves:
            print(f"  #{idx+1:2} {cur.get('title')}")
            print(f"        {ts(cur.get('lastActivityAt'))} {tsize(cur)/1e6:6.1f}MB  ->  "
                  f"{ts(bmeta.get('lastActivityAt'))} {tsize(bmeta)/1e6:6.1f}MB  {bmeta.get('title')}")

    final = list(order)
    for idx, sid, cur, bsid, bmeta in moves:
        final[idx] = f"code:{bsid}"
    if args.keep_pins:
        dropped = final[args.keep_pins:]
        final = final[:args.keep_pins]
        here = sessions_in(dest)
        print(f"\n=== resulting pinned list: {len(final)} entries "
              f"({len(dropped)} dropped from the end)")
        for i, p in enumerate(final, 1):
            m = here.get(p.split(":", 1)[-1] + ".json")
            if m:
                print(f"{i:3}. {ts(m.get('lastActivityAt'))} {tsize(m)/1e6:7.1f}MB  {m.get('title')}")
            else:
                print(f"{i:3}. {'—':>11} {'':>9}  (STILL not in this profile — sync first)")
        print(f"\n--- dropping {len(dropped)}:")
        for p in dropped:
            m = here.get(p.split(":", 1)[-1] + ".json")
            print(f"     {(m or {}).get('title', '(unknown slot)')}")
        print("\nUnpinning does NOT delete anything — the sessions stay in the list.")

    if not args.apply:
        print("\nDRY RUN — nothing written. Re-run with --apply.")
        return
    if not (updates or imports or drops or moves or args.keep_pins):
        print("\nnothing to do.")
        return
    if app_running() and not args.force:
        sys.exit("\nClaude is RUNNING. Quit it (Cmd-Q) first — law 5: unflushed profiles\n"
                 "hand you a STALE copy and the sync silently succeeds a day behind.\n"
                 "--force accepts that risk.")

    backup(dest)
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
    for fname, meta, kept in drops:
        os.remove(os.path.join(dest, fname))
        print(f"  removed  {meta.get('title')}  (dup)")
    if moves or args.keep_pins:
        for idx, sid, cur, bsid, bmeta in moves:
            if idx < len(final):
                print(f"  repinned #{idx+1} -> {bmeta.get('title')}")
        write_pins(cfg, ep, final)
        print(f"  wrote pinnedOrder ({len(final)} entries); "
              f"backup at {os.path.basename(DESKTOP_CFG)}.bak")

    print("\nDone. Relaunch the app.")


if __name__ == "__main__":
    main()
