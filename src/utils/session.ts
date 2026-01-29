import { exists, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { debug } from "./logger.js";

const RALPH_DIR = ".ralph";
const SESSION_FILE = "session";

/**
 * Get the path to the session file in a worktree directory
 */
function getSessionFilePath(worktreeDir: string): string {
  return join(worktreeDir, RALPH_DIR, SESSION_FILE);
}

/**
 * Save session ID to a file in the worktree directory
 */
export async function saveSessionId(
  worktreeDir: string,
  sessionId: string
): Promise<void> {
  const sessionPath = getSessionFilePath(worktreeDir);
  const sessionDir = dirname(sessionPath);

  debug(`Saving session ID to: ${sessionPath}`);

  if (!(await exists(sessionDir))) {
    debug(`Creating session directory: ${sessionDir}`);
    await mkdir(sessionDir, { recursive: true });
  }

  await Bun.write(sessionPath, sessionId);
  debug("Session ID saved successfully");
}

/**
 * Load session ID from a file in the worktree directory
 * Returns undefined if no session file exists
 */
export async function loadSessionId(
  worktreeDir: string
): Promise<string | undefined> {
  const sessionPath = getSessionFilePath(worktreeDir);

  debug(`Looking for session file at: ${sessionPath}`);

  if (!(await exists(sessionPath))) {
    debug("Session file not found");
    return undefined;
  }

  const content = await Bun.file(sessionPath).text();
  const sessionId = content.trim();

  debug(`Session ID loaded: ${sessionId || "(empty)"}`);
  return sessionId || undefined;
}

/**
 * Clear session ID file from the worktree directory
 */
export async function clearSessionId(worktreeDir: string): Promise<void> {
  const sessionPath = getSessionFilePath(worktreeDir);

  debug(`Clearing session file at: ${sessionPath}`);

  if (await exists(sessionPath)) {
    await Bun.write(sessionPath, "");
    debug("Session file cleared");
  }
}
