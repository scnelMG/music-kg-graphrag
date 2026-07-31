# Scripts Scaffold

Local developer scripts live here.

Current commands:

```bash
bash scripts/check-env.sh .env
bash scripts/verify-image-digests.sh
bash scripts/verify-supply-chain.sh
```

The env checker is intentionally strict: required variables must exist, must be non-empty, and must not contain obvious placeholder values such as `replace-with-*`. It reports only variable names, never values. Running it against `.env.example` is expected to fail until the template has been copied and populated.

Future scripts should prefer fixture/dry-run behavior by default and avoid live external writes unless a later todo explicitly enables them.
