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
import type {
  StepAgentOverrides,
  WorkflowContext,
  WorkflowStepName,
} from "./types.js";
import { readPayloadFromStdinOrFile } from "./utils/config.js";
import { getGitRepositoryRoot, isGitRepository } from "./utils/git.js";
import { debug, setVerbose, setDebugDir, setDryRun } from "./utils/logger.js";
import { createWorkflowContext } from "./utils/workflow-context.js";

const program = new Command();

program
  .name("ralph")
  .description(
    "AI-assisted development workflow CLI using Claude Code and Codex"
  )
  .version("0.1.0")
  .option("-v, --verbose", "Enable verbose logging for debugging")
  .option("-d, --debug-dir <path>", "Directory to write debug artifacts (prompt, stdout, stderr, repro script)")
  .option("-n, --dry-run", "Print the command that would be executed without running it")
  .addHelpText("after", `
Ralph automates the software development workflow using AI agents.

Default agent mapping:
  - Claude Code for research and implementation
  - Codex for planning, validation, code review, and publish verification

Prerequisites:
  - Bun v1.3.6+     Runtime and build tool
  - gh              GitHub CLI for creating pull requests
  - claude          Claude Code CLI for AI-assisted coding
  - codex           Codex CLI for planning, validation, review, and publish verification

Repository Requirement:
  Ralph must be run from inside a git repository.

Commands:
  run        Full workflow: research -> plan -> validate -> implement -> review -> publish
  spawn      Create git worktree and branch, run install/build/test
  research   Analyze codebase with Claude Code
  plan       Create implementation plan with Codex
  validate   Validate plan with Codex
  implement  Implement the plan with Claude Code
  review     Code review with Codex
  publish    Verify and create pull request

Debugging:
  Use --verbose (-v) to see detailed execution logs including:
    - Full command lines being executed
    - Working directories
    - Relevant environment variables (RALPH_*, CLAUDE_*, NODE_*)
    - stdout/stderr content (truncated for large outputs)
    - Execution duration

  Use --dry-run (-n) to print the exact command that would be executed
  without actually running it. The output is formatted as a copy-pastable
  shell command that you can run manually in the terminal.

  Use --debug-dir <path> to write debug artifacts for each step:
    <path>/research-<id>-<timestamp>/
    ├── prompt.txt       # Full prompt sent to the agent
    ├── stdout.txt       # Complete stdout output
    ├── stderr.txt       # Complete stderr output
    ├── debug-info.json  # Metadata (command, args, env, timing)
    └── repro.sh         # Executable script to reproduce the command

  Examples:
    $ ralph research -n --input issue.json        # dry-run to see command
    $ ralph research -v --debug-dir ./debug-output --input issue.json
    $ ./debug-output/research-HLN-123-2024-01-15T10-30-00-000Z/repro.sh

For command-specific help, run: ralph <command> --help
`)
  .showHelpAfterError("(run ralph --help for usage information)")
  .hook("preAction", async (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose) {
      setVerbose(true);
      debug("Verbose logging enabled");
    }
    if (opts.debugDir) {
      // Ensure debug directory exists
      const { $ } = await import("bun");
      await $`mkdir -p ${opts.debugDir}`.quiet();
      setDebugDir(opts.debugDir);
      debug(`Debug artifacts will be written to: ${opts.debugDir}`);
    }
    if (opts.dryRun) {
      setDryRun(true);
      debug("Dry-run mode enabled");
    }
  });

async function validateEnvironment(): Promise<string> {
  const cwd = process.cwd();
  const isRepo = await isGitRepository(cwd);

  if (!isRepo) {
    console.error("Error: Ralph must be run from inside a git repository.");
    process.exit(1);
  }

  const repoRoot = await getGitRepositoryRoot(cwd);
  if (!repoRoot) {
    console.error("Error: Failed to determine git repository root.");
    process.exit(1);
  }

  return repoRoot;
}

