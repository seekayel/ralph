let verboseEnabled = false;
let debugDir: string | null = null;
let dryRunEnabled = false;

export function setVerbose(enabled: boolean): void {
  verboseEnabled = enabled;
}

export function isVerbose(): boolean {
  return verboseEnabled;
}

export function setDebugDir(dir: string): void {
  debugDir = dir;
}

export function getDebugDir(): string | null {
  return debugDir;
}

export function setDryRun(enabled: boolean): void {
  dryRunEnabled = enabled;
}

export function isDryRun(): boolean {
  return dryRunEnabled;
}

export function debug(message: string, ...args: unknown[]): void {
  if (verboseEnabled) {
    const timestamp = new Date().toISOString();
    console.log(`[DEBUG ${timestamp}] ${message}`, ...args);
  }
}

export function debugObject(label: string, obj: unknown): void {
  if (verboseEnabled) {
    const timestamp = new Date().toISOString();
    console.log(`[DEBUG ${timestamp}] ${label}:`);
    console.log(JSON.stringify(obj, null, 2));
  }
}

export function info(message: string, ...args: unknown[]): void {
  if (verboseEnabled) {
    console.log(`[INFO] ${message}`, ...args);
  }
}

// Sensitive environment variable patterns to redact
const SENSITIVE_ENV_PATTERNS = [
  /^(API_KEY|SECRET|PASSWORD|TOKEN|CREDENTIAL|AUTH|PRIVATE)/i,
  /_KEY$/i,
  /_SECRET$/i,
  /_TOKEN$/i,
  /_PASSWORD$/i,
  /^(AWS_|ANTHROPIC_|OPENAI_|GITHUB_TOKEN)/i,
];

function isSensitiveEnvVar(key: string): boolean {
  return SENSITIVE_ENV_PATTERNS.some((pattern) => pattern.test(key));
}

export function getFilteredEnv(env: Record<string, string | undefined>): Record<string, string> {
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      filtered[key] = isSensitiveEnvVar(key) ? "[REDACTED]" : value;
    }
  }
  return filtered;
}

