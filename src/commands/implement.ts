import { $ } from "bun";
import type { StepResult, WorkflowContext } from "../types.js";
import { loadStepConfig } from "../utils/config.js";
import { debug } from "../utils/logger.js";
import { syncAgentsToWorktree } from "../utils/paths.js";
import { runAgentCommand } from "../utils/process.js";
import { loadSessionId, saveSessionId } from "../utils/session.js";

const CONFIG_PATH = "config/implement.md";
const PLAN_COMPLETE_POSITIVE_PATTERN =
  /(^|\n)\s*(?:[-*]\s*)?PLAN_COMPLETE\s*:\s*(?:yes|true)\b/i;
const PLAN_COMPLETE_NEGATIVE_PATTERN =
  /(^|\n)\s*(?:[-*]\s*)?PLAN_COMPLETE\s*:\s*(?:no|false|fail|failed|incomplete)\b/i;
const REQUIRED_TESTS_POSITIVE_PATTERN =
  /(^|\n)\s*(?:[-*]\s*)?REQUIRED_TESTS\s*:\s*(?:yes|true)\b/i;
const REQUIRED_TESTS_NEGATIVE_PATTERN =
  /(^|\n)\s*(?:[-*]\s*)?REQUIRED_TESTS\s*:\s*(?:no|false|fail|failed|missing)\b/i;
const CHECKS_PASSING_POSITIVE_PATTERN =
  /(^|\n)\s*(?:[-*]\s*)?CHECKS_PASSING\s*:\s*(?:yes|true)\b/i;
const CHECKS_PASSING_NEGATIVE_PATTERN =
  /(^|\n)\s*(?:[-*]\s*)?CHECKS_PASSING\s*:\s*(?:no|false|fail|failed|failing)\b/i;

interface ImplementPostconditions {
  planComplete: boolean;
  requiredTests: boolean;
  checksPassing: boolean;
}

async function ensureThoughtsDir(worktreeDir: string, subdir: string): Promise<void> {
  const dir = `${worktreeDir}/_thoughts/${subdir}`;
  await $`mkdir -p ${dir}`.quiet();
  debug(`Ensured directory exists: ${dir}`);
}

export async function implement(
  context: WorkflowContext,
  reviewFeedback?: string
): Promise<StepResult> {
  debug(`Implement step starting for issue: ${context.issue.id}`);
  debug(`Review feedback provided: ${!!reviewFeedback}`);

  // Ensure the output directory exists
  await ensureThoughtsDir(context.worktreeDir, "implement");

  try {
    // Sync agents to worktree before invoking Claude
    await syncAgentsToWorktree(context.worktreeDir);

    let config = await loadStepConfig(
      CONFIG_PATH,
      context.issue,
      context.worktreeDir,
      {
        commandOverride: context.agentOverrides?.implement,
      }
    );

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
    const result = await runAgentCommand(config, context.worktreeDir, {
      stepName: `implement-${context.issue.id}`,
    });

    const extractedSessionId = extractSessionId(result.stdout);
    const finalSessionId = extractedSessionId || sessionId;
    debug(`Final session ID: ${finalSessionId || "none"}`);

    // Persist session ID to file for future invocations
    if (finalSessionId) {
      await saveSessionId(context.worktreeDir, finalSessionId);
      debug("Session ID saved to file");
    }

    if (result.success) {
      const postconditions = evaluateImplementPostconditions(result.stdout);
      const missingPostconditions = getMissingImplementPostconditions(postconditions);

      if (missingPostconditions.length > 0) {
        debug(
          `Implementation postconditions not met: ${missingPostconditions.join(", ")}`
        );
        return {
          success: false,
          message: `Implementation postconditions not met: ${missingPostconditions.join(", ")}`,
          sessionId: finalSessionId,
        };
      }

      debug("Implementation completed successfully");
      return {
        success: true,
        message: "Implementation completed successfully",
        sessionId: finalSessionId,
      };
    }

    debug(`Implementation failed: ${result.stderr || result.stdout}`);
    return {
      success: false,
      message: `Implementation failed: ${result.stderr || result.stdout}`,
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

function isExplicitlySatisfied(
  output: string,
  positivePattern: RegExp,
  negativePattern: RegExp
): boolean {
  return positivePattern.test(output) && !negativePattern.test(output);
}

export function evaluateImplementPostconditions(
  output: string
): ImplementPostconditions {
  return {
    planComplete: isExplicitlySatisfied(
      output,
      PLAN_COMPLETE_POSITIVE_PATTERN,
      PLAN_COMPLETE_NEGATIVE_PATTERN
    ),
    requiredTests: isExplicitlySatisfied(
      output,
      REQUIRED_TESTS_POSITIVE_PATTERN,
      REQUIRED_TESTS_NEGATIVE_PATTERN
    ),
    checksPassing: isExplicitlySatisfied(
      output,
      CHECKS_PASSING_POSITIVE_PATTERN,
      CHECKS_PASSING_NEGATIVE_PATTERN
    ),
  };
}

export function checkImplementPostconditions(output: string): boolean {
  const postconditions = evaluateImplementPostconditions(output);
  return (
    postconditions.planComplete &&
    postconditions.requiredTests &&
    postconditions.checksPassing
  );
}

function getMissingImplementPostconditions(
  postconditions: ImplementPostconditions
): string[] {
  const missing: string[] = [];

  if (!postconditions.planComplete) {
    missing.push("plan completion");
  }

  if (!postconditions.requiredTests) {
    missing.push("required tests");
  }

  if (!postconditions.checksPassing) {
    missing.push("passing checks");
  }

  return missing;
}
