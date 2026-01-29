#!/usr/bin/env bun
import { Command } from "commander";
import { implement } from "./commands/implement.js";
import { plan } from "./commands/plan.js";
import { publish } from "./commands/publish.js";
import { research } from "./commands/research.js";
import { review } from "./commands/review.js";
import { run } from "./commands/run.js";
import { spawn } from "./commands/spawn.js";
import { validate } from "./commands/validate.js";
import type { WorkflowContext } from "./types.js";
import {
  issueToBranchName,
  issueToWorktreeName,
  readPayloadFromStdinOrFile,
} from "./utils/config.js";
import { isGitBareWorktreeRoot } from "./utils/git.js";
import { debug, setVerbose } from "./utils/logger.js";

const program = new Command();

program
  .name("ralph")
  .description(
    "AI-assisted development workflow CLI using Claude Code and Codex"
  )
  .version("0.1.0")
  .option("-v, --verbose", "Enable verbose logging for debugging")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose) {
      setVerbose(true);
      debug("Verbose logging enabled");
    }
  });

async function validateEnvironment(): Promise<string> {
  const cwd = process.cwd();
  const isValidRoot = await isGitBareWorktreeRoot(cwd);

  if (!isValidRoot) {
    console.error(
      "Error: Ralph must be run from a git bare worktree root directory."
    );
    console.error("Expected structure:");
    console.error("  ralph-git/");
    console.error("  ├── .bare/       # Git database");
    console.error("  ├── .git         # File pointing to .bare/");
    console.error("  ├── main/        # Main branch worktree");
    console.error("  └── feature-123/ # Feature branch worktrees");
    process.exit(1);
  }

  return cwd;
}

function getConfigDir(rootDir: string): string {
  return `${rootDir}/main`;
}

