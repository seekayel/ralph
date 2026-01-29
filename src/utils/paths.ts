import { debug } from "./logger.js";
import { extractAssetsIfNeeded } from "./assets.js";

/**
 * Syncs the embedded _agents directory to the worktree's .ralph/ directory.
 * This allows coding agents (Claude/Codex) running in the worktree to read skill files.
 *
 * Extracts from embedded assets rather than copying from filesystem.
 * Uses hash-based caching to skip extraction if assets haven't changed.
 *
 * @param worktreeDir - The target worktree directory
 * @returns The path to the .ralph/ directory in the worktree
 */
export async function syncAgentsToWorktree(
  worktreeDir: string
): Promise<string> {
  const ralphDir = `${worktreeDir}/.ralph`;

  debug(`Syncing agents from embedded assets to ${ralphDir}`);

  const extracted = await extractAssetsIfNeeded(ralphDir, "_agents");

  if (extracted) {
    debug(`Agents extracted successfully to ${ralphDir}`);
  } else {
    debug(`Agents already up to date in ${ralphDir}`);
  }

  return ralphDir;
}
