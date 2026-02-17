import { $ } from "bun";
import type { StepResult, WorkflowContext } from "../types.js";
import { loadStepConfig } from "../utils/config.js";
import { findWorkflowArtifact } from "../utils/artifacts.js";
import { debug } from "../utils/logger.js";
import { syncAgentsToWorktree } from "../utils/paths.js";
import { runAgentCommand } from "../utils/process.js";

async function ensureThoughtsDir(worktreeDir: string, subdir: string): Promise<void> {
  const dir = `${worktreeDir}/_thoughts/${subdir}`;
  await $`mkdir -p ${dir}`.quiet();
  debug(`Ensured directory exists: ${dir}`);
}

const CONFIG_PATH = "config/review.md";

export interface ReviewResult extends StepResult {
  needsChanges: boolean;
  feedbackFile?: string;
}

export async function review(
  context: WorkflowContext
): Promise<ReviewResult> {
  const expectedFile = "_thoughts/code-review/NNN_topic_name.md";

  debug(`Review step starting for issue: ${context.issue.id}`);
  debug(`Expected feedback file: ${expectedFile}`);

  // Ensure the output directory exists
  await ensureThoughtsDir(context.worktreeDir, "code-review");

  try {
    // Sync agents to worktree before invoking Codex
    await syncAgentsToWorktree(context.worktreeDir);

    const config = await loadStepConfig(
      CONFIG_PATH,
      context.issue,
      context.worktreeDir
    );
    const result = await runAgentCommand(config, context.worktreeDir, {
      stepName: `review-${context.issue.id}`,
    });

    const feedbackFile = await checkReviewFileExists(
      context.worktreeDir
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

    debug(`Review failed: ${result.stderr || result.stdout}`);
    return {
      success: false,
      needsChanges: false,
      message: `Review failed: ${result.stderr || result.stdout}`,
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
  worktreeDir: string
): Promise<string | null> {
  return findWorkflowArtifact(worktreeDir, "code-review");
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
