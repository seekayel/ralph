import type { StepResult, WorkflowContext } from "../types.js";
import { loadStepConfig } from "../utils/config.js";
import { runAgentCommand } from "../utils/process.js";

const CONFIG_PATH = "config/implement.md";

export async function implement(
  context: WorkflowContext,
  configDir: string,
  reviewFeedback?: string
): Promise<StepResult> {
  const configPath = `${configDir}/${CONFIG_PATH}`;

  try {
    let config = await loadStepConfig(configPath, context.issue);

    if (reviewFeedback && context.sessionId) {
      config = {
        ...config,
        prompt: `${config.prompt}\n\n## Code Review Feedback to Address\n\n${reviewFeedback}`,
        args: [...config.args, "--resume", context.sessionId],
      };
    }

    console.log("Starting implementation...");
    const result = await runAgentCommand(config, context.worktreeDir);

    const sessionId = extractSessionId(result.stdout);

    if (result.success) {
      return {
        success: true,
        message: "Implementation completed successfully",
        sessionId: sessionId || context.sessionId,
      };
    }

    return {
      success: false,
      message: `Implementation failed: ${result.stderr}`,
      sessionId: sessionId || context.sessionId,
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
