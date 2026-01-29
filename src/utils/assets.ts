import { mkdir, rm, writeFile } from "node:fs/promises";
import {
  ASSET_DIRECTORIES,
  EMBEDDED_ASSETS,
} from "../generated/embedded-assets.js";

/**
 * Gets embedded asset content by relative path.
 * @param relativePath - Path like "_agents/skills/code-review/skill.md" or "config/research.md"
 * @returns The file content or undefined if not found
 */
export function getEmbeddedAsset(relativePath: string): string | undefined {
  return EMBEDDED_ASSETS[relativePath];
}

/**
 * Gets all embedded config file contents.
 * @returns A map of config path to content
 */
export function getEmbeddedConfigs(): Map<string, string> {
  const configs = new Map<string, string>();
  for (const [path, content] of Object.entries(EMBEDDED_ASSETS)) {
    if (path.startsWith("config/")) {
      configs.set(path, content);
    }
  }
  return configs;
}

/**
 * Returns a hash of all embedded assets for change detection.
 * Uses Bun's built-in hash function for performance.
 */
export function getAssetsHash(): string {
  const allContent = Object.values(EMBEDDED_ASSETS).join("");
  return Bun.hash(allContent).toString(16);
}

/**
 * Checks if assets need to be extracted by comparing a hash.
 * @param targetDir - The base directory (e.g., "/path/to/worktree/.ralph")
 * @returns true if extraction is needed
 */
export async function needsExtraction(targetDir: string): Promise<boolean> {
  const hashFile = `${targetDir}/.assets-hash`;
  const currentHash = getAssetsHash();

  try {
    const existingHash = await Bun.file(hashFile).text();
    return existingHash.trim() !== currentHash;
  } catch {
    // File doesn't exist or can't be read
    return true;
  }
}

/**
 * Extracts embedded assets to a target directory.
 * @param targetDir - Base directory (e.g., "/path/to/worktree/.ralph")
 * @param prefix - Optional prefix filter (e.g., "_agents" or "config")
 */
export async function extractAssets(
  targetDir: string,
  prefix?: string
): Promise<void> {
  // Create all necessary directories first
  for (const dir of ASSET_DIRECTORIES) {
    if (!prefix || dir.startsWith(prefix)) {
      await mkdir(`${targetDir}/${dir}`, { recursive: true });
    }
  }

  // Write all files
  for (const [relativePath, content] of Object.entries(EMBEDDED_ASSETS)) {
    if (!prefix || relativePath.startsWith(prefix)) {
      const fullPath = `${targetDir}/${relativePath}`;
      await writeFile(fullPath, content, "utf-8");
    }
  }
}

/**
 * Extracts assets to target directory with hash-based caching.
 * Only extracts if the hash file is missing or doesn't match current assets.
 * @param targetDir - Base directory (e.g., "/path/to/worktree/.ralph")
 * @param prefix - Optional prefix filter (e.g., "_agents" or "config")
 * @returns true if extraction was performed, false if skipped due to cache hit
 */
export async function extractAssetsIfNeeded(
  targetDir: string,
  prefix?: string
): Promise<boolean> {
  if (!(await needsExtraction(targetDir))) {
    return false;
  }

  // Clean and recreate
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });

  // Extract assets
  await extractAssets(targetDir, prefix);

  // Write hash file for future comparisons
  await writeFile(`${targetDir}/.assets-hash`, getAssetsHash(), "utf-8");

  return true;
}
