import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { exists, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { clearSessionId, loadSessionId, saveSessionId } from "./session.js";

const TEST_DIR = "/tmp/ralph-session-test";

describe("session persistence", () => {
  beforeEach(async () => {
    if (await exists(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true });
    }
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    if (await exists(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true });
    }
  });

  describe("saveSessionId", () => {
    test("creates .ralph directory and saves session ID", async () => {
      const sessionId = "session-abc-123";
      await saveSessionId(TEST_DIR, sessionId);

      const sessionPath = join(TEST_DIR, ".ralph", "session");
      expect(await exists(sessionPath)).toBe(true);

      const content = await Bun.file(sessionPath).text();
      expect(content).toBe(sessionId);
    });

    test("overwrites existing session ID", async () => {
      await saveSessionId(TEST_DIR, "old-session");
      await saveSessionId(TEST_DIR, "new-session");

      const sessionPath = join(TEST_DIR, ".ralph", "session");
      const content = await Bun.file(sessionPath).text();
      expect(content).toBe("new-session");
    });

    test("handles session IDs with special characters", async () => {
      const sessionId = "session_2024-01-29_abc123";
      await saveSessionId(TEST_DIR, sessionId);

      const content = await Bun.file(join(TEST_DIR, ".ralph", "session")).text();
      expect(content).toBe(sessionId);
    });
  });

  describe("loadSessionId", () => {
    test("returns undefined when no session file exists", async () => {
      const result = await loadSessionId(TEST_DIR);
      expect(result).toBeUndefined();
    });

    test("returns undefined when .ralph directory does not exist", async () => {
      const result = await loadSessionId(join(TEST_DIR, "nonexistent"));
      expect(result).toBeUndefined();
    });

    test("loads existing session ID", async () => {
      const sessionId = "saved-session-id";
      await saveSessionId(TEST_DIR, sessionId);

      const result = await loadSessionId(TEST_DIR);
      expect(result).toBe(sessionId);
    });

    test("trims whitespace from session ID", async () => {
      const sessionPath = join(TEST_DIR, ".ralph", "session");
      await mkdir(join(TEST_DIR, ".ralph"), { recursive: true });
      await Bun.write(sessionPath, "  session-with-whitespace  \n");

      const result = await loadSessionId(TEST_DIR);
      expect(result).toBe("session-with-whitespace");
    });

    test("returns undefined for empty session file", async () => {
      const sessionPath = join(TEST_DIR, ".ralph", "session");
      await mkdir(join(TEST_DIR, ".ralph"), { recursive: true });
      await Bun.write(sessionPath, "");

      const result = await loadSessionId(TEST_DIR);
      expect(result).toBeUndefined();
    });

    test("returns undefined for whitespace-only session file", async () => {
      const sessionPath = join(TEST_DIR, ".ralph", "session");
      await mkdir(join(TEST_DIR, ".ralph"), { recursive: true });
      await Bun.write(sessionPath, "   \n  ");

      const result = await loadSessionId(TEST_DIR);
      expect(result).toBeUndefined();
    });
  });

  describe("clearSessionId", () => {
    test("clears existing session ID", async () => {
      await saveSessionId(TEST_DIR, "session-to-clear");
      await clearSessionId(TEST_DIR);

      const result = await loadSessionId(TEST_DIR);
      expect(result).toBeUndefined();
    });

    test("does nothing when no session file exists", async () => {
      await clearSessionId(TEST_DIR);
      const result = await loadSessionId(TEST_DIR);
      expect(result).toBeUndefined();
    });
  });

  describe("roundtrip", () => {
    test("save and load preserves session ID exactly", async () => {
      const testCases = [
        "simple-session",
        "session_with_underscores",
        "session-2024-01-29-T12-30-00",
        "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789",
      ];

      for (const sessionId of testCases) {
        await saveSessionId(TEST_DIR, sessionId);
        const loaded = await loadSessionId(TEST_DIR);
        expect(loaded).toBe(sessionId);
      }
    });
  });
});
