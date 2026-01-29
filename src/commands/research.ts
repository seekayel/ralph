import { Glob } from "bun";
import type { StepResult, WorkflowContext } from "../types.js";
import { issueToTopicName, loadStepConfig } from "../utils/config.js";
import { debug } from "../utils/logger.js";
import { syncAgentsToWorktree } from "../utils/paths.js";
import { runAgentCommand } from "../utils/process.js";

const CONFIG_PATH = "config/research.md";
const MAX_RETRIES = 1;

export async function research(
  context: WorkflowContext
): Promise<StepResult> {
  const topicName = issueToTopicName(context.issue.title);
  const expectedFile = `_thoughts/research/${context.issue.id}_${topicName}.md`;

  debug(`Research step starting for issue: ${context.issue.id}`);
  debug(`Expected output file: ${expectedFile}`);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(`Retrying research step (attempt ${attempt + 1})...`);
      debug(`Research retry attempt ${attempt + 1}`);
    }

    const result = await runResearchStep(context);

    if (result.success) {
      debug("Research step succeeded, checking for output file");
      const fileExists = await checkResearchFileExists(
        context.worktreeDir,
        context.issue.id
      );
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

    const config = await loadStepConfig(CONFIG_PATH, context.issue, context.worktreeDir);
    const result = await runAgentCommand(config, context.worktreeDir);

    return {
      success: result.success,
      message: result.success
        ? "Research agent completed"
        : `Research agent failed: ${result.stderr}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to run research step: ${error}`,
    };
  }
}

async function checkResearchFileExists(
  worktreeDir: string,
  issueId: string
): Promise<string | null> {
  const researchDir = `${worktreeDir}/_thoughts/research`;
  const glob = new Glob(`${issueId}_*.md`);

  for await (const file of glob.scan(researchDir)) {
    return `${researchDir}/${file}`;
  }

  return null;
}
