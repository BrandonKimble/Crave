#!/usr/bin/env bash
set -euo pipefail

fix_mode=0
if [[ "${1:-}" == "--fix" ]]; then
  fix_mode=1
  shift
fi

if [[ $# -lt 1 ]]; then
  echo "usage: $0 [--fix] <package-dir>" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="${1%/}"

cd "$REPO_ROOT"

staged_files=()
while IFS= read -r file; do
  staged_files+=("$file")
done < <(git diff --cached --name-only --diff-filter=ACMR -- "$PACKAGE_DIR")

if [[ ${#staged_files[@]} -eq 0 ]]; then
  exit 0
fi

lintable_files=()
relative_files=()

for file in "${staged_files[@]}"; do
  case "$file" in
    *.ts|*.tsx|*.js|*.jsx)
      lintable_files+=("$file")
      relative_files+=("${file#"$PACKAGE_DIR"/}")
      ;;
  esac
done

if [[ ${#lintable_files[@]} -eq 0 ]]; then
  exit 0
fi

eslint_cmd=(yarn eslint)
if [[ -x "$REPO_ROOT/$PACKAGE_DIR/node_modules/.bin/eslint" ]]; then
  eslint_cmd=("./node_modules/.bin/eslint")
fi

(
  cd "$PACKAGE_DIR"
  if [[ "$fix_mode" == "1" ]]; then
    "${eslint_cmd[@]}" --fix "${relative_files[@]}"
  else
    "${eslint_cmd[@]}" "${relative_files[@]}"
  fi
)

if [[ "$fix_mode" == "1" ]]; then
  git add -- "${lintable_files[@]}"
fi
