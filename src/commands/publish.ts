import { $ } from "bun";
import type { StepResult, WorkflowContext } from "../types.js";
import { loadStepConfig } from "../utils/config.js";
import { getBaseBranch } from "../utils/git.js";
import { checkCommandExists, runAgentCommand } from "../utils/process.js";

const CONFIG_PATH = "config/publish.md";

export async function publish(
  context: WorkflowContext,
  configDir: string
): Promise<StepResult> {
  const ghExists = await checkCommandExists("gh");
  if (!ghExists) {
    return {
      success: false,
      message:
        "Error: GitHub CLI (gh) is required but not found. Please install it: https://cli.github.com/",
    };
  }

  const configPath = `${configDir}/${CONFIG_PATH}`;

  try {
    const config = await loadStepConfig(configPath, context.issue);
    const result = await runAgentCommand(config, context.worktreeDir);

    if (!result.success) {
      return {
        success: false,
        message: `Publish verification failed: ${result.stderr}`,
      };
    }

    const implementationComplete = checkImplementationComplete(result.stdout);

    if (!implementationComplete) {
      return {
        success: false,
        message:
          "Implementation incomplete. Cannot create PR until all plan items are implemented.",
      };
    }

    console.log("Creating pull request...");
    const prResult = await createPullRequest(context);

    if (prResult.success) {
      return {
        success: true,
        message: `Pull request created: ${prResult.url}`,
      };
    }

    return {
      success: false,
      message: `Failed to create pull request: ${prResult.error}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to run publish step: ${error}`,
    };
  }
}

function checkImplementationComplete(output: string): boolean {
  const lowerOutput = output.toLowerCase();
  return (
    lowerOutput.includes("complete") ||
    lowerOutput.includes("all items implemented") ||
    lowerOutput.includes("ready for pr") ||
    lowerOutput.includes("meets quality bar") ||
    (!lowerOutput.includes("incomplete") && !lowerOutput.includes("missing"))
  );
}

async function createPullRequest(
  context: WorkflowContext
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const baseBranch = await getBaseBranch(context.worktreeDir);

    const title = `[${context.issue.id}] ${context.issue.title}`;
    const body = `## Issue

**ID:** ${context.issue.id}
**Title:** ${context.issue.title}

## Description

${context.issue.description}

---
*Automated PR created by Ralph*`;

    const result =
      await $`gh pr create --title ${title} --body ${body} --base ${baseBranch}`
        .cwd(context.worktreeDir)
        .quiet();

    const output = result.stdout.toString().trim();
    const urlMatch = output.match(/https:\/\/github\.com\/[^\s]+/);

    return {
      success: true,
      url: urlMatch?.[0] || output,
    };
  } catch (error) {
    const err = error as { stderr?: Buffer };
    return {
      success: false,
      error: err.stderr?.toString() || String(error),
    };
  }
}
