import { Glob } from "bun";
import type { StepResult, WorkflowContext } from "../types.js";
import { issueToTopicName, loadStepConfig } from "../utils/config.js";
import { debug } from "../utils/logger.js";
import { runAgentCommand } from "../utils/process.js";

const CONFIG_PATH = "config/plan.md";
const MAX_RETRIES = 1;

export async function plan(
  context: WorkflowContext,
  configDir: string
): Promise<StepResult> {
  const topicName = issueToTopicName(context.issue.title);
  const expectedFile = `_thoughts/plan/${context.issue.id}_${topicName}.md`;

  debug(`Plan step starting for issue: ${context.issue.id}`);
  debug(`Expected output file: ${expectedFile}`);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(`Retrying plan step (attempt ${attempt + 1})...`);
      debug(`Plan retry attempt ${attempt + 1}`);
    }

    const result = await runPlanStep(context, configDir);

    if (result.success) {
      debug("Plan step succeeded, checking for output file");
      const fileExists = await checkPlanFileExists(
        context.worktreeDir,
        context.issue.id
      );
      if (fileExists) {
        debug(`Plan output file found: ${fileExists}`);
        return {
          success: true,
          message: "Plan completed successfully",
          outputFile: fileExists,
        };
      }
      console.log(`Expected plan file not found: ${expectedFile}`);
      debug("Plan output file not found at expected path");
    } else {
      console.log(`Plan step failed: ${result.message}`);
      debug(`Plan step failed: ${result.message}`);
    }
  }

  debug(`Plan failed after ${MAX_RETRIES + 1} attempts`);
  return {
    success: false,
    message: `Plan failed after ${MAX_RETRIES + 1} attempts. Expected file: ${expectedFile}`,
  };
}

async function runPlanStep(
  context: WorkflowContext,
  configDir: string
): Promise<StepResult> {
  const configPath = `${configDir}/${CONFIG_PATH}`;

  try {
    const config = await loadStepConfig(configPath, context.issue);
    const result = await runAgentCommand(config, context.worktreeDir);

    return {
      success: result.success,
      message: result.success
        ? "Plan agent completed"
        : `Plan agent failed: ${result.stderr}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to run plan step: ${error}`,
    };
  }
}

async function checkPlanFileExists(
  worktreeDir: string,
  issueId: string
): Promise<string | null> {
  const planDir = `${worktreeDir}/_thoughts/plan`;
  const glob = new Glob(`${issueId}_*.md`);

  for await (const file of glob.scan(planDir)) {
    return `${planDir}/${file}`;
  }

  return null;
}
