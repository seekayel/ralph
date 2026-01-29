import type { StepResult, WorkflowContext } from "../types.js";
import { loadStepConfig } from "../utils/config.js";
import { debug } from "../utils/logger.js";
import { syncAgentsToWorktree } from "../utils/paths.js";
import { runAgentCommand } from "../utils/process.js";
import { loadSessionId, saveSessionId } from "../utils/session.js";

const CONFIG_PATH = "config/implement.md";

export async function implement(
  context: WorkflowContext,
  reviewFeedback?: string
): Promise<StepResult> {
  debug(`Implement step starting for issue: ${context.issue.id}`);
  debug(`Review feedback provided: ${!!reviewFeedback}`);

  try {
    // Sync agents to worktree before invoking Claude
    await syncAgentsToWorktree(context.worktreeDir);

    let config = await loadStepConfig(CONFIG_PATH, context.issue, context.worktreeDir);

    // Load session ID from file if not in context (for standalone CLI invocations)
    let sessionId = context.sessionId;
    if (!sessionId) {
      sessionId = await loadSessionId(context.worktreeDir);
      debug(`Loaded session ID from file: ${sessionId || "none"}`);
    } else {
      debug(`Using session ID from context: ${sessionId}`);
    }

    if (reviewFeedback && sessionId) {
      debug("Resuming session with review feedback");
      config = {
        ...config,
        prompt: `${config.prompt}\n\n## Code Review Feedback to Address\n\n${reviewFeedback}`,
        args: [...config.args, "--resume", sessionId],
      };
    }

    console.log("Starting implementation...");
    const result = await runAgentCommand(config, context.worktreeDir);

    const extractedSessionId = extractSessionId(result.stdout);
    const finalSessionId = extractedSessionId || sessionId;
    debug(`Final session ID: ${finalSessionId || "none"}`);

    // Persist session ID to file for future invocations
    if (finalSessionId) {
      await saveSessionId(context.worktreeDir, finalSessionId);
      debug("Session ID saved to file");
    }

    if (result.success) {
      debug("Implementation completed successfully");
      return {
        success: true,
        message: "Implementation completed successfully",
        sessionId: finalSessionId,
      };
    }

    debug(`Implementation failed: ${result.stderr}`);
    return {
      success: false,
      message: `Implementation failed: ${result.stderr}`,
      sessionId: finalSessionId,
    };
  } catch (error) {
    debug(`Implement step error: ${error}`);
    return {
      success: false,
      message: `Failed to run implement step: ${error}`,
    };
  }
}

function extractSessionId(output: string): string | undefined {
  const sessionIdMatch = output.match(/session[_-]?id[:\s]+([a-zA-Z0-9-_]+)/i);
  return sessionIdMatch?.[1];
}
