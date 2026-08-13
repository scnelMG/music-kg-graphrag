import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

test("deployment wrapper selects the platform gcloud executable after validation", async () => {
  // Given a valid manifest and only the platform-specific gcloud executable on PATH
  const directory = await mkdtemp(join(tmpdir(), "music-kg-cloud-run-"));
  const manifest = join(directory, "service.yaml");
  const executable = join(directory, process.platform === "win32" ? "gcloud.cmd" : "gcloud");
  await writeFile(manifest, renderedManifest(), "utf8");
  await writeFile(executable, process.platform === "win32" ? "@exit /b 7\r\n" : "#!/bin/sh\nexit 7\n", "utf8");
  if (process.platform !== "win32") await chmod(executable, 0o755);

  try {
    // When the validated deployment wrapper starts its replacement process
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
        PATH: directory
      }
    });

    // Then the fake platform executable's observable exit status is propagated
    await assert.rejects(deployment, (error) => {
      assert.equal(error.code, 7);
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

test("production template preserves the fixture no-database and low-cost runtime profile", async () => {
  // Given the checked-in production Cloud Run template
  const template = await readFile(
    join(import.meta.dirname, "..", "deployment", "cloud-run", "production-service.yaml.tmpl"),
    "utf8"
  );

  // When an operator uses the template for a repeat deployment
  // Then it retains the live fixture no-database mode and scale-to-zero cost controls
  assert.match(template, /autoscaling\.knative\.dev\/maxScale: "1"/);
  assert.match(template, /run\.googleapis\.com\/cpu-throttling: "true"/);
  assert.match(
    template,
    /- name: SPRING_AUTOCONFIGURE_EXCLUDE\n\s+value: org\.springframework\.boot\.autoconfigure\.jdbc\.DataSourceAutoConfiguration,org\.springframework\.boot\.autoconfigure\.flyway\.FlywayAutoConfiguration/
  );
});

test("connected production template requires a server-side Notion secret and explicit connected mode", async () => {
  const template = await readFile(
    join(import.meta.dirname, "..", "deployment", "cloud-run", "connected-production-service.yaml.tmpl"),
    "utf8"
  );

  assert.match(template, /name: MUSIC_KG_CONNECTED_MODE\n\s+value: connected/);
  assert.match(template, /name: NOTION_API_KEY\n\s+valueFrom:\n\s+secretKeyRef:\n\s+name: music-kg-production-notion-api-key/);
  assert.match(template, /name: MUSIC_KG_API_CORS_ALLOWED_ORIGINS\n\s+value: \$\{VERCEL_PRODUCTION_ORIGIN\}/);
  assert.match(template, /name: NOTION_RELEASE_GROUP_MBID_FIELD\n\s+value: \$\{NOTION_RELEASE_GROUP_MBID_FIELD\}/);
  assert.match(template, /name: MUSICBRAINZ_USER_AGENT\n\s+value: "\$\{MUSICBRAINZ_USER_AGENT\}"/);
  assert.match(template, /name: MUSIC_KG_GRAPHDB_BASE_URL\n\s+value: \$\{PERSONAL_GRAPHDB_BASE_URL\}/);
  assert.match(template, /name: MUSIC_KG_GRAPHDB_REPOSITORY\n\s+value: music-kg-personal/);
  assert.match(template, /run\.googleapis\.com\/network-interfaces: '\[\{"network":"\$\{PERSONAL_GRAPHDB_VPC_NETWORK\}","subnetwork":"\$\{PERSONAL_GRAPHDB_VPC_SUBNETWORK\}"\}\]'/);
  assert.match(template, /run\.googleapis\.com\/vpc-access-egress: private-ranges-only/);
  assert.match(template, /autoscaling\.knative\.dev\/maxScale: "1"/);
  assert.match(template, /containerConcurrency: 1/);
  assert.match(template, /timeoutSeconds: 30/);
  assert.match(template, /name: MUSIC_KG_LLM_ENABLED\n\s+value: "false"/);
});

test("connected preview template quotes the operator MusicBrainz user agent", async () => {
  // Given an operator user agent that may contain YAML syntax such as a colon
  const template = await readFile(
    join(import.meta.dirname, "..", "deployment", "cloud-run", "connected-preview-service.yaml.tmpl"),
    "utf8"
  );

  // When the template is rendered for a Cloud Run deployment
  // Then the scalar remains a YAML string instead of becoming mapping syntax
  assert.match(template, /name: MUSICBRAINZ_USER_AGENT\n\s+value: "\$\{MUSICBRAINZ_USER_AGENT\}"/);
  assert.match(template, /name: MUSIC_KG_GRAPHDB_BASE_URL\n\s+value: \$\{PERSONAL_GRAPHDB_BASE_URL\}/);
  assert.match(template, /name: MUSIC_KG_GRAPHDB_REPOSITORY\n\s+value: music-kg-personal/);
  assert.match(template, /run\.googleapis\.com\/network-interfaces: '\[\{"network":"\$\{PERSONAL_GRAPHDB_VPC_NETWORK\}","subnetwork":"\$\{PERSONAL_GRAPHDB_VPC_SUBNETWORK\}"\}\]'/);
  assert.match(template, /run\.googleapis\.com\/vpc-access-egress: private-ranges-only/);
  assert.match(template, /containerConcurrency: 1/);
  assert.match(template, /timeoutSeconds: 30/);
  assert.match(template, /name: MUSIC_KG_LLM_ENABLED\n\s+value: "false"/);
});

test("connected templates render only when every server-side data binding is supplied", async () => {
  // Given the personal-service templates and environment-specific Notion data sources
  const directory = await mkdtemp(join(tmpdir(), "music-kg-cloud-run-"));
  const digest = `us-docker.pkg.dev/project/repo/backend@sha256:${"b".repeat(64)}`;
  const commonBindings = {
    "${IMAGE_DIGEST}": digest,
    "${NOTION_ALBUM_TITLE_FIELD}": "앨범명",
    "${NOTION_ARTIST_FIELD}": "가수",
    "${NOTION_COVER_FIELD}": "앨범커버",
    "${NOTION_SENTIMENT_FIELD}": "개인 감상평",
    "${NOTION_FAVOURITE_TRACK_FIELD}": "개인 최애곡",
    "${NOTION_OWNED_FIELD}": "앨범 보유",
    "${NOTION_RELEASE_GROUP_MBID_FIELD}": "MusicBrainz MBID",
    "${MUSICBRAINZ_USER_AGENT}": "music-kg-graphrag/1.0 (operator@example.invalid)",
    "${PERSONAL_GRAPHDB_BASE_URL}": "http://10.42.0.10:7200",
    "${PERSONAL_GRAPHDB_VPC_NETWORK}": "music-kg-private",
    "${PERSONAL_GRAPHDB_VPC_SUBNETWORK}": "music-kg-private-seoul"
  };
  const templates = [
    {
      path: join(import.meta.dirname, "..", "deployment", "cloud-run", "connected-preview-service.yaml.tmpl"),
      bindings: {
        "${CLOUD_RUN_PREVIEW_SERVICE_ACCOUNT}": previewServiceAccount,
        "${VERCEL_PREVIEW_ORIGIN}": "https://preview.example.invalid",
        "${NOTION_PREVIEW_DATA_SOURCE_ID}": "preview-data-source"
      }
    },
    {
      path: join(import.meta.dirname, "..", "deployment", "cloud-run", "connected-production-service.yaml.tmpl"),
      bindings: {
        "${CLOUD_RUN_PRODUCTION_SERVICE_ACCOUNT}": productionServiceAccount,
        "${VERCEL_PRODUCTION_ORIGIN}": "https://music.example.invalid",
        "${NOTION_PRODUCTION_DATA_SOURCE_ID}": "production-data-source"
      }
    }
  ];

  try {
    // When an operator renders each template with no client-side Notion credential
    for (const [index, template] of templates.entries()) {
      let rendered = await readFile(template.path, "utf8");
      for (const [placeholder, value] of Object.entries({ ...commonBindings, ...template.bindings })) {
        rendered = rendered.replaceAll(placeholder, value);
      }
      const manifest = join(directory, `connected-${index}.yaml`);
      await writeFile(manifest, rendered, "utf8");

      // Then the wrapper validator accepts the immutable, fully bound manifest
      assert.deepEqual(await validateCloudRunManifest(manifest, validIdentityConfiguration), { kind: "valid" });
      assert.doesNotMatch(rendered, /NOTION_API_KEY\n\s+value:/);
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
