# Legacy Cloud Run fixture API deployment

These templates are for the isolated fixture API only. They are not a deployment
contract for the active Notion-connected personal service. The connected service
uses the separately named `connected-production-service.yaml.tmpl` and
`connected-preview-service.yaml.tmpl` templates. It must use a server-side
Notion secret and the Vercel private-access boundary in
[`docs/connected-service-setup.md`](../../docs/connected-service-setup.md).
They keep Spring outside Vercel and keep both shared secrets in Google Secret Manager.
They are templates, not proof that a service exists.
Only deploy after an operator supplies an active Google Cloud account, project,
region, Artifact Registry repository, two Secret Manager secrets, and the two
approved Vercel origins.

## Connected personal service contract

The connected templates are intentionally separate from the fixture templates.
They run `MUSIC_KG_CONNECTED_MODE=connected`, read the Notion API key only from
Google Secret Manager, and require an explicit Notion data-source identifier
and property names at render time. The browser and Vercel never receive
`NOTION_API_KEY`.

They also require `PERSONAL_GRAPHDB_BASE_URL`,
`PERSONAL_GRAPHDB_VPC_NETWORK`, and `PERSONAL_GRAPHDB_VPC_SUBNETWORK` at render
time. Cloud Run uses Direct VPC egress for the private GraphDB endpoint, and
the repository is fixed to the separately named `music-kg-personal`; never
point it at the canonical fixture repository. This runtime dependency is
intentional: a missing or unreachable private graph returns a typed 503 rather
than silently replacing GraphRAG evidence with an in-memory approximation.

Use a separate, non-personal Notion data source for Preview. This prevents a
Preview deployment from reading or writing the records used by Production.
Give the Preview and Production Cloud Run service accounts access only to their
matching BFF and Notion secrets. The templates retain scale-to-zero, `maxScale`
of one, CPU throttling, and the no-JDBC Spring exclusions.

For Vercel, set `BACKEND_BASE_URL` and `BACKEND_BFF_SHARED_SECRET` as
server-only variables in the matching environment. Protect browser access with
Vercel Deployment Protection SSO rather than a second application-level shared
token. Do not store the Notion API key or either BFF secret in source control
or expose them as `NEXT_PUBLIC_*` variables.

Before a connected deployment, render the templates with `IMAGE_DIGEST`, the
matching Vercel origin, Cloud Run service account, Notion data-source ID,
Notion field names, and a MusicBrainz User-Agent. Run
`node scripts/test-validate-cloud-run-manifest.mjs` and deploy only the fully
rendered file through `scripts/deploy-cloud-run-service.mjs`. Creating the
Notion secrets, granting Secret Manager access, and replacing a Cloud Run
service are external state changes; they have not been performed by this
repository check.

