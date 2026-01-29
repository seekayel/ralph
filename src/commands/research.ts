import { Glob } from "bun";
import type { StepResult, WorkflowContext } from "../types.js";
import { issueToTopicName, loadStepConfig } from "../utils/config.js";
import { runAgentCommand } from "../utils/process.js";

const CONFIG_PATH = "config/research.md";
const MAX_RETRIES = 1;

export async function research(
  context: WorkflowContext,
  configDir: string
): Promise<StepResult> {
  const topicName = issueToTopicName(context.issue.title);
  const expectedFile = `_thoughts/research/${context.issue.id}_${topicName}.md`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(`Retrying research step (attempt ${attempt + 1})...`);
    }

    const result = await runResearchStep(context, configDir);

    if (result.success) {
      const fileExists = await checkResearchFileExists(
        context.worktreeDir,
        context.issue.id
      );
      if (fileExists) {
        return {
          success: true,
          message: "Research completed successfully",
          outputFile: fileExists,
        };
      }
      console.log(`Expected research file not found: ${expectedFile}`);
    } else {
      console.log(`Research step failed: ${result.message}`);
    }
  }

  return {
    success: false,
    message: `Research failed after ${MAX_RETRIES + 1} attempts. Expected file: ${expectedFile}`,
  };
}

async function runResearchStep(
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
