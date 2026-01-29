import { $ } from "bun";
import type { Issue, StepResult, WorkflowContext } from "../types.js";
import {
  issueToBranchName,
  issueToWorktreeName,
} from "../utils/config.js";
import { createWorktree, worktreeExists } from "../utils/git.js";
import { debug, debugObject } from "../utils/logger.js";
import { runCommand } from "../utils/process.js";

// Default timeout for shell commands: 5 minutes (300000 ms)
const DEFAULT_COMMAND_TIMEOUT_MS = 300000;

export async function spawn(
  rootDir: string,
  issue: Issue
): Promise<StepResult & { context?: WorkflowContext }> {
  const branchName = issueToBranchName(issue.id);
  const worktreeName = issueToWorktreeName(issue.id);

  debug(`Spawn step starting for issue: ${issue.id}`);
  debugObject("Issue details", issue);
  debug(`Branch name: ${branchName}, Worktree name: ${worktreeName}`);

  console.log(`Creating worktree for issue ${issue.id}...`);

  if (await worktreeExists(rootDir, worktreeName)) {
    console.log(`Worktree ${worktreeName} already exists, using existing...`);
    const worktreeDir = `${rootDir}/${worktreeName}`;

    const context: WorkflowContext = {
      issue,
      worktreeDir,
      branchName,
      planValidationAttempts: 0,
      codeReviewAttempts: 0,
    };

    return await runSetupAndTests(worktreeDir, context);
  }

  const result = await createWorktree(rootDir, branchName, worktreeName);

  if (!result.success) {
    return {
      success: false,
      message: result.message,
    };
  }

  console.log(result.message);

  const context: WorkflowContext = {
    issue,
    worktreeDir: result.path,
    branchName,
    planValidationAttempts: 0,
    codeReviewAttempts: 0,
  };

  return await runSetupAndTests(result.path, context);
}

async function runSetupAndTests(
  worktreeDir: string,
  context: WorkflowContext
): Promise<StepResult & { context?: WorkflowContext }> {
  const readmePath = `${worktreeDir}/README.md`;
  const readmeFile = Bun.file(readmePath);

  if (!(await readmeFile.exists())) {
    console.log("No README.md found, skipping setup commands...");
    return {
      success: true,
      message: "Worktree created successfully (no README.md found)",
      context,
    };
  }

  const readmeContent = await readmeFile.text();
  const commands = extractSetupCommands(readmeContent);

  if (commands.install) {
    console.log(`Running install command: ${commands.install}`);
    const installResult = await runShellCommand(commands.install, worktreeDir);
    if (!installResult.success) {
      return {
        success: false,
        message: `Install command failed: ${installResult.stderr}`,
        context,
      };
    }
  }

  if (commands.build) {
    console.log(`Running build command: ${commands.build}`);
    const buildResult = await runShellCommand(commands.build, worktreeDir);
    if (!buildResult.success) {
      return {
        success: false,
        message: `Build command failed: ${buildResult.stderr}`,
        context,
      };
    }
  }

  if (commands.test) {
    console.log(`Running test command: ${commands.test}`);
    const testResult = await runShellCommand(commands.test, worktreeDir);
    if (!testResult.success) {
      return {
        success: false,
        message: `Tests failed: ${testResult.stderr}`,
        context,
      };
    }
  }

  return {
    success: true,
    message: "Worktree created and tests passed successfully",
    context,
  };
}

function extractSetupCommands(readmeContent: string): {
  install?: string;
  build?: string;
  test?: string;
} {
  debug("Extracting setup commands from README.md");
  const commands: { install?: string; build?: string; test?: string } = {};

  const npmInstallMatch = readmeContent.match(
    /```(?:bash|sh)?\n((?:npm|yarn|pnpm|bun)\s+install[^\n]*)\n```/i
  );
  if (npmInstallMatch) {
    commands.install = npmInstallMatch[1];
  }

  const buildMatch = readmeContent.match(
    /```(?:bash|sh)?\n((?:npm|yarn|pnpm|bun)\s+run\s+build[^\n]*)\n```/i
  );
  if (buildMatch) {
    commands.build = buildMatch[1];
  }

  const testMatch = readmeContent.match(
    /```(?:bash|sh)?\n((?:npm|yarn|pnpm|bun)\s+(?:run\s+)?test[^\n]*)\n```/i
  );
  if (testMatch) {
    commands.test = testMatch[1];
  }

  debugObject("Extracted setup commands", commands);
  return commands;
}

export function getCommandTimeout(): number {
  const envTimeout = process.env.RALPH_COMMAND_TIMEOUT_MS;
  if (envTimeout) {
    const parsed = Number.parseInt(envTimeout, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      debug(`Using custom command timeout: ${parsed}ms`);
      return parsed;
    }
  }
  return DEFAULT_COMMAND_TIMEOUT_MS;
}

async function runShellCommand(
  command: string,
  cwd: string,
  timeoutMs?: number
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  const timeout = timeoutMs ?? getCommandTimeout();
  debug(`Running shell command with ${timeout}ms timeout: ${command}`);

  try {
    const result = await $`sh -c ${command}`.cwd(cwd).quiet().timeout(timeout);
    return {
      success: true,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  } catch (error) {
    const err = error as { stdout?: Buffer; stderr?: Buffer; name?: string };

    // Check if it's a timeout error
    if (err.name === "ShellError" && String(error).includes("timed out")) {
      return {
        success: false,
        stdout: err.stdout?.toString() || "",
        stderr: `Command timed out after ${timeout}ms: ${command}`,
      };
    }

    return {
      success: false,
      stdout: err.stdout?.toString() || "",
      stderr: err.stderr?.toString() || String(error),
    };
  }
}
