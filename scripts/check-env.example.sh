#!/usr/bin/env bash
set -euo pipefail

env_file="${1:-.env}"

if [[ ! -f "$env_file" ]]; then
  echo "ERROR: env file not found: $env_file" >&2
  exit 2
fi

required_vars=(
  "NOTION_API_KEY"
  "NOTION_DATA_SOURCE_ID"
  "NOTION_ALBUM_TITLE_FIELD"
  "NOTION_ARTIST_FIELD"
  "NOTION_COVER_FIELD"
  "NOTION_SENTIMENT_FIELD"
  "NOTION_FAVOURITE_TRACK_FIELD"
  "NOTION_OWNED_FIELD"
  "MUSIC_KG_CONNECTED_MODE"
  "MUSICBRAINZ_USER_AGENT"
)

missing=()
placeholder=()

for name in "${required_vars[@]}"; do
  line="$(grep -E "^${name}=" "$env_file" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    missing+=("$name")
    continue
  fi

  value="${line#*=}"
  value="${value%$'\r'}"

  if [[ -z "$value" ]]; then
    missing+=("$name")
    continue
  fi

  case "$value" in
    replace-with-*|*replace-with-*|changeme|CHANGE_ME|todo|TODO)
      placeholder+=("$name")
      ;;
  esac
done

if ((${#missing[@]} > 0 || ${#placeholder[@]} > 0)); then
  echo "ERROR: invalid env file: $env_file" >&2
  if ((${#missing[@]} > 0)); then
    printf 'Missing required variables: %s\n' "${missing[*]}" >&2
  fi
  if ((${#placeholder[@]} > 0)); then
    printf 'Variables still using placeholders: %s\n' "${placeholder[*]}" >&2
  fi
  exit 1
fi

echo "OK: required environment variables are present in $env_file"
