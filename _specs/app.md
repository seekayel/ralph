This application is a CLI tool called Ralph. It is built and bundled using Bun 1.3.6 or higher. It runs one of a series of operations in a software development process when it is invoked. It is invoked with a JSON payload that contains an issue ID, an issue title, and an issue description. The CLI, if invoked with `run`, will run all steps in the ralph-cli workflow. Otherwise, each of the individual steps can be run with `ralph` and then the name of the step. For example, `ralph research`, or `ralph plan`. The README.md of this repo should contain all information needed by a human to be able to check out, install, build, and run any associated tests on this repository. There should be example execution commands for the Ralph workflow. Each CLI action should have an associated --help flag, which prints all relevant command flags and arguments that are possible. Ralph expects to be invoked from inside a git repository


# Prerequisites

The README.md must document the following required dependencies:
- **Bun** (v1.3.6 or higher) - Runtime and build tool
- **gh** - GitHub CLI for creating pull requests in the Publish step
- **claude** - Claude Code CLI for AI-assisted coding sessions
- **codex** - Codex CLI for planning, validation, review, and publish sessions

# General Guidance

**Error Handling**
If the CLI is invoked in a directory that is not a Git directory, it should print an error message saying such and exit.

# Asset Bundling

The Ralph CLI bundles its configuration files and agent definitions into the compiled binary. This allows Ralph to be installed and run from any location without requiring the source `config/` and `_agents/` directories to be present.

**Build-Time Bundling:**
- The `scripts/bundle-assets.ts` script runs before each build (via `prebuild` npm script)
- It reads all markdown files from `config/` and `_agents/` directories
- It generates `src/generated/embedded-assets.ts` containing all file contents as string literals
- This generated file is bundled into the final `dist/index.js` binary

**Runtime Extraction:**
- When Ralph runs a workflow step, it extracts the bundled `_agents/` to the git repo's `.ralph/` directory
- The path becomes: `$REPO_ROOT/.ralph/_agents/` (where `.ralph/` is a sibling of `.git/`)
- A hash file (`.ralph/.assets-hash`) tracks whether extraction is needed
- Config files are loaded directly from embedded assets (no extraction needed)

**Directory Structure After Extraction:**
```
git-dir/
├── .ralph/
│   ├── .assets-hash     # Hash for cache invalidation
│   └── _agents/
│       ├── AGENTS.md
│       ├── agents/
│       │   ├── codebase-analyzer.md
│       │   ├── codebase-locator.md
│       │   └── pattern-finder.md
│       └── skills/
│           ├── code-review/
│           │   └── skill.md
│           └── research-plan-implement/
│               └── skill.md
├── _thoughts/           # Workflow artifacts
└── ... (project files)
```

**Skill Path References:**
Config files reference skills using the `.ralph/` prefix path, which resolves to the repository root:
```
Use the research-plan-implement workflow in `.ralph/_agents/skills/research-plan-implement/skill.md`
```

# AI Agent Invocation

Ralph uses two AI agents for different workflow steps by default:

- **Claude Code** (`claude`) - Used for Research and Implement steps
- **Codex** (`codex`) - Used for Plan, Validate, Review, and Publish steps

Invoke each agent using its respective CLI command. Refer to `claude --help` and `codex --help` for available command flags and options. Ralph should invoke these commands as subprocesses and wait until the process returns before proceeding to the next step. Each step should allow for overriding the used coding agent.

# Configuration Files

Configuration files define which agent and flags to use for each workflow step. Config files are stored in `config/` during development and embedded into the CLI binary at build time. They use markdown format with YAML front-matter.

**Available Config Files:**
- `config/research.md` - Research step configuration
- `config/plan.md` - Plan step configuration
- `config/validate.md` - Validate step configuration
- `config/implement.md` - Implement step configuration
- `config/review.md` - Review step configuration
- `config/publish.md` - Publish step configuration

**Format:**
```markdown
---
command: claude
args:
  - "--print"
  - "--allowed-tools"
  - "Read,Grep,Glob"
---

This is the prompt that will be sent to the model with ${variable} substitution.

Issue: ${id}
Title: ${title}
Description: ${description}

Use the skill in `.ralph/_agents/skills/research-plan-implement/skill.md`
```

**Variable Substitution:**
Both the front-matter and body of the config file should be processed with `${}` variable substitution before execution. Available variables are the JSON payload fields: `${id}`, `${title}`, and `${description}`.

**Skill Path Validation:**
Before running an agent, the CLI validates that all skill paths referenced in the prompt (matching pattern `.ralph/_agents/skills/*/skill.md`) exist in the worktree's `.ralph/` directory.

# File Naming Convention

The `NNN_topic_name.md` naming convention for files in `_thoughts/` directories is defined in the research-plan-implement (RPI) skill located at `.ralph/_agents/skills/research-plan-implement/skill.md`. Refer to that skill for the specific naming rules and sequential numbering scheme.

# JSON Payload Schema

The JSON payload passed to Ralph must contain the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | The issue identifier (e.g., `HLN-9793`) |
| `title` | string | The issue title |
| `description` | string | The full issue description |

**Example:**
```json
{
    "id": "HLN-9793",
    "title": "Upgrade to Node v24",
    "description": "We are on node 18 but need to be on v24+ to match our security and SOC-2 audit requirements.\n\nSee http://drive.google.com/p/9876fghgj/some-file.docx"
}
```

# CLI

