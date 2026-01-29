import { Glob } from "bun";
import type { StepResult, WorkflowContext } from "../types.js";
import { issueToTopicName, loadStepConfig } from "../utils/config.js";
import { debug } from "../utils/logger.js";
import { syncAgentsToWorktree } from "../utils/paths.js";
import { runAgentCommand } from "../utils/process.js";

const CONFIG_PATH = "config/review.md";

export interface ReviewResult extends StepResult {
  needsChanges: boolean;
  feedbackFile?: string;
}

export async function review(
  context: WorkflowContext
): Promise<ReviewResult> {
  const topicName = issueToTopicName(context.issue.title);
  const expectedFile = `_thoughts/code-review/${context.issue.id}_${topicName}.md`;

  debug(`Review step starting for issue: ${context.issue.id}`);
  debug(`Expected feedback file: ${expectedFile}`);

  try {
    // Sync agents to worktree before invoking Codex
    await syncAgentsToWorktree(context.worktreeDir);

    const config = await loadStepConfig(CONFIG_PATH, context.issue, context.worktreeDir);
    const result = await runAgentCommand(config, context.worktreeDir);

    const feedbackFile = await checkReviewFileExists(
      context.worktreeDir,
      context.issue.id
    );
    debug(`Feedback file found: ${feedbackFile || "none"}`);

    const needsChanges = await checkIfNeedsCodeChanges(
      result.stdout,
      feedbackFile
    );
    debug(`Review result - needsChanges: ${needsChanges}`);

    if (result.success && !needsChanges) {
      debug("Code review passed - meets quality bar");
      return {
        success: true,
        needsChanges: false,
        message: "Code review passed - meets quality bar",
        feedbackFile: feedbackFile || undefined,
      };
    }

    if (needsChanges) {
      debug("Code review found issues that need to be addressed");
      return {
        success: true,
        needsChanges: true,
        message: "Code review found issues that need to be addressed",
        feedbackFile: feedbackFile || undefined,
      };
    }

    debug(`Review failed: ${result.stderr}`);
    return {
      success: false,
      needsChanges: false,
      message: `Review failed: ${result.stderr}`,
    };
  } catch (error) {
    debug(`Review step error: ${error}`);
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
