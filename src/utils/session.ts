import { exists, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

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

  if (!(await exists(sessionDir))) {
    await mkdir(sessionDir, { recursive: true });
  }

  await Bun.write(sessionPath, sessionId);
}

/**
 * Load session ID from a file in the worktree directory
 * Returns undefined if no session file exists
 */
export async function loadSessionId(
  worktreeDir: string
): Promise<string | undefined> {
  const sessionPath = getSessionFilePath(worktreeDir);

  if (!(await exists(sessionPath))) {
    return undefined;
  }

  const content = await Bun.file(sessionPath).text();
  const sessionId = content.trim();

  return sessionId || undefined;
}

/**
 * Clear session ID file from the worktree directory
 */
export async function clearSessionId(worktreeDir: string): Promise<void> {
  const sessionPath = getSessionFilePath(worktreeDir);

  if (await exists(sessionPath)) {
    await Bun.write(sessionPath, "");
  }
}
