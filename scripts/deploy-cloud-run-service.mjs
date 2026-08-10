import { spawnSync } from "node:child_process";

import { validateCloudRunManifest } from "./validate-cloud-run-manifest.mjs";

const [manifest, region, project] = process.argv.slice(2);
if (manifest === undefined || region === undefined || project === undefined) {
  console.error("USAGE: node scripts/deploy-cloud-run-service.mjs <rendered-manifest> <region> <project>");
  process.exit(2);
}

const validation = await validateCloudRunManifest(manifest, {
  previewServiceAccount: process.env.CLOUD_RUN_PREVIEW_SERVICE_ACCOUNT,
  productionServiceAccount: process.env.CLOUD_RUN_PRODUCTION_SERVICE_ACCOUNT
});
if (validation.kind === "invalid") {
  console.error(validation.reason);
  process.exit(2);
}

const isWindows = process.platform === "win32";
const gcloudExecutable = isWindows ? "gcloud.cmd" : "gcloud";
const deployment = spawnSync(gcloudExecutable, [
  "run", "services", "replace", manifest,
  "--region", region,
  "--project", project
], { shell: isWindows, stdio: "inherit" });
if (deployment.error !== undefined) {
  console.error(deployment.error.message);
  process.exit(1);
}
process.exit(deployment.status ?? 1);
