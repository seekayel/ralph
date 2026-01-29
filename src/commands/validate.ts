import type { StepResult, WorkflowContext } from "../types.js";
import { loadStepConfig } from "../utils/config.js";
import { debug } from "../utils/logger.js";
import { syncAgentsToWorktree } from "../utils/paths.js";
import { runAgentCommand } from "../utils/process.js";

const CONFIG_PATH = "config/validate.md";

export interface ValidateResult extends StepResult {
  needsChanges: boolean;
}

export async function validate(
  context: WorkflowContext,
  configDir: string
): Promise<ValidateResult> {
  const configPath = `${configDir}/${CONFIG_PATH}`;

  debug(`Validate step starting for issue: ${context.issue.id}`);
  debug(`Config path: ${configPath}`);

  try {
    // Sync agents to worktree before invoking Codex
    await syncAgentsToWorktree(context.worktreeDir);

    const config = await loadStepConfig(configPath, context.issue, context.worktreeDir);
    const result = await runAgentCommand(config, context.worktreeDir);

    const needsChanges = checkIfNeedsChanges(result.stdout);
    debug(`Validation result - needsChanges: ${needsChanges}`);

    if (result.success && !needsChanges) {
      debug("Validation passed - plan meets quality bar");
      return {
        success: true,
        needsChanges: false,
        message: "Plan validated successfully - meets quality bar",
      };
    }

    if (needsChanges) {
      debug("Validation found issues - plan needs changes");
      return {
        success: true,
        needsChanges: true,
        message: `Plan needs changes: ${extractValidationFeedback(result.stdout)}`,
      };
    }

    debug(`Validation failed: ${result.stderr}`);
    return {
      success: false,
      needsChanges: false,
      message: `Validation failed: ${result.stderr}`,
    };
  } catch (error) {
    debug(`Validate step error: ${error}`);
    return {
      success: false,
      needsChanges: false,
      message: `Failed to run validate step: ${error}`,
    };
  }
}

function checkIfNeedsChanges(output: string): boolean {
  const lowerOutput = output.toLowerCase();
  return (
    lowerOutput.includes("needs changes") ||
    lowerOutput.includes("requires changes") ||
    lowerOutput.includes("does not meet") ||
    lowerOutput.includes("problematic") ||
    lowerOutput.includes("issues found") ||
    lowerOutput.includes("must be fixed") ||
    lowerOutput.includes("should be revised")
  );
}

function extractValidationFeedback(output: string): string {
  const lines = output.split("\n");
  const relevantLines = lines.filter(
    (line) =>
      line.includes("issue") ||
      line.includes("problem") ||
      line.includes("change") ||
      line.includes("fix") ||
      line.includes("missing") ||
      line.includes("incomplete")
  );

  return relevantLines.slice(0, 5).join("\n") || output.slice(0, 500);
}
