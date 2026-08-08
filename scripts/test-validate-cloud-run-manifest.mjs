import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { validateCloudRunManifest } from "./validate-cloud-run-manifest.mjs";

const execFileAsync = promisify(execFile);
const previewServiceAccount = "music-kg-preview@sample-project.iam.gserviceaccount.com";
const productionServiceAccount = "music-kg-production@sample-project.iam.gserviceaccount.com";
const validIdentityConfiguration = { previewServiceAccount, productionServiceAccount };

function renderedManifest({
  image = `us-docker.pkg.dev/project/repo/backend@sha256:${"a".repeat(64)}`,
  name = "music-kg-fixture-api-preview",
  serviceAccountName = previewServiceAccount
} = {}) {
  return `apiVersion: serving.knative.dev/v1\nkind: Service\nmetadata:\n  name: ${name}\nspec:\n  template:\n    spec:\n      serviceAccountName: ${serviceAccountName}\n      containers:\n        - image: ${image}\n`;
}

test("rejects a mutable image tag in a rendered Cloud Run manifest", async () => {
  // Given a rendered service manifest containing a mutable image tag
  const directory = await mkdtemp(join(tmpdir(), "music-kg-cloud-run-"));
  const manifest = join(directory, "service.yaml");
  await writeFile(manifest, renderedManifest({ image: "us-docker.pkg.dev/project/repo/backend:latest" }), "utf8");

  try {
    // When the deploy-path validator inspects it
    const validation = await validateCloudRunManifest(manifest, validIdentityConfiguration);

    // Then deployment is rejected before replacement
    assert.deepEqual(validation, { kind: "invalid", reason: "IMMUTABLE_IMAGE_DIGEST_REQUIRED" });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("accepts an immutable rendered image digest", async () => {
  // Given a fully rendered service manifest containing an immutable image reference
  const directory = await mkdtemp(join(tmpdir(), "music-kg-cloud-run-"));
  const manifest = join(directory, "service.yaml");
  await writeFile(manifest, renderedManifest(), "utf8");

  try {
    // When the deploy-path validator inspects it
    const validation = await validateCloudRunManifest(manifest, validIdentityConfiguration);

    // Then deployment may proceed with the exact digest
    assert.deepEqual(validation, { kind: "valid" });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("deploy command stops before gcloud replacement for a mutable image", async () => {
  // Given a rendered service manifest that still contains a tag
  const directory = await mkdtemp(join(tmpdir(), "music-kg-cloud-run-"));
  const manifest = join(directory, "service.yaml");
  await writeFile(manifest, renderedManifest({ image: "us-docker.pkg.dev/project/repo/backend:task-12b" }), "utf8");

  try {
    // When the deployment wrapper is invoked without a usable gcloud executable
    const deployment = execFileAsync(process.execPath, [
      join(import.meta.dirname, "deploy-cloud-run-service.mjs"),
      manifest,
      "us-central1",
      "project"
    ], {
      env: {
        ...process.env,
        CLOUD_RUN_PREVIEW_SERVICE_ACCOUNT: previewServiceAccount,
        CLOUD_RUN_PRODUCTION_SERVICE_ACCOUNT: productionServiceAccount,
        PATH: ""
      }
    });

    // Then digest validation fails before any replacement process can start
    await assert.rejects(deployment, (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stderr, /IMMUTABLE_IMAGE_DIGEST_REQUIRED/);
      return true;
    });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("rejects a rendered manifest with no explicit service account", async () => {
  // Given an otherwise valid manifest with no runtime identity
  const directory = await mkdtemp(join(tmpdir(), "music-kg-cloud-run-"));
  const manifest = join(directory, "service.yaml");
  await writeFile(manifest, renderedManifest().replace(/^\s*serviceAccountName:.*\n/m, ""), "utf8");

  try {
    // When the deploy-path validator inspects it
    const validation = await validateCloudRunManifest(manifest, validIdentityConfiguration);

    // Then replacement is rejected before Cloud Run can select its default identity
    assert.deepEqual(validation, { kind: "invalid", reason: "EXPLICIT_SERVICE_ACCOUNT_REQUIRED" });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("rejects identical preview and production service accounts", async () => {
  // Given two environment roles configured with the same runtime identity
  const directory = await mkdtemp(join(tmpdir(), "music-kg-cloud-run-"));
  const manifest = join(directory, "service.yaml");
  await writeFile(manifest, renderedManifest(), "utf8");

  try {
    // When the deploy-path validator inspects the role configuration
    const validation = await validateCloudRunManifest(manifest, {
      previewServiceAccount,
      productionServiceAccount: previewServiceAccount
    });

    // Then shared cross-environment secret access is rejected
    assert.deepEqual(validation, { kind: "invalid", reason: "DISTINCT_SERVICE_ACCOUNTS_REQUIRED" });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("rejects a default Compute Engine service account", async () => {
  // Given preview configured with the project's default compute identity
  const directory = await mkdtemp(join(tmpdir(), "music-kg-cloud-run-"));
  const manifest = join(directory, "service.yaml");
  const defaultAccount = "123456789-compute@developer.gserviceaccount.com";
  await writeFile(manifest, renderedManifest({ serviceAccountName: defaultAccount }), "utf8");

  try {
    // When the deploy-path validator inspects it
    const validation = await validateCloudRunManifest(manifest, {
      previewServiceAccount: defaultAccount,
      productionServiceAccount
    });

    // Then least-privilege policy rejects the platform default identity
    assert.deepEqual(validation, { kind: "invalid", reason: "USER_MANAGED_SERVICE_ACCOUNTS_REQUIRED" });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("deployment wrapper rejects missing service-account configuration before gcloud", async () => {
  // Given a fully rendered manifest but no explicit deployment identity variables
  const directory = await mkdtemp(join(tmpdir(), "music-kg-cloud-run-"));
  const manifest = join(directory, "service.yaml");
  await writeFile(manifest, renderedManifest(), "utf8");

  try {
    // When the deployment wrapper is invoked without a usable gcloud executable
    const deployment = execFileAsync(process.execPath, [
      join(import.meta.dirname, "deploy-cloud-run-service.mjs"),
      manifest,
      "us-central1",
      "project"
    ], {
      env: {
        ...process.env,
        CLOUD_RUN_PREVIEW_SERVICE_ACCOUNT: "",
        CLOUD_RUN_PRODUCTION_SERVICE_ACCOUNT: "",
        PATH: ""
      }
    });

    // Then identity validation fails before any replacement process can start
    await assert.rejects(deployment, (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stderr, /SERVICE_ACCOUNT_CONFIGURATION_REQUIRED/);
      return true;
    });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("preview and production templates render with their distinct configured identities", async () => {
  // Given the checked-in templates and two explicitly different user-managed identities
  const directory = await mkdtemp(join(tmpdir(), "music-kg-cloud-run-"));
  const digest = `us-docker.pkg.dev/project/repo/backend@sha256:${"a".repeat(64)}`;
  const templates = [
    {
      accountPlaceholder: "${CLOUD_RUN_PREVIEW_SERVICE_ACCOUNT}",
      expectedAccount: previewServiceAccount,
      originPlaceholder: "${VERCEL_PREVIEW_ORIGIN}",
      path: join(import.meta.dirname, "..", "deployment", "cloud-run", "preview-service.yaml.tmpl")
    },
    {
      accountPlaceholder: "${CLOUD_RUN_PRODUCTION_SERVICE_ACCOUNT}",
      expectedAccount: productionServiceAccount,
      originPlaceholder: "${VERCEL_PRODUCTION_ORIGIN}",
      path: join(import.meta.dirname, "..", "deployment", "cloud-run", "production-service.yaml.tmpl")
    }
  ];

  try {
    // When each template is rendered with its environment-specific configuration
    for (const [index, template] of templates.entries()) {
      const source = await readFile(template.path, "utf8");
      const manifest = join(directory, `service-${index}.yaml`);
      const rendered = source
        .replace("${IMAGE_DIGEST}", digest)
        .replace(template.originPlaceholder, "https://example.invalid")
        .replace(template.accountPlaceholder, template.expectedAccount);
      await writeFile(manifest, rendered, "utf8");

      // Then the same validator used by the wrapper accepts exactly that identity
      assert.deepEqual(await validateCloudRunManifest(manifest, validIdentityConfiguration), { kind: "valid" });
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
