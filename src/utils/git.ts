import { $ } from "bun";
import { stat } from "node:fs/promises";
import { debug } from "./logger.js";

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function isGitBareWorktreeRoot(dir: string): Promise<boolean> {
  debug(`Checking if directory is a git bare worktree root: ${dir}`);
  try {
    const bareDir = `${dir}/.bare`;
    const gitFile = `${dir}/.git`;

    const bareExists = await pathExists(bareDir);
    const gitFileExists = await pathExists(gitFile);

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
  const gitCommand = `git -C ${rootDir}/main worktree add -b ${branchName} ${worktreePath}`;

  debug(`Creating worktree: branch=${branchName}, path=${worktreePath}`);
  debug(`Git command: ${gitCommand}`);

  try {
    await $`git -C ${rootDir}/main worktree add -b ${branchName} ${worktreePath}`.quiet();
    debug(`Worktree created successfully at ${worktreePath}`);
    return {
      success: true,
      path: worktreePath,
      message: `Created worktree at ${worktreePath} on branch ${branchName}`,
    };
  } catch (error) {
    const err = error as { exitCode?: number; stdout?: Buffer; stderr?: Buffer };
    const exitCode = err.exitCode ?? "unknown";
    const stdout = err.stdout?.toString().trim() || "";
    const stderr = err.stderr?.toString().trim() || "";

    debug(`Failed to create worktree with exit code ${exitCode}`);
    debug(`Git stdout: ${stdout || "(empty)"}`);
    debug(`Git stderr: ${stderr || "(empty)"}`);

    // Build detailed error message
    const details: string[] = [`Exit code: ${exitCode}`];
    if (stderr) details.push(`stderr: ${stderr}`);
    if (stdout) details.push(`stdout: ${stdout}`);

    const errorMessage = `Failed to create worktree.\nCommand: ${gitCommand}\n${details.join("\n")}`;

    // Always log error details to console for visibility
    console.error(`\n[ERROR] Git worktree creation failed`);
    console.error(`[ERROR] Command: ${gitCommand}`);
    console.error(`[ERROR] Exit code: ${exitCode}`);
    if (stderr) console.error(`[ERROR] stderr: ${stderr}`);
    if (stdout) console.error(`[ERROR] stdout: ${stdout}`);
    console.error("");

    return {
      success: false,
      path: worktreePath,
      message: errorMessage,
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
    // Check if directory exists
    const dirExists = await pathExists(worktreePath);
    debug(`Directory exists: ${dirExists}`);

    if (!dirExists) {
      return false;
    }

    // Also verify it's a valid git worktree by checking for .git file
    const gitFile = `${worktreePath}/.git`;
    const hasGitFile = await pathExists(gitFile);
    debug(`Has .git file: ${hasGitFile}`);

    return hasGitFile;
  } catch (error) {
    debug(`Error checking worktree existence: ${error}`);
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
