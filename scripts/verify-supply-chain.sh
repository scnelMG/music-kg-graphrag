#!/usr/bin/env bash
set -euo pipefail

mkdir -p sbom
if rg --quiet --hidden \
  --glob '!.git/**' \
  --glob '!*.example' \
  --glob '!*.invalid' \
  --glob '!pipeline/.venv/**' \
  --glob '!.uv-cache/**' \
  --glob '!pipeline/.pytest_cache/**' \
  --glob '!**/.pytest_cache/**' \
  '(?i)(api[_-]?key|token|password)\s*=\s*[^[:space:]#][^[:space:]#]+' .; then
  printf 'SECRET_PATTERN_DETECTED\n' >&2
  exit 2
fi
bash scripts/verify-image-digests.sh
(cd backend && bash gradlew cyclonedxBom --no-daemon)
uv --directory pipeline export --frozen --group dev --format requirements-txt --output-file ../sbom/python-requirements.txt
uv run --directory pipeline --group dev cyclonedx-py environment --output-reproducible --output-format json --output-file ../sbom/pipeline.cdx.json
cp backend/build/reports/application.cdx.json sbom/backend.cdx.json
printf 'SUPPLY_CHAIN_VALID: sbom/backend.cdx.json sbom/pipeline.cdx.json\n'
