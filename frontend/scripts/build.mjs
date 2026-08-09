import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { acquireBuildLock } from "./build-lock.mjs";

const frontendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = resolve(frontendDirectory, ".next-build.lock");

const lock = acquireBuildLock(lockPath);
try {
  const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
    cwd: frontendDirectory,
    env: process.env,
    stdio: "inherit"
  });
  process.exitCode = result.status ?? 1;
} finally {
  lock.release();
}
