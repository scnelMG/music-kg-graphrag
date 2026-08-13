# Scripts Scaffold

Local developer scripts live here.

Current commands:

```bash
bash scripts/check-env.sh .env
bash scripts/verify-image-digests.sh
bash scripts/verify-supply-chain.sh
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File scripts\run-connected-smoke.ps1 -Mode connected -CheckOnly
```

The env checker is intentionally strict: required variables must exist, must be non-empty, and must not contain obvious placeholder values such as `replace-with-*`. It reports only variable names, never values. Running it against `.env.example` is expected to fail until the template has been copied and populated.

Future scripts should prefer fixture/dry-run behavior by default and avoid live external writes unless a later todo explicitly enables them.

`run-connected-smoke.ps1` is read-only. It validates connected-mode configuration and, when given an HTTPS service URL, checks authenticated `/api/v1/health` and `/api/v1/ready` without printing the BFF secret. Set `NOTION_PRODUCTION_DATA_SOURCE_ID` in an E2E environment file; the command refuses an environment that targets that production data source unless `-AllowProductionNotionWrite` is explicit.

`run-connected-notion-e2e.ps1` is the separate mutation proof. It is plan-only unless `-Execute` is passed, refuses when `NOTION_DATA_SOURCE_ID` equals `NOTION_PRODUCTION_DATA_SOURCE_ID`, selects only an album absent from that test data source, verifies a real MusicBrainz track, and leaves the created test page archived at the end. Run it only against a dedicated Cloud Run environment configured with that same dedicated Notion data source.
## 개인 그래프 동기화

`sync-personal-graph.ps1`는 Notion을 변경하지 않고 private GraphDB 추천 스냅샷만 갱신합니다.
실행 전 현재 PowerShell 프로세스에 `BACKEND_BFF_SHARED_SECRET`를 설정하고, 백엔드 URL만 인자로
전달합니다. `Incremental`은 변경 시각 이후의 기록만 반영하고, `Reconcile`은 Notion에서 서비스 밖으로
보관한 기록을 정리하기 위한 명시적 전체 대조입니다. 스크립트는 비밀값·페이지 ID·GraphDB 주소를 출력하지
않고 상태, 마지막 성공 시각, 변경 건수만 JSON으로 반환합니다.

```powershell
.\scripts\sync-personal-graph.ps1 -Mode Incremental -BackendBaseUrl https://your-service.run.app
```
