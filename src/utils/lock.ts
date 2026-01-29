import { exists, mkdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { debug, debugObject } from "./logger.js";

const RALPH_DIR = ".ralph";
const LOCK_FILE = "lock";

interface LockInfo {
  pid: number;
  startedAt: string;
  issueId: string;
  command: string;
}

/**
 * Get the path to the lock file in a worktree directory
 */
function getLockFilePath(worktreeDir: string): string {
  return join(worktreeDir, RALPH_DIR, LOCK_FILE);
}

/**
 * Check if a process with given PID is still running
 */
function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without actually sending a signal
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a lock is stale (process no longer running)
 */
async function isLockStale(lockPath: string): Promise<boolean> {
  try {
    const content = await Bun.file(lockPath).text();
    const lockInfo: LockInfo = JSON.parse(content);

    if (!isProcessRunning(lockInfo.pid)) {
      debug(`Lock is stale - process ${lockInfo.pid} is no longer running`);
      return true;
    }

    return false;
  } catch (error) {
    // If we can't read/parse the lock file, consider it stale
    debug(`Could not read lock file, considering it stale: ${error}`);
    return true;
  }
}

/**
 * Read lock information from the lock file
 */
export async function readLockInfo(worktreeDir: string): Promise<LockInfo | undefined> {
  const lockPath = getLockFilePath(worktreeDir);

  if (!(await exists(lockPath))) {
    return undefined;
  }

  try {
    const content = await Bun.file(lockPath).text();
    return JSON.parse(content) as LockInfo;
  } catch {
    return undefined;
  }
}

/**
 * Acquire a lock for the worktree directory
 * Returns true if lock was acquired, false if another process holds the lock
 */
export async function acquireLock(
  worktreeDir: string,
  issueId: string,
  command: string
): Promise<{ acquired: boolean; existingLock?: LockInfo }> {
  const lockPath = getLockFilePath(worktreeDir);
  const lockDir = dirname(lockPath);

  debug(`Attempting to acquire lock at: ${lockPath}`);

  // Check if lock already exists
  if (await exists(lockPath)) {
    // Check if it's a stale lock
    if (await isLockStale(lockPath)) {
      debug("Found stale lock, removing it");
      await unlink(lockPath);
    } else {
      // Lock is held by another running process
      const existingLock = await readLockInfo(worktreeDir);
      debugObject("Lock already held", existingLock);
      return { acquired: false, existingLock };
    }
  }

  // Create lock directory if it doesn't exist
  if (!(await exists(lockDir))) {
    debug(`Creating lock directory: ${lockDir}`);
    await mkdir(lockDir, { recursive: true });
  }

  // Create lock file
  const lockInfo: LockInfo = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    issueId,
    command,
  };

  await Bun.write(lockPath, JSON.stringify(lockInfo, null, 2));
  debugObject("Lock acquired", lockInfo);

  return { acquired: true };
}

/**
 * Release the lock for the worktree directory
 */
export async function releaseLock(worktreeDir: string): Promise<void> {
  const lockPath = getLockFilePath(worktreeDir);

  debug(`Releasing lock at: ${lockPath}`);

  if (await exists(lockPath)) {
    // Only release if we own the lock
    const lockInfo = await readLockInfo(worktreeDir);
    if (lockInfo && lockInfo.pid === process.pid) {
      await unlink(lockPath);
      debug("Lock released successfully");
    } else {
      debug("Lock not owned by this process, skipping release");
    }
  } else {
    debug("No lock file found to release");
  }
}

/**
 * Check if a lock exists (regardless of whether it's stale)
 */
export async function isLocked(worktreeDir: string): Promise<boolean> {
  const lockPath = getLockFilePath(worktreeDir);

  if (!(await exists(lockPath))) {
    return false;
  }

  // Check if lock is stale
  return !(await isLockStale(lockPath));
}

/**
 * Force remove a lock (use with caution)
 */
export async function forceRemoveLock(worktreeDir: string): Promise<void> {
  const lockPath = getLockFilePath(worktreeDir);

  debug(`Force removing lock at: ${lockPath}`);

  if (await exists(lockPath)) {
    await unlink(lockPath);
    debug("Lock force removed");
  }
}
