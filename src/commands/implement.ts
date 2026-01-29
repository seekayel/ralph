import type { StepResult, WorkflowContext } from "../types.js";
import { loadStepConfig } from "../utils/config.js";
import { runAgentCommand } from "../utils/process.js";
import { loadSessionId, saveSessionId } from "../utils/session.js";

const CONFIG_PATH = "config/implement.md";

export async function implement(
  context: WorkflowContext,
  configDir: string,
  reviewFeedback?: string
): Promise<StepResult> {
  const configPath = `${configDir}/${CONFIG_PATH}`;

  try {
    let config = await loadStepConfig(configPath, context.issue);

    // Load session ID from file if not in context (for standalone CLI invocations)
    let sessionId = context.sessionId;
    if (!sessionId) {
      sessionId = await loadSessionId(context.worktreeDir);
    }

    if (reviewFeedback && sessionId) {
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

    // Persist session ID to file for future invocations
    if (finalSessionId) {
      await saveSessionId(context.worktreeDir, finalSessionId);
    }

    if (result.success) {
      return {
        success: true,
        message: "Implementation completed successfully",
        sessionId: finalSessionId,
      };
    }

    return {
      success: false,
      message: `Implementation failed: ${result.stderr}`,
      sessionId: finalSessionId,
    };
  } catch (error) {
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