The backend Dockerfile pins its Java 21 build and runtime stages to immutable
official Eclipse Temurin manifests. Their source records are the Docker Hub
pages for
[`21-jdk-jammy`](https://hub.docker.com/layers/library/eclipse-temurin/21-jdk-jammy/images/sha256-55fb9bf738f5d9b4a6c01b39337e3070d3e27370dd3c478fd1d5d3cd2233c6d8)
and
[`21-jre-jammy`](https://hub.docker.com/layers/library/eclipse-temurin/21-jre-jammy/images/sha256-3097cbbebb7d490494a98aed2301f284b38f79eba158eef098c6fc8c8af11c23).

## Build and resolve an immutable image

From the repository root, replace the uppercase placeholders without recording
credential values in shell history or logs:

```powershell
$project = gcloud config get-value project
$region = gcloud config get-value run/region
$tag = "$region-docker.pkg.dev/$project/music-kg/backend:task-12b"
gcloud builds submit backend --tag $tag
$digest = gcloud artifacts docker images describe $tag --format='value(image_summary.digest)'
$imageDigest = "$region-docker.pkg.dev/$project/music-kg/backend@$digest"
if ($imageDigest -notmatch '@sha256:[0-9a-f]{64}$') { throw 'IMMUTABLE_IMAGE_DIGEST_REQUIRED' }
```

Record only `$imageDigest`, never a secret. The service deploy must use this
`repository@sha256:...` reference, not the mutable tag.

## Configure and deploy

Create `music-kg-preview-bff-secret` and `music-kg-production-bff-secret` in
Secret Manager through an approved secret-entry channel. Create two distinct
user-managed service accounts and grant each identity access only to its
corresponding secret:

```powershell
gcloud iam service-accounts create music-kg-preview --project $project
gcloud iam service-accounts create music-kg-production --project $project
$env:CLOUD_RUN_PREVIEW_SERVICE_ACCOUNT = "music-kg-preview@$project.iam.gserviceaccount.com"
$env:CLOUD_RUN_PRODUCTION_SERVICE_ACCOUNT = "music-kg-production@$project.iam.gserviceaccount.com"
gcloud secrets add-iam-policy-binding music-kg-preview-bff-secret --project $project --member "serviceAccount:$env:CLOUD_RUN_PREVIEW_SERVICE_ACCOUNT" --role roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding music-kg-production-bff-secret --project $project --member "serviceAccount:$env:CLOUD_RUN_PRODUCTION_SERVICE_ACCOUNT" --role roles/secretmanager.secretAccessor
```

Do not use the Compute Engine default service account, an App Engine default
service account, or one shared identity for both environments. Configure
the matching value as Vercel's server-only `BACKEND_BFF_SHARED_SECRET` variable
for Preview or Production; configure `BACKEND_BASE_URL` only after Cloud Run
returns the service URL.

Render each `.yaml.tmpl` to a temporary file by substituting
`${IMAGE_DIGEST}`, the corresponding `${VERCEL_*_ORIGIN}`, and the matching
`${CLOUD_RUN_*_SERVICE_ACCOUNT}` value above. Deploy only
through the checked wrapper below. It reads the rendered manifest, rejects
unresolved placeholders and every image value that is not
`repository@sha256:<64 lowercase hex characters>`, and only then starts
`gcloud run services replace`. It also rejects missing, shared, default, or
environment-mismatched service accounts before starting `gcloud`:

```powershell
node scripts/deploy-cloud-run-service.mjs <rendered-preview.yaml> $region $project
gcloud run services add-iam-policy-binding music-kg-fixture-api-preview --region $region --project $project --member=allUsers --role=roles/run.invoker
node scripts/deploy-cloud-run-service.mjs <rendered-production.yaml> $region $project
gcloud run services add-iam-policy-binding music-kg-fixture-api --region $region --project $project --member=allUsers --role=roles/run.invoker
```

Do not invoke `gcloud run services replace` directly. The wrapper exits `2`
with `IMMUTABLE_IMAGE_DIGEST_REQUIRED` before starting `gcloud` when a mutable
tag remains in a rendered manifest. Both `CLOUD_RUN_*_SERVICE_ACCOUNT`
variables must remain set while invoking the wrapper so it can verify the
rendered identity for each environment.

The production fixture template is intentionally a scale-to-zero, request-only
service. It caps `autoscaling.knative.dev/maxScale` at `1`, enables
`run.googleapis.com/cpu-throttling`, and leaves `minScale` unset so Cloud Run's
zero-minimum default applies. Its existing `1` CPU and `512Mi` memory limits are
the repository-compatible Spring baseline. `SPRING_AUTOCONFIGURE_EXCLUDE`
disables JDBC datasource and Flyway auto-configuration because this public
fixture service has no PostgreSQL dependency. Keep these values in the rendered
manifest; removing them can reintroduce the datasource startup crash or the
former four-instance cost ceiling.

Public invocation is intentional: the application boundary must return a typed
401 when the BFF header is absent. The backend exposes no GraphDB or provider
route, and it contains deterministic fixture data only.

## Required deployment proof

Capture redacted outputs under `.omo/evidence/`:

```powershell
$url = gcloud run services describe music-kg-fixture-api --region $region --project $project --format='value(status.url)'
$revision = gcloud run services describe music-kg-fixture-api --region $region --project $project --format='value(status.latestReadyRevisionName)'
curl.exe -sS -o direct.json -w '%{http_code}' "$url/api/v1/health"
curl.exe -sS -H "X-Music-Kg-Bff-Secret: $env:BACKEND_BFF_SHARED_SECRET" "$url/api/v1/health"
```

The first request must be HTTP 401 with `BFF_AUTH_REQUIRED`; the authenticated
request must contain only `status` and `mode`. Then run the frontend BFF wire
tests and forced-outage scenario. Redact account email, project identifiers if
required by policy, request IDs, URLs if required, and all secret values. A URL,
revision, and digest may be claimed only when these commands actually return
them.
