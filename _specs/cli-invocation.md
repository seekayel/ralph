# CLI Invocation Best Practices

This document captures learnings from debugging CLI subprocess invocation issues, particularly when invoking the `claude` CLI from Ralph.

## Passing Prompts to Subprocesses

### Use stdin, Not Command-Line Arguments

**Problem:** Multi-line prompts with special characters (quotes, newlines, markdown) can fail when passed as command-line arguments due to shell escaping issues.

**Solution:** Pass prompts via stdin instead of as positional arguments.

```typescript
// CORRECT: Pass prompt via stdin
const proc = spawn([command, ...args], {
  stdin: "pipe",
  stdout: "pipe",
  stderr: "pipe",
});
proc.stdin.write(prompt);
proc.stdin.end();

// INCORRECT: Pass prompt as argument (prone to escaping issues)
const proc = spawn([command, ...args, prompt], { ... });
```

### Bun's stdin API

When using Bun's `spawn()` with `stdin: "pipe"`, the `proc.stdin` is a `FileSink`, not a `WritableStream`. Use the correct API:

```typescript
// CORRECT: Bun's FileSink API
proc.stdin.write(data);
proc.stdin.end();

// INCORRECT: Web Streams API (doesn't work with Bun spawn)
const writer = proc.stdin.getWriter();  // TypeError: getWriter is not a function
```

## CLI Flag Configuration

### Avoid Duplicate Flags

**Problem:** Config files accidentally contained both `--print` and `-p` (which are aliases for the same flag), causing unexpected behavior.

**Solution:** Use only one form of each flag. Prefer the long form (`--print`) in config files for clarity.

```yaml
# CORRECT
args:
  - "--print"
  - "--allowed-tools"
  - "Read,Grep,Glob"

# INCORRECT (duplicate flags)
args:
  - "--print"
  - "--allowed-tools"
  - "Read,Grep,Glob"
  - "-p"  # Duplicate of --print!
```

## Error Message Capture

### Capture Both stdout and stderr

**Problem:** Some CLIs output errors to stdout (especially in `--print` mode), not stderr. Only capturing stderr results in empty error messages.

**Solution:** Capture and report both streams when an error occurs.

```typescript
// CORRECT: Show whichever stream has content
message: `Command failed: ${result.stderr || result.stdout}`;

// INCORRECT: Only show stderr (may be empty)
message: `Command failed: ${result.stderr}`;
```

## Directory Preparation

### Create Output Directories Before Agent Invocation

**Problem:** If the agent is instructed to write to `_thoughts/research/file.md` but the directory doesn't exist, it may fail silently or produce confusing errors.

**Solution:** Create required directories before invoking the agent.

```typescript
async function ensureThoughtsDir(worktreeDir: string, subdir: string): Promise<void> {
  const dir = `${worktreeDir}/_thoughts/${subdir}`;
  await $`mkdir -p ${dir}`.quiet();
}

// Call before agent invocation
await ensureThoughtsDir(context.worktreeDir, "research");
```

**Required directories:**
- `_thoughts/research/` - Research step output
- `_thoughts/plan/` - Plan step output
- `_thoughts/implement/` - Implement step progress tracking
- `_thoughts/code-review/` - Review step output

## Debugging Subprocess Issues

### Enable Verbose Logging

When debugging subprocess invocation, log:
1. The exact command and arguments being executed
2. The working directory
3. The prompt length (not content, to avoid noise)
4. Exit code
5. Both stdout and stderr lengths
6. Full error output on failure

### Test CLI Commands Manually

Before assuming code issues, test the exact command manually:

```bash
# Test claude CLI directly
echo "test prompt" | claude --print --allowed-tools "Read,Grep,Glob"

# Check exit code
echo $?
```

## Configuration File Validation Checklist

When creating or modifying config files in `config/*.md`:

1. **No duplicate flags** - Check that short and long forms aren't both present
2. **Valid tool restrictions** - Verify `--allowed-tools` patterns are correct
3. **Prompt will be passed via stdin** - Don't rely on prompt being a positional arg
4. **Referenced paths exist** - Skill paths like `.ralph/_agents/skills/*/skill.md` must be valid