The cli takes a JSON payload either via standard input or from a file via a command-line flag and argument. The command used to invoke each action (the agent, the flags and prompt file) should all be stored in config files that the core code runs. We expect that which agent is run on which step will change in the future.

## Global Flags

The following flags are available for all commands:

| Flag | Short | Description |
|------|-------|-------------|
| `--verbose` | `-v` | Enable verbose logging for debugging |
| `--debug-dir <path>` | `-d` | Directory to write debug artifacts (prompt, stdout, stderr, repro script) |
| `--dry-run` | `-n` | Print the exact command that would be executed without running it |

**Dry Run Mode:**
The `--dry-run` flag prints a copy-pastable shell command to the console instead of executing it. This is useful for:
- Debugging the command that Ralph would execute
- Manually running the command in a terminal with modifications
- Understanding what agent invocation looks like for a given step

The output includes:
- The working directory (`cd` command)
- The full command with all arguments
- The complete prompt passed via stdin (using a heredoc)

**Example:**
```bash
$ ralph research --dry-run --input issue.json

# DRY RUN - Command that would be executed:
# ─────────────────────────────────────────────────────
# Working directory: /path/to/ralph-git/hln-123
cd "/path/to/ralph-git/hln-123"

# Command (prompt passed via stdin, 1234 chars):
cat <<'RALPH_PROMPT_EOF' | claude --print --dangerously-skip-permissions ...
[prompt content here]
RALPH_PROMPT_EOF
# ─────────────────────────────────────────────────────
```

## Run
The Run action takes a JSON payload either via standard input or from a file via a command-line flag and argument. It then implements the full Ralph CLI workflow using that JSON payload.


## Full CLI Workflow
1. Research
2. Plan
3. Validate
4. Implement
5. Review
6. Publish


## Research

**Action**
Invoke a claude code session headless with a prompt to use the research-plan-implement workflow in `.ralph/_agents/skills/research-plan-implement/skill.md` to research the code base in relation to the requested issue. Allow git read commands (status, diff, log, etc) but no git edits (add, commit, merge, push, checkout etc).

**Success Criteria**
Only proceed if the claude code session successfully generates a research report `_thoughts/research/NNN_topic_name.md` file. Otherwise retry once, if fails a second time then print error message and exit with a failure.


## Plan

**Action**
Invoke a codex session headless with a prompt to use the research-plan-implement workflow in `.ralph/_agents/skills/research-plan-implement/skill.md` to plan an implementation and testing plan for the the code base in relation to the requested issue using the `_thoughts/research/NNN_topic_name.md` research. Allow git read commands (status, diff, log, etc) but no git edits (add, commit, merge, push, checkout etc).

**Success Criteria**
Only proceed if the codex session successfully generates a `_thoughts/plan/NNN_topic_name.md` file. Otherwise retry once, if fails a second time then print error message and exit with a failure.


## Validate

**Action**
Invoke a codex session headless with a prompt to use the plan file checking that it specifies a plan that will implement the feature requested and defines a testing plan that will ensure the plan is implemented and that the implemented code works.

**Success Criteria**
Output either that the plan meets our quality bar or highlight the specific parts of the plan that are problematic and why. If there are changes needed to the plan then go back and invoke the Plan stage if run in full work flow `run` mode, if in single `validate` mode then exit with message as to outcome. If the  validate requests changes a 4th time then instead of invoking the Plan step, instead print error messaging and exit.


## Implement

**Action**
Invoke a claude code session headless with a prompt to use the research-plan-implement workflow in `.ralph/_agents/skills/research-plan-implement/skill.md` to implement the plan as detailed in `_thoughts/plan/NNN_topic_name.md` based on the research in `_thoughts/research/NNN_topic_name.md`. Save the session id either in a local variable or temp file, for use in resuming a session if the code review step requires changes. Incremental commits are acceptable. The agent should run lint, build and test at consistent intervals. Tests that cover the feature being added should be added as per the testing plan in the plan file.

If the code review step invokes this step then provide the code review feedback file to the resumed claude code session along with instructions that the highlighted issues need to be resolved.

**Success Criteria**
There are tests that exercise the added feature. The added feature has been written in code as per the plan. All steps of the plan were implemented. There are no remaining actions or tasks. Commit any local changes.


## Review

**Action**
Invoke a codex session headless with a prompt to use the code-review skill in `.ralph/_agents/skills/code-review/skill.md` to do a code review of changes from the base branch (main). Allow git read commands (status, diff, log, etc) but no git edits (add, commit, merge, push, checkout etc). Ask for the review to be written to `_thoughts/code-review/NNN_topic_name.md` and structure output returned with if the code met quality bar.

**Success Criteria**
Output either that the code changes meet our quality bar or highlight the specific parts of the code that are problematic and why. If there are changes needed then go back and invoke the Implement stage if run in full work flow `run` mode, if in single `review` mode then exit with message as to outcome. If the code review requests changes a 4th time then instead of invoking the implement step, instead print error messaging and exit.


## Publish

**Action**
Invoke a codex session headless with a prompt to confirm that the changes on the current branch implement all the parts of the plan file, that no items were left incomplete and that all tests were written. Allow git read commands (status, diff, log, etc) but no git edits (add, commit, merge, push, checkout etc).

**Success Criteria**
If the `gh` CLI is not found in the system PATH, print an error message instructing the user to install the GitHub CLI (e.g., "Error: GitHub CLI (gh) is required but not found. Please install it: https://cli.github.com/") and exit with a failure code.

If everything was implemented then use the `gh` CLI tool to create a pull request from the local branch. Otherwise print error message and exit.
