import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, expect, test } from "vitest";

import { acquireBuildLock } from "../scripts/build-lock.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

test("recovers a persisted owner record without deleting the lock database", async () => {
  // Given a previous build left its durable owner record but no active database transaction
  const directory = await mkdtemp(resolve(tmpdir(), "task12-build-lock-"));
  temporaryDirectories.push(directory);
  const lockPath = resolve(directory, ".next-build.lock");
  const staleLock = new DatabaseSync(lockPath);
  staleLock.exec("CREATE TABLE build_lock_owner (id INTEGER PRIMARY KEY CHECK(id = 1), token TEXT NOT NULL); INSERT INTO build_lock_owner VALUES (1, 'stale-owner')");
  staleLock.close();

  // When a new build takes the exclusive SQLite transaction
  const lock = acquireBuildLock(lockPath);
  lock.release();

  // Then the lock database remains present for atomic kernel-managed recovery
  await expect(access(lockPath)).resolves.toBeUndefined();
});
