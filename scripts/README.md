# Scripts Scaffold

Local developer scripts live here.

Current scripts:

```bash
bash scripts/check-env.example.sh .env
```

The env checker is intentionally strict: required variables must exist, must be non-empty, and must not contain obvious placeholder values such as `replace-with-*`. Running it against `.env.example` is expected to fail until the template has been copied and populated.

Future scripts should prefer fixture/dry-run behavior by default and avoid live external writes unless a later todo explicitly enables them.
