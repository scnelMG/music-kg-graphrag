#!/usr/bin/env bash
set -euo pipefail

env_file="${1:-.env}"
if [[ ! -f "$env_file" ]]; then
  printf 'ENV_REQUIRED_MISSING: environment file\n' >&2
  exit 2
fi

required=(NOTION_DRY_RUN MUSICBRAINZ_USER_AGENT POSTGRES_HOST POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD GRAPHDB_BASE_URL LLM_PROVIDER)
missing=0
for key in "${required[@]}"; do
  value="$(sed -n -E "s/^${key}=//p" "$env_file" | head -n 1)"
  if [[ -z "$value" || "$value" == *replace-with-* ]]; then
    printf 'ENV_REQUIRED_MISSING: %s\n' "$key" >&2
    missing=1
  fi
done

if [[ "$missing" -ne 0 ]]; then
  exit 2
fi
printf 'ENV_VALID: required keys present\n'
