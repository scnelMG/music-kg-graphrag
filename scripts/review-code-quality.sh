#!/usr/bin/env bash
set -euo pipefail

python -m pipeline.review_code_quality --source . "$@"
