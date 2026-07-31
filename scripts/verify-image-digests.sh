#!/usr/bin/env bash
set -euo pipefail

lock_file="deployment/image-digests.lock"
if [[ ! -s "$lock_file" ]]; then
  printf 'IMAGE_DIGEST_LOCK_MISSING\n' >&2
  exit 2
fi

while IFS='=' read -r name image; do
  [[ -z "$name" || "$name" == \#* ]] && continue
  if [[ ! "$image" =~ ^[a-z0-9./_-]+@sha256:[a-f0-9]{64}$ ]]; then
    printf 'IMAGE_DIGEST_INVALID: %s\n' "$name" >&2
    exit 2
  fi
done < "$lock_file"
printf 'IMAGE_DIGESTS_VALID: %s\n' "$lock_file"
