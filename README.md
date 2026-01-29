# Ralph

AI-assisted development workflow CLI using Claude Code and Codex.

## Prerequisites

Before using Ralph, ensure you have the following installed:

- **Bun** (v1.3.6 or higher) - Runtime and build tool
  - Install: https://bun.sh
- **gh** - GitHub CLI for creating pull requests
  - Install: https://cli.github.com/
- **claude** - Claude Code CLI for AI-assisted coding
  - Install: https://docs.anthropic.com/claude-code
- **codex** - Codex CLI for validation and review
  - Install: https://developers.openai.com/codex/cli/

## Installation

```bash
bun install
```

## Build

```bash
bun run build
```

## Making the `ralph` command available

After building, link the package globally to make the `ralph` command available from any directory:

```bash
bun link
```

This registers the `ralph` CLI globally. You only need to run this once after the initial build.

## Test

```bash
bun test
```

## Lint

```bash
bun run lint
```

## Git Worktree Structure

Ralph expects to be invoked from a git repository using the bare worktree pattern:

```
ralph-git/
├── .bare/       # Git database (bare repository)
├── .git         # File pointing to .bare/
├── main/        # Main branch worktree
└── hln-1234/    # Feature branch worktree (created by Ralph)
```

### Setting Up a Bare Worktree Repository

```bash
# Clone as bare repository
git clone --bare <repo-url> ralph-git/.bare

# Create .git file pointing to .bare
echo "gitdir: ./.bare" > ralph-git/.git

# Add main worktree
cd ralph-git
git worktree add main main
```

## Usage

Ralph accepts a JSON payload either via stdin or from a file with the `--input` flag.

### JSON Payload Format

```json
{
  "id": "HLN-9793",
  "title": "Upgrade to Node v24",
  "description": "We need to upgrade to Node v24 for security compliance."
}
```

### Run Full Workflow

Executes all steps: spawn -> research -> plan -> validate -> implement -> review -> publish

```bash
# From stdin
echo '{"id": "HLN-123", "title": "Add feature", "description": "Feature details"}' | ralph run

# From file
ralph run --input issue.json
```

### Individual Steps

Each step can be run independently:

```bash
# Create worktree and branch
ralph spawn --input issue.json

# Research the codebase
ralph research --input issue.json

# Create implementation plan
ralph plan --input issue.json

# Validate the plan
ralph validate --input issue.json

# Implement the plan
ralph implement --input issue.json

# Review the code
ralph review --input issue.json

# Create pull request
ralph publish --input issue.json
```

### Verbose Mode

Enable detailed debug logging for troubleshooting:

```bash
# Verbose mode with run command
ralph --verbose run --input issue.json

# Verbose mode with individual steps
ralph --verbose spawn --input issue.json
ralph --verbose research --input issue.json
```

Verbose mode outputs timestamped debug information including:
- Config file loading and parsing
- Command execution details
- Git worktree operations
- Agent invocation parameters
- Session ID management

### Help

```bash
ralph --help
ralph <command> --help
```

## Workflow Steps

### 1. Spawn
Creates a new git worktree and branch based on the issue ID. Runs install, build, and test commands from README.md.

Shell commands (install, build, test) have a default timeout of 5 minutes (300,000 ms). Configure via environment variable:

```bash
# Set custom timeout (in milliseconds)
export RALPH_COMMAND_TIMEOUT_MS=600000  # 10 minutes
```

### 2. Research
Uses Claude Code to explore the codebase and document findings in `_thoughts/research/`.

### 3. Plan
Uses Claude Code to create an implementation plan in `_thoughts/plan/`.

### 4. Validate
Uses Codex to validate the plan meets quality standards. May loop back to Plan if changes needed.

### 5. Implement
Uses Claude Code to implement the plan. Runs lint/build/test at intervals.

### 6. Review
Uses Codex to review code changes. May loop back to Implement if changes needed.

### 7. Publish
Verifies implementation completeness and creates a pull request using `gh`.

## Configuration

Step configurations are stored in `config/` as markdown files with YAML front-matter:

```markdown
---
command: claude
args:
  - "--headless"
  - "--allowedTools"
  - "Read,Grep,Glob"
---

Prompt content with ${issue.id}, ${issue.title}, ${issue.description} substitution.
```

## Output Files

Ralph generates workflow artifacts in `_thoughts/`:

```
_thoughts/
├── research/       # Research findings
├── plan/           # Implementation plans
├── validate/       # Validation notes
├── implement/      # Implementation progress
├── code-review/    # Code review feedback
└── test/           # Test results
```

## License

MIT
