#!/usr/bin/env bash
set -euo pipefail

fixture='supply-chain-redaction-fixture'
log_file='.supply-chain-redaction-output'
secret="redaction-${RANDOM}-${RANDOM}"
trap '/usr/bin/rm -f "$fixture" "$log_file"' EXIT

printf '%s%s\n' 'API_KEY=' "$secret" > "$fixture"

set +e
bash scripts/verify-supply-chain.sh > "$log_file" 2>&1
status=$?
set -e

if [[ "$status" -eq 0 ]]; then
  printf 'REDACTION_TEST_EXPECTED_FAILURE\n' >&2
  exit 1
fi
if ! /usr/bin/grep -aFq 'SECRET_PATTERN_DETECTED' "$log_file"; then
  printf 'REDACTION_TEST_EXPECTED_MARKER_STATUS_%s\n' "$status" >&2
  exit 1
fi
if /usr/bin/grep -aFq "$secret" "$log_file"; then
  printf 'REDACTION_TEST_SECRET_LEAKED\n' >&2
  exit 1
fi
printf 'REDACTION_TEST_PASSED\n'
