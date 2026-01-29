import { $ } from "bun";
import { debug } from "./logger.js";

export async function isGitBareWorktreeRoot(dir: string): Promise<boolean> {
  debug(`Checking if directory is a git bare worktree root: ${dir}`);
  try {
    const bareDir = `${dir}/.bare`;
    const gitFile = `${dir}/.git`;

    const bareExists = await Bun.file(bareDir).exists();
    const gitFileExists = await Bun.file(gitFile).exists();

    debug(`.bare exists: ${bareExists}, .git exists: ${gitFileExists}`);

    if (!bareExists || !gitFileExists) {
      debug("Not a valid bare worktree root: missing .bare or .git");
      return false;
    }

    const gitFileContent = await Bun.file(gitFile).text();
    const isValid = gitFileContent.trim().includes(".bare");
    debug(`Git file content valid: ${isValid}`);
    return isValid;
  } catch (error) {
    debug(`Error checking bare worktree root: ${error}`);
    return false;
  }
}

export async function createWorktree(
  rootDir: string,
  branchName: string,
  worktreeName: string
): Promise<{ success: boolean; path: string; message: string }> {
  const worktreePath = `${rootDir}/${worktreeName}`;

  debug(`Creating worktree: branch=${branchName}, path=${worktreePath}`);

  try {
    await $`git -C ${rootDir}/main worktree add -b ${branchName} ${worktreePath}`.quiet();
    debug(`Worktree created successfully at ${worktreePath}`);
    return {
      success: true,
      path: worktreePath,
      message: `Created worktree at ${worktreePath} on branch ${branchName}`,
    };
  } catch (error) {
    debug(`Failed to create worktree: ${error}`);
    return {
      success: false,
      path: worktreePath,
      message: `Failed to create worktree: ${error}`,
    };
  }
}

export async function worktreeExists(
  rootDir: string,
  worktreeName: string
): Promise<boolean> {
  const worktreePath = `${rootDir}/${worktreeName}`;
  debug(`Checking if worktree exists: ${worktreePath}`);
  try {
    const stat = await Bun.file(worktreePath).exists();
    debug(`Worktree exists: ${stat}`);
    return stat;
  } catch {
    debug("Error checking worktree existence");
    return false;
  }
}

export async function getCurrentBranch(dir: string): Promise<string | null> {
  debug(`Getting current branch for: ${dir}`);
  try {
    const result =
      await $`git -C ${dir} rev-parse --abbrev-ref HEAD`.quiet().text();
    const branch = result.trim();
    debug(`Current branch: ${branch}`);
    return branch;
  } catch {
    debug("Failed to get current branch");
    return null;
  }
}

export async function getBaseBranch(dir: string): Promise<string> {
  debug(`Getting base branch for: ${dir}`);
  try {
    const result =
      await $`git -C ${dir} rev-parse --abbrev-ref origin/HEAD`.quiet().text();
    const branch = result.trim().replace("origin/", "");
    debug(`Base branch: ${branch}`);
    return branch;
  } catch {
    debug("Failed to get base branch, defaulting to main");
    return "main";
  }
}
