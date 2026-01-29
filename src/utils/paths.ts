import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { debug } from "./logger.js";

/**
 * Gets the root directory of the Ralph CLI installation.
 * This is where the bundled config/ and _agents/ directories live.
 */
export function getRalphRootDir(): string {
  // import.meta.dir in Bun gives the directory of this file
  // Go up: utils/ -> src/ -> ralph-root/
  return resolve(import.meta.dir, "..", "..");
}

/**
 * Gets the path to Ralph's bundled config directory.
 */
export function getRalphConfigDir(): string {
  return `${getRalphRootDir()}/config`;
}

/**
 * Gets the path to Ralph's bundled _agents directory.
 */
export function getRalphAgentsDir(): string {
  return `${getRalphRootDir()}/_agents`;
}

/**
 * Syncs the bundled _agents directory to the worktree's .ralph/ directory.
 * This allows coding agents (Claude/Codex) running in the worktree to read skill files.
 *
 * @param worktreeDir - The target worktree directory
 * @returns The path to the .ralph/ directory in the worktree
 */
export async function syncAgentsToWorktree(worktreeDir: string): Promise<string> {
  const ralphAgentsDir = getRalphAgentsDir();
  const ralphDir = `${worktreeDir}/.ralph`;
  const targetDir = `${ralphDir}/_agents`;

  debug(`Syncing agents from ${ralphAgentsDir} to ${targetDir}`);

  // Clean and recreate to ensure fresh copy
  await rm(ralphDir, { recursive: true, force: true });
  await mkdir(ralphDir, { recursive: true });
  await cp(ralphAgentsDir, targetDir, { recursive: true });

  debug(`Agents synced successfully to ${ralphDir}`);

  return ralphDir;
}
