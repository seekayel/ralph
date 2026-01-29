import { $ } from "bun";

export async function isGitBareWorktreeRoot(dir: string): Promise<boolean> {
  try {
    const bareDir = `${dir}/.bare`;
    const gitFile = `${dir}/.git`;

    const bareExists = await Bun.file(bareDir).exists();
    const gitFileExists = await Bun.file(gitFile).exists();

    if (!bareExists || !gitFileExists) {
      return false;
    }

    const gitFileContent = await Bun.file(gitFile).text();
    return gitFileContent.trim().includes(".bare");
  } catch {
    return false;
  }
}

export async function createWorktree(
  rootDir: string,
  branchName: string,
  worktreeName: string
): Promise<{ success: boolean; path: string; message: string }> {
  const worktreePath = `${rootDir}/${worktreeName}`;

  try {
    await $`git -C ${rootDir}/main worktree add -b ${branchName} ${worktreePath}`.quiet();
    return {
      success: true,
      path: worktreePath,
      message: `Created worktree at ${worktreePath} on branch ${branchName}`,
    };
  } catch (error) {
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
  try {
    const stat = await Bun.file(worktreePath).exists();
    return stat;
  } catch {
    return false;
  }
}

export async function getCurrentBranch(dir: string): Promise<string | null> {
  try {
    const result =
      await $`git -C ${dir} rev-parse --abbrev-ref HEAD`.quiet().text();
    return result.trim();
  } catch {
    return null;
  }
}

export async function getBaseBranch(dir: string): Promise<string> {
  try {
    const result =
      await $`git -C ${dir} rev-parse --abbrev-ref origin/HEAD`.quiet().text();
    return result.trim().replace("origin/", "");
  } catch {
    return "main";
  }
}
