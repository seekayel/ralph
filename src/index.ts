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
  .addHelpText("after", `
Ralph automates the software development workflow using AI agents:
  - Claude Code for research, planning, and implementation
  - Codex for validation, code review, and publish verification

Prerequisites:
  - Bun v1.3.6+     Runtime and build tool
  - gh              GitHub CLI for creating pull requests
  - claude          Claude Code CLI for AI-assisted coding
  - codex           Codex CLI for validation and review

Directory Structure:
  Ralph must be run from a git bare worktree root directory:
    ralph-git/
    ├── .bare/       Git database (bare repository)
    ├── .git         File pointing to .bare/
    ├── main/        Main branch worktree
    └── feature-123/ Feature branch worktrees

Commands:
  run        Full workflow: spawn -> research -> plan -> validate -> implement -> review -> publish
  spawn      Create git worktree and branch, run install/build/test
  research   Analyze codebase with Claude Code
  plan       Create implementation plan with Claude Code
  validate   Validate plan with Codex
  implement  Implement the plan with Claude Code
  review     Code review with Codex
  publish    Verify and create pull request

For command-specific help, run: ralph <command> --help
`)
  .showHelpAfterError("(run ralph --help for usage information)")
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
  .addHelpText("after", `
Examples:
  $ echo '{"id": "HLN-123", "title": "Add feature", "description": "Feature details"}' | ralph run
  $ ralph run --input issue.json
  $ ralph run -v --input issue.json    # with verbose logging

Workflow Steps:
  1. spawn      - Create git worktree and branch, run install/build/test
  2. research   - Analyze codebase using Claude Code (outputs _thoughts/research/)
  3. plan       - Create implementation plan using Claude Code (outputs _thoughts/plan/)
  4. validate   - Validate plan using Codex (retries up to 4 times)
  5. implement  - Implement the plan using Claude Code
  6. review     - Code review using Codex (retries up to 4 times)
  7. publish    - Verify completion and create pull request

JSON Payload Schema:
  {
    "id": "HLN-123",        // Issue identifier (alphanumeric and hyphens)
    "title": "Issue title", // Brief description
    "description": "..."    // Full issue description
  }

Environment Variables:
  RALPH_COMMAND_TIMEOUT_MS  - Timeout for shell commands (default: 300000ms / 5min)
`)
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
  .addHelpText("after", `
Examples:
  $ echo '{"id": "HLN-123", "title": "Add feature", "description": "..."}' | ralph spawn
  $ ralph spawn --input issue.json

Behavior:
  1. Creates a new git worktree directory named after the issue ID (e.g., hln-123/)
  2. Creates a new branch named ralph-<issue-id> (e.g., ralph-HLN-123)
  3. If worktree already exists, uses the existing one
  4. Reads README.md to find install/build/test commands
  5. Runs discovered commands and fails if tests don't pass

Output:
  Creates directory structure:
    ralph-git/
    ├── main/           # Main branch worktree
    └── hln-123/        # New feature worktree (ralph-HLN-123 branch)

JSON Payload Schema:
  {
    "id": "HLN-123",        // Issue identifier (alphanumeric and hyphens)
    "title": "Issue title", // Brief description
    "description": "..."    // Full issue description
  }

Environment Variables:
  RALPH_COMMAND_TIMEOUT_MS  - Timeout for shell commands (default: 300000ms / 5min)
`)
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
  .addHelpText("after", `
Examples:
  $ echo '{"id": "HLN-123", "title": "Add feature", "description": "..."}' | ralph research
  $ ralph research --input issue.json
  $ ralph research -v --input issue.json    # with verbose logging

Behavior:
  1. Invokes Claude Code in headless mode with research-plan-implement workflow
  2. Analyzes the codebase in relation to the requested issue
  3. Only allows git read commands (status, diff, log) - no writes
  4. Retries once on failure before exiting with error

Output:
  Creates file: _thoughts/research/<issue-id>_<topic-name>.md
  Example: _thoughts/research/HLN-123_add_feature.md

Configuration:
  Uses config/research.md for agent configuration

JSON Payload Schema:
  {
    "id": "HLN-123",        // Issue identifier
    "title": "Issue title", // Used to generate topic name
    "description": "..."    // Full issue description for context
  }
`)
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
  .addHelpText("after", `
Examples:
  $ echo '{"id": "HLN-123", "title": "Add feature", "description": "..."}' | ralph plan
  $ ralph plan --input issue.json
  $ ralph plan -v --input issue.json    # with verbose logging

Prerequisites:
  Research step must be completed first (_thoughts/research/ file must exist)

Behavior:
  1. Invokes Claude Code in headless mode with research-plan-implement workflow
  2. Creates implementation and testing plan based on research findings
  3. Only allows git read commands (status, diff, log) - no writes
  4. Retries once on failure before exiting with error

Output:
  Creates file: _thoughts/plan/<issue-id>_<topic-name>.md
  Example: _thoughts/plan/HLN-123_add_feature.md

Configuration:
  Uses config/plan.md for agent configuration

JSON Payload Schema:
  {
    "id": "HLN-123",        // Issue identifier
    "title": "Issue title", // Used to generate topic name
    "description": "..."    // Full issue description for context
  }
`)
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
  .addHelpText("after", `
Examples:
  $ echo '{"id": "HLN-123", "title": "Add feature", "description": "..."}' | ralph validate
  $ ralph validate --input issue.json
  $ ralph validate -v --input issue.json    # with verbose logging

Prerequisites:
  Plan step must be completed first (_thoughts/plan/ file must exist)

Behavior:
  1. Invokes Codex in headless mode to validate the plan
  2. Checks that the plan will implement the requested feature
  3. Verifies testing plan is adequate
  4. In standalone mode, exits with result
  5. In 'run' mode, returns to plan step if changes needed (max 4 attempts)

Exit Codes:
  0 - Plan meets quality bar
  1 - Plan needs changes (issues printed to stdout)

Configuration:
  Uses config/validate.md for agent configuration

JSON Payload Schema:
  {
    "id": "HLN-123",        // Issue identifier
    "title": "Issue title", // Brief description
    "description": "..."    // Full issue description for context
  }
`)
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
  .addHelpText("after", `
Examples:
  $ echo '{"id": "HLN-123", "title": "Add feature", "description": "..."}' | ralph implement
  $ ralph implement --input issue.json
  $ ralph implement -i issue.json --feedback _thoughts/code-review/HLN-123_add_feature.md
  $ ralph implement -v --input issue.json    # with verbose logging

Prerequisites:
  Plan step must be validated first (_thoughts/plan/ file must exist)

Behavior:
  1. Invokes Claude Code in headless mode with research-plan-implement workflow
  2. Implements the plan from _thoughts/plan/
  3. Saves session ID for potential resume if review requests changes
  4. Runs lint, build, and test at intervals
  5. Creates incremental commits
  6. When --feedback is provided, resumes previous session to address review comments

Session Persistence:
  Session ID is saved to .ralph/session in the worktree directory
  This enables resuming the Claude session after code review feedback

Configuration:
  Uses config/implement.md for agent configuration

JSON Payload Schema:
  {
    "id": "HLN-123",        // Issue identifier
    "title": "Issue title", // Brief description
    "description": "..."    // Full issue description for context
  }
`)
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
  .addHelpText("after", `
Examples:
  $ echo '{"id": "HLN-123", "title": "Add feature", "description": "..."}' | ralph review
  $ ralph review --input issue.json
  $ ralph review -v --input issue.json    # with verbose logging

Prerequisites:
  Implement step must be completed first

Behavior:
  1. Invokes Codex in headless mode with code-review skill
  2. Reviews code changes from base branch (main)
  3. Only allows git read commands (status, diff, log) - no writes
  4. In standalone mode, exits with result
  5. In 'run' mode, returns to implement step if changes needed (max 4 attempts)

Output:
  Creates file: _thoughts/code-review/<issue-id>_<topic-name>.md
  Example: _thoughts/code-review/HLN-123_add_feature.md

Exit Codes:
  0 - Code meets quality bar
  1 - Code needs changes (feedback file path printed to stdout)

Configuration:
  Uses config/review.md for agent configuration

JSON Payload Schema:
  {
    "id": "HLN-123",        // Issue identifier
    "title": "Issue title", // Brief description
    "description": "..."    // Full issue description for context
  }
`)
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
  .addHelpText("after", `
Examples:
  $ echo '{"id": "HLN-123", "title": "Add feature", "description": "..."}' | ralph publish
  $ ralph publish --input issue.json
  $ ralph publish -v --input issue.json    # with verbose logging

Prerequisites:
  - Review step must be completed successfully
  - GitHub CLI (gh) must be installed and in PATH
  - Must be authenticated with gh (run 'gh auth login' if needed)

Behavior:
  1. Invokes Codex in headless mode to verify implementation is complete
  2. Checks all plan items were implemented
  3. Verifies all tests were written
  4. Creates a pull request using GitHub CLI (gh)

Output:
  On success: Prints the pull request URL
  On failure: Prints error message

PR Format:
  Title: [<issue-id>] <issue-title>
  Body:  Includes issue ID, title, and description

Configuration:
  Uses config/publish.md for agent configuration

JSON Payload Schema:
  {
    "id": "HLN-123",        // Used in PR title
    "title": "Issue title", // Used in PR title
    "description": "..."    // Included in PR body
  }
`)
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