program
  .command("run")
  .description("Run the full Ralph workflow (spawn -> research -> plan -> validate -> implement -> review -> publish)")
  .option("-i, --input <file>", "JSON payload file (reads from stdin if not provided)")
  .action(async (options) => {
    const rootDir = await validateEnvironment();
    const configDir = getConfigDir(rootDir);

    try {
      const issue = await readPayloadFromStdinOrFile(options.input);
      const result = await run(rootDir, issue, configDir);

      if (!result.success) {
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error: ${error}`);
      process.exit(1);
    }
  });

program
  .command("spawn")
  .description("Create a new git worktree and branch for the issue")
  .option("-i, --input <file>", "JSON payload file (reads from stdin if not provided)")
  .action(async (options) => {
    const rootDir = await validateEnvironment();

    try {
      const issue = await readPayloadFromStdinOrFile(options.input);
      const result = await spawn(rootDir, issue);

      if (!result.success) {
        console.error(result.message);
        process.exit(1);
      }

      console.log(result.message);
    } catch (error) {
      console.error(`Error: ${error}`);
      process.exit(1);
    }
  });

program
  .command("research")
  .description("Run the research phase using Claude Code")
  .option("-i, --input <file>", "JSON payload file (reads from stdin if not provided)")
  .action(async (options) => {
    const rootDir = await validateEnvironment();
    const configDir = getConfigDir(rootDir);

    try {
      const issue = await readPayloadFromStdinOrFile(options.input);
      const context = createContextFromIssue(issue, rootDir);
      const result = await research(context, configDir);

      if (!result.success) {
        console.error(result.message);
        process.exit(1);
      }

      console.log(result.message);
      if (result.outputFile) {
        console.log(`Output: ${result.outputFile}`);
      }
    } catch (error) {
      console.error(`Error: ${error}`);
      process.exit(1);
    }
  });

program
  .command("plan")
  .description("Run the planning phase using Claude Code")
  .option("-i, --input <file>", "JSON payload file (reads from stdin if not provided)")
  .action(async (options) => {
    const rootDir = await validateEnvironment();
    const configDir = getConfigDir(rootDir);

    try {
      const issue = await readPayloadFromStdinOrFile(options.input);
      const context = createContextFromIssue(issue, rootDir);
      const result = await plan(context, configDir);

      if (!result.success) {
        console.error(result.message);
        process.exit(1);
      }

      console.log(result.message);
      if (result.outputFile) {
        console.log(`Output: ${result.outputFile}`);
      }
    } catch (error) {
      console.error(`Error: ${error}`);
      process.exit(1);
    }
  });

program
  .command("validate")
  .description("Validate the implementation plan using Codex")
  .option("-i, --input <file>", "JSON payload file (reads from stdin if not provided)")
  .action(async (options) => {
    const rootDir = await validateEnvironment();
    const configDir = getConfigDir(rootDir);

    try {
      const issue = await readPayloadFromStdinOrFile(options.input);
      const context = createContextFromIssue(issue, rootDir);
      const result = await validate(context, configDir);

      if (result.needsChanges) {
        console.log("Plan needs changes:");
        console.log(result.message);
        process.exit(1);
      }

      console.log(result.message);
    } catch (error) {
      console.error(`Error: ${error}`);
      process.exit(1);
    }
  });

program
  .command("implement")
  .description("Run the implementation phase using Claude Code")
  .option("-i, --input <file>", "JSON payload file (reads from stdin if not provided)")
  .option("-f, --feedback <file>", "Code review feedback file to address (resumes previous session)")
  .action(async (options) => {
    const rootDir = await validateEnvironment();
    const configDir = getConfigDir(rootDir);

    try {
      const issue = await readPayloadFromStdinOrFile(options.input);
      const context = createContextFromIssue(issue, rootDir);

      let reviewFeedback: string | undefined;
      if (options.feedback) {
        reviewFeedback = await Bun.file(options.feedback).text();
      }

      const result = await implement(context, configDir, reviewFeedback);

      if (!result.success) {
        console.error(result.message);
        process.exit(1);
      }

      console.log(result.message);
      if (result.sessionId) {
        console.log(`Session ID saved for future resume: ${result.sessionId}`);
      }
    } catch (error) {
      console.error(`Error: ${error}`);
      process.exit(1);
    }
  });

program
  .command("review")
  .description("Run the code review phase using Codex")
  .option("-i, --input <file>", "JSON payload file (reads from stdin if not provided)")
  .action(async (options) => {
    const rootDir = await validateEnvironment();
    const configDir = getConfigDir(rootDir);

    try {
      const issue = await readPayloadFromStdinOrFile(options.input);
      const context = createContextFromIssue(issue, rootDir);
      const result = await review(context, configDir);

      if (result.needsChanges) {
        console.log("Code review found issues:");
        console.log(result.message);
        if (result.feedbackFile) {
          console.log(`Feedback: ${result.feedbackFile}`);
        }
        process.exit(1);
      }

      console.log(result.message);
    } catch (error) {
      console.error(`Error: ${error}`);
      process.exit(1);
    }
  });

program
  .command("publish")
  .description("Verify implementation and create a pull request")
  .option("-i, --input <file>", "JSON payload file (reads from stdin if not provided)")
  .action(async (options) => {
    const rootDir = await validateEnvironment();
    const configDir = getConfigDir(rootDir);

    try {
      const issue = await readPayloadFromStdinOrFile(options.input);
      const context = createContextFromIssue(issue, rootDir);
      const result = await publish(context, configDir);

      if (!result.success) {
        console.error(result.message);
        process.exit(1);
      }

      console.log(result.message);
    } catch (error) {
      console.error(`Error: ${error}`);
      process.exit(1);
    }
  });

function createContextFromIssue(
  issue: { id: string; title: string; description: string },
  rootDir: string
): WorkflowContext {
  const worktreeName = issueToWorktreeName(issue.id);
  return {
    issue,
    worktreeDir: `${rootDir}/${worktreeName}`,
    branchName: issueToBranchName(issue.id),
    planValidationAttempts: 0,
    codeReviewAttempts: 0,
  };
}

program.parse();
