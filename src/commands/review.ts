import { Glob } from "bun";
import type { StepResult, WorkflowContext } from "../types.js";
import { issueToTopicName, loadStepConfig } from "../utils/config.js";
import { runAgentCommand } from "../utils/process.js";

const CONFIG_PATH = "config/review.md";

export interface ReviewResult extends StepResult {
  needsChanges: boolean;
  feedbackFile?: string;
}

export async function review(
  context: WorkflowContext,
  configDir: string
): Promise<ReviewResult> {
  const configPath = `${configDir}/${CONFIG_PATH}`;
  const topicName = issueToTopicName(context.issue.title);
  const expectedFile = `_thoughts/code-review/${context.issue.id}_${topicName}.md`;

  try {
    const config = await loadStepConfig(configPath, context.issue);
    const result = await runAgentCommand(config, context.worktreeDir);

    const feedbackFile = await checkReviewFileExists(
      context.worktreeDir,
      context.issue.id
    );

    const needsChanges = await checkIfNeedsCodeChanges(
      result.stdout,
      feedbackFile
    );

    if (result.success && !needsChanges) {
      return {
        success: true,
        needsChanges: false,
        message: "Code review passed - meets quality bar",
        feedbackFile: feedbackFile || undefined,
      };
    }

    if (needsChanges) {
      return {
        success: true,
        needsChanges: true,
        message: "Code review found issues that need to be addressed",
        feedbackFile: feedbackFile || undefined,
      };
    }

    return {
      success: false,
      needsChanges: false,
      message: `Review failed: ${result.stderr}`,
    };
  } catch (error) {
    return {
      success: false,
      needsChanges: false,
      message: `Failed to run review step: ${error}`,
    };
  }
}

async function checkReviewFileExists(
  worktreeDir: string,
  issueId: string
): Promise<string | null> {
  const reviewDir = `${worktreeDir}/_thoughts/code-review`;
  const glob = new Glob(`${issueId}_*.md`);

  for await (const file of glob.scan(reviewDir)) {
    return `${reviewDir}/${file}`;
  }

  return null;
}

async function checkIfNeedsCodeChanges(
  output: string,
  feedbackFile: string | null
): Promise<boolean> {
  const lowerOutput = output.toLowerCase();
  const outputNeedsChanges =
    lowerOutput.includes("needs changes") ||
    lowerOutput.includes("requires changes") ||
    lowerOutput.includes("does not meet") ||
    lowerOutput.includes("critical") ||
    lowerOutput.includes("must be fixed") ||
    lowerOutput.includes("issues found");

  if (outputNeedsChanges) {
    return true;
  }

  if (feedbackFile) {
    try {
      const content = await Bun.file(feedbackFile).text();
      const lowerContent = content.toLowerCase();
      return (
        lowerContent.includes("critical") ||
        lowerContent.includes("must fix") ||
        lowerContent.includes("blocking") ||
        lowerContent.includes("needs changes")
      );
    } catch {
      return false;
    }
  }

  return false;
}

export async function getReviewFeedback(
  feedbackFile: string
): Promise<string | null> {
  try {
    return await Bun.file(feedbackFile).text();
  } catch {
    return null;
  }
}