program
  .command("run")
  .description("Run the full Ralph workflow (research -> plan -> validate -> implement -> review -> publish)")
  .option("-i, --input <file>", "JSON payload file (reads from stdin if not provided)")
  .option("--research-agent <command>", "Override the agent command for the research step")
  .option("--plan-agent <command>", "Override the agent command for the plan step")
  .option("--validate-agent <command>", "Override the agent command for the validate step")
  .option("--implement-agent <command>", "Override the agent command for the implement step")
  .option("--review-agent <command>", "Override the agent command for the review step")
  .option("--publish-agent <command>", "Override the agent command for the publish step")
  .addHelpText("after", `
Examples:
  $ echo '{"id": "HLN-123", "title": "Add feature", "description": "Feature details"}' | ralph run
  $ ralph run --input issue.json
  $ ralph run -v --input issue.json    # with verbose logging

Workflow Steps:
  1. research   - Analyze codebase using Claude Code (outputs _thoughts/research/)
  2. plan       - Create implementation plan using Codex (outputs _thoughts/plan/)
  3. validate   - Validate plan using Codex (retries up to 4 times)
  4. implement  - Implement the plan using Claude Code
  5. review     - Code review using Codex (retries up to 4 times)
  6. publish    - Verify completion and create pull request

Artifact Naming:
  Workflow artifacts in _thoughts/ should use NNN_topic_name.md
  (example: 001_add_feature.md, as defined by the RPI skill)

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
      const result = await run(rootDir, issue, {
        agentOverrides: createRunAgentOverrides(options),
      });

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
  .option("--agent <command>", "Override the agent command for this step")
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
  Creates file: _thoughts/research/NNN_topic_name.md
  Example: _thoughts/research/001_add_feature.md
  Naming is defined by the research-plan-implement skill.

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

    try {
      const issue = await readPayloadFromStdinOrFile(options.input);
      const context = createContextFromIssue(
        issue,
        rootDir,
        createStepAgentOverrides("research", options.agent)
      );
      const result = await research(context);

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
  .description("Run the planning phase using Codex")
  .option("-i, --input <file>", "JSON payload file (reads from stdin if not provided)")
  .option("--agent <command>", "Override the agent command for this step")
  .addHelpText("after", `
Examples:
  $ echo '{"id": "HLN-123", "title": "Add feature", "description": "..."}' | ralph plan
  $ ralph plan --input issue.json
  $ ralph plan -v --input issue.json    # with verbose logging

Prerequisites:
  Research step must be completed first (_thoughts/research/ file must exist)

Behavior:
  1. Invokes Codex in headless mode with research-plan-implement workflow
  2. Creates implementation and testing plan based on research findings
  3. Only allows git read commands (status, diff, log) - no writes
  4. Retries once on failure before exiting with error

Output:
  Creates file: _thoughts/plan/NNN_topic_name.md
  Example: _thoughts/plan/001_add_feature.md
  Naming is defined by the research-plan-implement skill.

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

    try {
      const issue = await readPayloadFromStdinOrFile(options.input);
      const context = createContextFromIssue(
        issue,
        rootDir,
        createStepAgentOverrides("plan", options.agent)
      );
      const result = await plan(context);

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
  .option("--agent <command>", "Override the agent command for this step")
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

    try {
      const issue = await readPayloadFromStdinOrFile(options.input);
      const context = createContextFromIssue(
        issue,
        rootDir,
        createStepAgentOverrides("validate", options.agent)
      );
      const result = await validate(context);

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
  .option("--agent <command>", "Override the agent command for this step")
  .addHelpText("after", `
Examples:
  $ echo '{"id": "HLN-123", "title": "Add feature", "description": "..."}' | ralph implement
  $ ralph implement --input issue.json
  $ ralph implement -i issue.json --feedback _thoughts/code-review/001_add_feature.md
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

    try {
      const issue = await readPayloadFromStdinOrFile(options.input);
      const context = createContextFromIssue(
        issue,
        rootDir,
        createStepAgentOverrides("implement", options.agent)
      );

      let reviewFeedback: string | undefined;
      if (options.feedback) {
        reviewFeedback = await Bun.file(options.feedback).text();
      }

      const result = await implement(context, reviewFeedback);

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
  .option("--agent <command>", "Override the agent command for this step")
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
  Creates file: _thoughts/code-review/NNN_topic_name.md
  Example: _thoughts/code-review/001_add_feature.md
  Naming is defined by the research-plan-implement skill.

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

    try {
      const issue = await readPayloadFromStdinOrFile(options.input);
      const context = createContextFromIssue(
        issue,
        rootDir,
        createStepAgentOverrides("review", options.agent)
      );
      const result = await review(context);

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
  .option("--agent <command>", "Override the agent command for this step")
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

    try {
      const issue = await readPayloadFromStdinOrFile(options.input);
      const context = createContextFromIssue(
        issue,
        rootDir,
        createStepAgentOverrides("publish", options.agent)
      );
      const result = await publish(context);

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
  rootDir: string,
  agentOverrides?: StepAgentOverrides
): WorkflowContext {
  return createWorkflowContext(issue, rootDir, agentOverrides);
}

function createStepAgentOverrides(
  step: WorkflowStepName,
  agentCommand?: string
): StepAgentOverrides | undefined {
  const normalizedCommand = agentCommand?.trim();
  if (!normalizedCommand) {
    return undefined;
  }

  return { [step]: normalizedCommand };
}

function createRunAgentOverrides(options: {
  researchAgent?: string;
  planAgent?: string;
  validateAgent?: string;
  implementAgent?: string;
  reviewAgent?: string;
  publishAgent?: string;
}): StepAgentOverrides | undefined {
  const overrides: StepAgentOverrides = {};

  if (options.researchAgent?.trim()) {
    overrides.research = options.researchAgent.trim();
  }
  if (options.planAgent?.trim()) {
    overrides.plan = options.planAgent.trim();
  }
  if (options.validateAgent?.trim()) {
    overrides.validate = options.validateAgent.trim();
  }
  if (options.implementAgent?.trim()) {
    overrides.implement = options.implementAgent.trim();
  }
  if (options.reviewAgent?.trim()) {
    overrides.review = options.reviewAgent.trim();
  }
  if (options.publishAgent?.trim()) {
    overrides.publish = options.publishAgent.trim();
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

program.parse();
