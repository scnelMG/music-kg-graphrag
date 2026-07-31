#!/usr/bin/env bash
set -euo pipefail

output_file="$(mktemp)"
trap 'rm -f "$output_file"' EXIT

set +e
bash scripts/check-env.sh .env.invalid > "$output_file" 2>&1
status=$?
set -e

if [[ "$status" -eq 0 ]]; then
  printf 'INVALID_ENV_UNEXPECTED_SUCCESS\n' >&2
  exit 1
fi
if ! grep -Fq 'ENV_REQUIRED_MISSING' "$output_file"; then
  printf 'INVALID_ENV_EXPECTED_MARKER_MISSING\n' >&2
  exit 1
fi
if grep -Fq 'replace-with-' "$output_file"; then
  printf 'INVALID_ENV_VALUE_LEAK\n' >&2
  exit 1
fi
printf 'INVALID_ENV_CONTRACT_VERIFIED\n'
