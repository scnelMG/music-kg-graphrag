import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

const lockTimeoutMilliseconds = 120_000;

export function acquireBuildLock(lockPath) {
  const database = new DatabaseSync(lockPath, { timeout: lockTimeoutMilliseconds });
  try {
    database.exec("BEGIN EXCLUSIVE");
    database.exec("CREATE TABLE IF NOT EXISTS build_lock_owner (id INTEGER PRIMARY KEY CHECK(id = 1), token TEXT NOT NULL)");
    database.prepare("INSERT INTO build_lock_owner (id, token) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET token = excluded.token").run(randomUUID());
  } catch (error) {
    database.close();
    throw error;
  }
  return {
    release() {
      database.exec("COMMIT");
      database.close();
    }
  };
}
