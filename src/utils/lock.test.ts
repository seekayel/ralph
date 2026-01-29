import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  acquireLock,
  forceRemoveLock,
  isLocked,
  readLockInfo,
  releaseLock,
} from "./lock.js";

const TEST_DIR = join(import.meta.dirname, ".test-lock-temp");

describe("lock utility", () => {
  beforeEach(async () => {
    // Create test directory
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("acquireLock", () => {
    test("should acquire lock when no lock exists", async () => {
      const result = await acquireLock(TEST_DIR, "TEST-123", "run");

      expect(result.acquired).toBe(true);
      expect(result.existingLock).toBeUndefined();

      // Verify lock file was created
      const lockInfo = await readLockInfo(TEST_DIR);
      expect(lockInfo).toBeDefined();
      expect(lockInfo?.issueId).toBe("TEST-123");
      expect(lockInfo?.command).toBe("run");
      expect(lockInfo?.pid).toBe(process.pid);
    });

    test("should fail to acquire lock when lock already exists from this process", async () => {
      // First acquire
      await acquireLock(TEST_DIR, "TEST-123", "run");

      // Second acquire should succeed since it's the same process
      // (in practice, this is a stale lock check scenario)
      const result = await acquireLock(TEST_DIR, "TEST-456", "spawn");

      // Lock is not stale (same process running), so it should fail
      expect(result.acquired).toBe(false);
      expect(result.existingLock).toBeDefined();
      expect(result.existingLock?.issueId).toBe("TEST-123");
    });

    test("should create .ralph directory if it does not exist", async () => {
      const newDir = join(TEST_DIR, "subdir");
      await mkdir(newDir, { recursive: true });

      const result = await acquireLock(newDir, "TEST-123", "run");

      expect(result.acquired).toBe(true);

      // Verify .ralph directory was created
      const lockInfo = await readLockInfo(newDir);
      expect(lockInfo).toBeDefined();
    });

    test("should remove stale lock and acquire new lock", async () => {
      // Create a lock with a non-existent PID
      const ralphDir = join(TEST_DIR, ".ralph");
      await mkdir(ralphDir, { recursive: true });
      const lockPath = join(ralphDir, "lock");

      // Use a PID that definitely doesn't exist (very high number)
      const staleLockInfo = {
        pid: 999999999,
        startedAt: new Date().toISOString(),
        issueId: "OLD-123",
        command: "run",
      };
      await Bun.write(lockPath, JSON.stringify(staleLockInfo));

      // Try to acquire - should succeed since the process doesn't exist
      const result = await acquireLock(TEST_DIR, "NEW-456", "spawn");

      expect(result.acquired).toBe(true);
      expect(result.existingLock).toBeUndefined();

      // Verify new lock info
      const lockInfo = await readLockInfo(TEST_DIR);
      expect(lockInfo?.issueId).toBe("NEW-456");
    });
  });

  describe("releaseLock", () => {
    test("should release lock owned by current process", async () => {
      await acquireLock(TEST_DIR, "TEST-123", "run");

      // Verify lock exists
      expect(await isLocked(TEST_DIR)).toBe(true);

      // Release lock
      await releaseLock(TEST_DIR);

      // Verify lock is released
      expect(await isLocked(TEST_DIR)).toBe(false);
    });

    test("should not release lock owned by different process", async () => {
      // Create a lock with a different PID that exists (init process)
      const ralphDir = join(TEST_DIR, ".ralph");
      await mkdir(ralphDir, { recursive: true });
      const lockPath = join(ralphDir, "lock");

      const otherLockInfo = {
        pid: 1, // PID 1 typically exists (init)
        startedAt: new Date().toISOString(),
        issueId: "OTHER-123",
        command: "run",
      };
      await Bun.write(lockPath, JSON.stringify(otherLockInfo));

      // Try to release
      await releaseLock(TEST_DIR);

      // Lock should still exist (we didn't own it)
      const lockInfo = await readLockInfo(TEST_DIR);
      expect(lockInfo?.issueId).toBe("OTHER-123");
    });

    test("should handle no lock file gracefully", async () => {
      // Should not throw
      await releaseLock(TEST_DIR);
    });
  });

  describe("isLocked", () => {
    test("should return false when no lock exists", async () => {
      expect(await isLocked(TEST_DIR)).toBe(false);
    });

    test("should return true when lock exists and is not stale", async () => {
      await acquireLock(TEST_DIR, "TEST-123", "run");
      expect(await isLocked(TEST_DIR)).toBe(true);
    });

    test("should return false when lock is stale", async () => {
      // Create a lock with a non-existent PID
      const ralphDir = join(TEST_DIR, ".ralph");
      await mkdir(ralphDir, { recursive: true });
      const lockPath = join(ralphDir, "lock");

      const staleLockInfo = {
        pid: 999999999,
        startedAt: new Date().toISOString(),
        issueId: "OLD-123",
        command: "run",
      };
      await Bun.write(lockPath, JSON.stringify(staleLockInfo));

      expect(await isLocked(TEST_DIR)).toBe(false);
    });
  });

  describe("readLockInfo", () => {
    test("should return undefined when no lock exists", async () => {
      expect(await readLockInfo(TEST_DIR)).toBeUndefined();
    });

    test("should return lock info when lock exists", async () => {
      await acquireLock(TEST_DIR, "TEST-123", "run");

      const lockInfo = await readLockInfo(TEST_DIR);
      expect(lockInfo).toBeDefined();
      expect(lockInfo?.issueId).toBe("TEST-123");
      expect(lockInfo?.command).toBe("run");
      expect(lockInfo?.pid).toBe(process.pid);
      expect(lockInfo?.startedAt).toBeDefined();
    });

    test("should return undefined for malformed lock file", async () => {
      const ralphDir = join(TEST_DIR, ".ralph");
      await mkdir(ralphDir, { recursive: true });
      const lockPath = join(ralphDir, "lock");

      await Bun.write(lockPath, "not valid json");

      expect(await readLockInfo(TEST_DIR)).toBeUndefined();
    });
  });

  describe("forceRemoveLock", () => {
    test("should remove lock regardless of ownership", async () => {
      // Create a lock with a different PID
      const ralphDir = join(TEST_DIR, ".ralph");
      await mkdir(ralphDir, { recursive: true });
      const lockPath = join(ralphDir, "lock");

      const otherLockInfo = {
        pid: 1,
        startedAt: new Date().toISOString(),
        issueId: "OTHER-123",
        command: "run",
      };
      await Bun.write(lockPath, JSON.stringify(otherLockInfo));

      await forceRemoveLock(TEST_DIR);

      expect(await readLockInfo(TEST_DIR)).toBeUndefined();
    });

    test("should handle no lock file gracefully", async () => {
      // Should not throw
      await forceRemoveLock(TEST_DIR);
    });
  });
});
