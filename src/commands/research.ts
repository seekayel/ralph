import { $ } from "bun";
import type { StepResult, WorkflowContext } from "../types.js";
import { loadStepConfig } from "../utils/config.js";
import { findWorkflowArtifact } from "../utils/artifacts.js";
import { debug } from "../utils/logger.js";
import { syncAgentsToWorktree } from "../utils/paths.js";
import { runAgentCommand } from "../utils/process.js";

const CONFIG_PATH = "config/research.md";
const MAX_RETRIES = 1;

async function ensureThoughtsDir(worktreeDir: string, subdir: string): Promise<void> {
  const dir = `${worktreeDir}/_thoughts/${subdir}`;
  await $`mkdir -p ${dir}`.quiet();
  debug(`Ensured directory exists: ${dir}`);
}

export async function research(
  context: WorkflowContext
): Promise<StepResult> {
  const expectedFile = "_thoughts/research/NNN_topic_name.md";

  debug(`Research step starting for issue: ${context.issue.id}`);
  debug(`Expected output file: ${expectedFile}`);

  // Ensure the output directory exists
  await ensureThoughtsDir(context.worktreeDir, "research");

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(`Retrying research step (attempt ${attempt + 1})...`);
      debug(`Research retry attempt ${attempt + 1}`);
    }

    const result = await runResearchStep(context);

    if (result.success) {
      debug("Research step succeeded, checking for output file");
      const fileExists = await checkResearchFileExists(context.worktreeDir);
      if (fileExists) {
        debug(`Research output file found: ${fileExists}`);
        return {
          success: true,
          message: "Research completed successfully",
          outputFile: fileExists,
        };
      }
      console.log(`Expected research file not found: ${expectedFile}`);
      debug("Research output file not found at expected path");
    } else {
      console.log(`Research step failed: ${result.message}`);
      debug(`Research step failed: ${result.message}`);
    }
  }

  debug(`Research failed after ${MAX_RETRIES + 1} attempts`);
  return {
    success: false,
    message: `Research failed after ${MAX_RETRIES + 1} attempts. Expected file: ${expectedFile}`,
  };
}

async function runResearchStep(
  context: WorkflowContext
): Promise<StepResult> {
  try {
    // Sync agents to worktree before invoking Claude
    await syncAgentsToWorktree(context.worktreeDir);

    const config = await loadStepConfig(
      CONFIG_PATH,
      context.issue,
      context.worktreeDir,
      {
        commandOverride: context.agentOverrides?.research,
      }
    );
    const result = await runAgentCommand(config, context.worktreeDir, {
      stepName: `research-${context.issue.id}`,
    });

    return {
      success: result.success,
      message: result.success
        ? "Research agent completed"
        : `Research agent failed: ${result.stderr || result.stdout}`,
      debugArtifactDir: result.debugArtifactDir,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to run research step: ${error}`,
    };
  }
}

async function checkResearchFileExists(
  worktreeDir: string
): Promise<string | null> {
  return findWorkflowArtifact(worktreeDir, "research");
}
