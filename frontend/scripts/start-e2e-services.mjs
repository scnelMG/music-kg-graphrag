import { spawn, spawnSync } from "node:child_process";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendDirectory = resolve(scriptDirectory, "..");
const backendDirectory = resolve(frontendDirectory, "..", "backend");
const secret = "task-12b-local-e2e-secret";
const backendOutage = process.env.TASK12B_E2E_BACKEND_OUTAGE === "true";
const backendPort = process.env.TASK12_UI_E2E_BACKEND_PORT ?? "18080";
const e2ePort = process.env.TASK12_UI_E2E_PORT ?? "3100";
const nextDistDir = process.env.NEXT_DIST_DIR ?? ".next-e2e";
const children = [];
let stopping = false;

function startBackend() {
  const isWindows = process.platform === "win32";
  const command = isWindows ? "cmd.exe" : "./gradlew";
  const gradleArgs = ["bootRun", "--no-daemon", "--project-cache-dir", "../.tmp/task12b-e2e-gradle-cache"];
  const args = isWindows ? ["/d", "/s", "/c", "gradlew.bat", ...gradleArgs] : gradleArgs;
  return spawn(command, args, {
    cwd: backendDirectory,
    env: {
      ...process.env,
      BACKEND_BFF_SHARED_SECRET: secret,
      MUSIC_KG_CONNECTED_MODE: "fixture",
      PORT: backendPort,
      SPRING_AUTOCONFIGURE_EXCLUDE: "org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration,org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration"
    },
    stdio: "inherit"
  });
}

function backendReady() {
  return new Promise((resolveReady) => {
    const probe = request({
      headers: { "X-Music-Kg-Bff-Secret": secret },
      hostname: "127.0.0.1",
      method: "GET",
      path: "/api/v1/health",
      port: Number(backendPort),
      timeout: 500
    }, (response) => {
      response.resume();
      resolveReady(response.statusCode === 200);
    });
    probe.on("error", () => resolveReady(false));
    probe.on("timeout", () => {
      probe.destroy();
      resolveReady(false);
    });
    probe.end();
  });
}

async function waitForBackend() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await backendReady()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("LOCAL_E2E_BACKEND_START_TIMEOUT");
}

function stop(exitCode) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.pid === undefined) continue;
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  }
  process.exit(exitCode);
}

try {
  if (!backendOutage) {
    const backend = startBackend();
    children.push(backend);
    backend.on("exit", (code) => stop(code ?? 1));
    await waitForBackend();
  }
  const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", e2ePort], {
    cwd: frontendDirectory,
    env: {
      ...process.env,
      BACKEND_BASE_URL: backendOutage ? "http://127.0.0.1:1" : `http://127.0.0.1:${backendPort}`,
      BACKEND_BFF_SHARED_SECRET: secret,
      NEXT_DIST_DIR: nextDistDir
    },
    stdio: "inherit"
  });
  children.push(next);
  next.on("exit", (code) => stop(code ?? 1));
} catch (error) {
  console.error(error instanceof Error ? error.message : "LOCAL_E2E_START_FAILED");
  stop(1);
}

process.on("SIGINT", () => stop(130));
process.on("SIGTERM", () => stop(143));