export interface CommandDebugInfo {
  timestamp: string;
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  promptFile?: string;
  promptLength: number;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export function formatDryRunCommand(command: string, args: string[], cwd: string, prompt: string): string {
  const lines: string[] = [];

  // Format the command with proper quoting
  const quotedArgs = args.map((arg) => {
    if (/[\s"'$`\\]/.test(arg)) {
      return `"${arg.replace(/"/g, '\\"')}"`;
    }
    return arg;
  });

  lines.push(`# Working directory: ${cwd}`);
  lines.push(`cd "${cwd}"`);
  lines.push("");
  lines.push(`# Command (prompt passed via stdin, ${prompt.length} chars):`);
  lines.push(`cat <<'RALPH_PROMPT_EOF' | ${command} ${quotedArgs.join(" ")}`);
  lines.push(prompt);
  lines.push("RALPH_PROMPT_EOF");

  return lines.join("\n");
}

export function formatReproCommand(info: CommandDebugInfo): string {
  const lines: string[] = [
    "#!/bin/bash",
    "# Auto-generated debug reproduction script",
    `# Generated at: ${info.timestamp}`,
    `# Original duration: ${info.durationMs}ms`,
    `# Exit code: ${info.exitCode}`,
    "",
    "set -e",
    "",
    `# Change to working directory`,
    `cd "${info.cwd}"`,
    "",
  ];

  // Add relevant environment variables (non-sensitive, non-standard)
  const relevantEnvVars = Object.entries(info.env).filter(([key, value]) => {
    // Skip redacted values and common shell vars
    if (value === "[REDACTED]") return false;
    if (["_", "PWD", "OLDPWD", "SHLVL", "HOME", "USER", "SHELL", "TERM", "LANG", "PATH"].includes(key)) return false;
    // Include RALPH_ prefixed and other potentially relevant vars
    return key.startsWith("RALPH_") || key.startsWith("CLAUDE_") || key.startsWith("NODE_");
  });

  if (relevantEnvVars.length > 0) {
    lines.push("# Environment variables");
    for (const [key, value] of relevantEnvVars) {
      lines.push(`export ${key}="${value.replace(/"/g, '\\"')}"`);
    }
    lines.push("");
  }

  // Format the command
  const quotedArgs = info.args.map((arg) => {
    // Quote args that contain spaces or special characters
    if (/[\s"'$`\\]/.test(arg)) {
      return `"${arg.replace(/"/g, '\\"')}"`;
    }
    return arg;
  });

  if (info.promptFile) {
    lines.push(`# Run command with prompt from file`);
    lines.push(`${info.command} ${quotedArgs.join(" ")} < "${info.promptFile}"`);
  } else {
    lines.push(`# Run command (prompt was passed via stdin, ${info.promptLength} chars)`);
    lines.push(`# To reproduce, create a prompt file and pipe it in:`);
    lines.push(`# cat prompt.txt | ${info.command} ${quotedArgs.join(" ")}`);
    lines.push(`${info.command} ${quotedArgs.join(" ")}`);
  }

  return lines.join("\n");
}

export async function writeDebugArtifact(
  stepName: string,
  info: CommandDebugInfo,
  prompt: string
): Promise<string | null> {
  const dir = debugDir;
  if (!dir) {
    return null;
  }

  const timestamp = info.timestamp.replace(/[:.]/g, "-");
  const baseDir = `${dir}/${stepName}-${timestamp}`;

  try {
    await Bun.write(`${baseDir}/prompt.txt`, prompt);
    await Bun.write(`${baseDir}/stdout.txt`, info.stdout || "(empty)");
    await Bun.write(`${baseDir}/stderr.txt`, info.stderr || "(empty)");
    await Bun.write(`${baseDir}/debug-info.json`, JSON.stringify({ ...info, prompt: `See prompt.txt (${info.promptLength} chars)` }, null, 2));

    // Update info with prompt file path for repro script
    const reproInfo = { ...info, promptFile: `${baseDir}/prompt.txt` };
    await Bun.write(`${baseDir}/repro.sh`, formatReproCommand(reproInfo));

    // Make repro script executable
    const { $ } = await import("bun");
    await $`chmod +x ${baseDir}/repro.sh`.quiet();

    debug(`Debug artifacts written to: ${baseDir}`);
    return baseDir;
  } catch (error) {
    debug(`Failed to write debug artifacts: ${error}`);
    return null;
  }
}

export function logCommandExecution(info: CommandDebugInfo): void {
  if (!verboseEnabled) return;

  const timestamp = new Date().toISOString();
  console.log(`\n[DEBUG ${timestamp}] ═══════════════════════════════════════════════════`);
  console.log(`[DEBUG ${timestamp}] COMMAND EXECUTION DETAILS`);
  console.log(`[DEBUG ${timestamp}] ═══════════════════════════════════════════════════`);

  // Full command line (copy-pastable)
  const quotedArgs = info.args.map((arg) => {
    if (/[\s"'$`\\]/.test(arg)) {
      return `"${arg.replace(/"/g, '\\"')}"`;
    }
    return arg;
  });
  console.log(`[DEBUG ${timestamp}] Full command:`);
  console.log(`  ${info.command} ${quotedArgs.join(" ")}`);

  console.log(`[DEBUG ${timestamp}] Working directory: ${info.cwd}`);
  console.log(`[DEBUG ${timestamp}] Prompt length: ${info.promptLength} characters`);

  // Environment variables (filtered)
  const relevantEnv = Object.entries(info.env).filter(([key]) =>
    key.startsWith("RALPH_") || key.startsWith("CLAUDE_") || key.startsWith("NODE_")
  );
  if (relevantEnv.length > 0) {
    console.log(`[DEBUG ${timestamp}] Relevant environment variables:`);
    for (const [key, value] of relevantEnv) {
      console.log(`  ${key}=${value}`);
    }
  }

  console.log(`[DEBUG ${timestamp}] ───────────────────────────────────────────────────`);
  console.log(`[DEBUG ${timestamp}] EXECUTION RESULT`);
  console.log(`[DEBUG ${timestamp}] ───────────────────────────────────────────────────`);
  console.log(`[DEBUG ${timestamp}] Exit code: ${info.exitCode}`);
  console.log(`[DEBUG ${timestamp}] Duration: ${info.durationMs}ms`);

  // stdout summary
  if (info.stdout) {
    const lines = info.stdout.split("\n");
    console.log(`[DEBUG ${timestamp}] stdout (${info.stdout.length} chars, ${lines.length} lines):`);
    if (lines.length <= 20) {
      console.log(info.stdout);
    } else {
      console.log("  [First 10 lines]");
      console.log(lines.slice(0, 10).map(l => `  ${l}`).join("\n"));
      console.log(`  ... (${lines.length - 20} lines omitted) ...`);
      console.log("  [Last 10 lines]");
      console.log(lines.slice(-10).map(l => `  ${l}`).join("\n"));
    }
  } else {
    console.log(`[DEBUG ${timestamp}] stdout: (empty)`);
  }

  // stderr summary
  if (info.stderr) {
    const lines = info.stderr.split("\n");
    console.log(`[DEBUG ${timestamp}] stderr (${info.stderr.length} chars, ${lines.length} lines):`);
    if (lines.length <= 30) {
      console.log(info.stderr);
    } else {
      console.log("  [First 15 lines]");
      console.log(lines.slice(0, 15).map(l => `  ${l}`).join("\n"));
      console.log(`  ... (${lines.length - 30} lines omitted) ...`);
      console.log("  [Last 15 lines]");
      console.log(lines.slice(-15).map(l => `  ${l}`).join("\n"));
    }
  } else {
    console.log(`[DEBUG ${timestamp}] stderr: (empty)`);
  }

  console.log(`[DEBUG ${timestamp}] ═══════════════════════════════════════════════════\n`);
}
