import { readFile } from "node:fs/promises";

const immutableImagePattern = /^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/;
const userManagedServiceAccountPattern = /^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/;
const defaultServiceAccountPattern = /(?:-compute@developer\.gserviceaccount\.com|@appspot\.gserviceaccount\.com)$/;

export async function validateCloudRunManifest(path, identityConfiguration = {}) {
  const { previewServiceAccount, productionServiceAccount } = identityConfiguration;
  if (!previewServiceAccount || !productionServiceAccount) {
    return { kind: "invalid", reason: "SERVICE_ACCOUNT_CONFIGURATION_REQUIRED" };
  }
  if (previewServiceAccount === productionServiceAccount) {
    return { kind: "invalid", reason: "DISTINCT_SERVICE_ACCOUNTS_REQUIRED" };
  }
  const configuredAccounts = [previewServiceAccount, productionServiceAccount];
  if (configuredAccounts.some((account) => !userManagedServiceAccountPattern.test(account) || defaultServiceAccountPattern.test(account))) {
    return { kind: "invalid", reason: "USER_MANAGED_SERVICE_ACCOUNTS_REQUIRED" };
  }
  const manifest = await readFile(path, "utf8");
  const images = [...manifest.matchAll(/^\s*-?\s*image:\s*(\S+)\s*$/gm)].map((match) => match[1]);
  if (images.length === 0 || images.some((image) => !immutableImagePattern.test(image))) {
    return { kind: "invalid", reason: "IMMUTABLE_IMAGE_DIGEST_REQUIRED" };
  }
  if (manifest.includes("${")) return { kind: "invalid", reason: "UNRESOLVED_MANIFEST_PLACEHOLDER" };
  const serviceAccountNames = [...manifest.matchAll(/^\s*serviceAccountName:\s*(\S+)\s*$/gm)].map((match) => match[1]);
  if (serviceAccountNames.length !== 1) {
    return { kind: "invalid", reason: "EXPLICIT_SERVICE_ACCOUNT_REQUIRED" };
  }
  const serviceNames = [...manifest.matchAll(/^\s{2}name:\s*(\S+)\s*$/gm)].map((match) => match[1]);
  const serviceName = serviceNames[0];
  const expectedServiceAccount = serviceName === "music-kg-fixture-api-preview"
    ? previewServiceAccount
    : serviceName === "music-kg-fixture-api"
      ? productionServiceAccount
      : undefined;
  if (expectedServiceAccount === undefined || serviceAccountNames[0] !== expectedServiceAccount) {
    return { kind: "invalid", reason: "ENVIRONMENT_SERVICE_ACCOUNT_MISMATCH" };
  }
  return { kind: "valid" };
}
