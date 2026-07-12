#!/bin/bash
# Exact stream-counts over the Austin pushshift archives → token + cost model.
# Pushshift zst uses long-window; decompress with --long=31.
set -euo pipefail
BASE="/Users/brandonkimble/Crave App/data/pushshift/archives"
OUT=/Users/brandonkimble/Crave/apps/api/scratchpad/austin-archive-counts.tsv
: > "$OUT"
for SUB in Austin AustinBeer askaustin austinfood; do
  for F in "$BASE/$SUB"/*.zst; do
    [ -f "$F" ] || continue
    NAME=$(basename "$F")
    # exact: lines + BODY-ish chars (body/selftext/title fields only, not raw JSON)
    zstd -dc --long=31 "$F" 2>/dev/null | python3 -c "
import sys, json
lines = 0; chars = 0; scored = 0
for line in sys.stdin:
    lines += 1
    try:
        o = json.loads(line)
    except Exception:
        continue
    body = (o.get('body') or '') + (o.get('selftext') or '') + (o.get('title') or '')
    chars += len(body)
    if (o.get('score') or 0) >= 2: scored += 1
print(f'$SUB\t$NAME\t{lines}\t{chars}\t{scored}')
" >> "$OUT"
    echo "done: $SUB/$NAME"
  done
done
echo "COUNTS COMPLETE"
cat "$OUT"
