import { spawn } from "bun";
import type { StepConfig } from "../types.js";
import {
  debug,
  debugObject,
  isVerbose,
  isDryRun,
  getFilteredEnv,
  logCommandExecution,
  writeDebugArtifact,
  getDebugDir,
  formatDryRunCommand,
  type CommandDebugInfo,
} from "./logger.js";

export interface ProcessResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  debugArtifactDir?: string;
}

export interface RunAgentOptions {
  stepName?: string;
  env?: Record<string, string>;
}

export async function runAgentCommand(
  config: StepConfig,
  cwd: string,
  options: RunAgentOptions = {}
): Promise<ProcessResult> {
  const { stepName = "agent", env: extraEnv = {} } = options;
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  debug(`Executing agent command: ${config.command}`);
  debug(`Working directory: ${cwd}`);
  debugObject("Command arguments", config.args);

  // Merge process env with extra env vars
  const processEnv = { ...process.env, ...extraEnv } as Record<string, string | undefined>;

  // Log environment variables being passed
  if (isVerbose() && Object.keys(extraEnv).length > 0) {
    debugObject("Extra environment variables", extraEnv);
  }

  // Dry-run mode: print the command and return without executing
  if (isDryRun()) {
    const dryRunOutput = formatDryRunCommand(config.command, config.args, cwd, config.prompt);
    console.log("\n# DRY RUN - Command that would be executed:");
    console.log("# ─────────────────────────────────────────────────────");
    console.log(dryRunOutput);
    console.log("# ─────────────────────────────────────────────────────\n");

    return {
      success: true,
      exitCode: 0,
      stdout: "",
      stderr: "",
    };
  }

  // Pass prompt via stdin to avoid issues with special characters and long prompts
  const proc = spawn([config.command, ...config.args], {
    cwd,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: processEnv,
  });

  // Write prompt to stdin and close it (Bun's FileSink API)
  proc.stdin.write(config.prompt);
  proc.stdin.end();

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  const durationMs = Date.now() - startTime;

  // Build debug info structure
  const debugInfo: CommandDebugInfo = {
    timestamp,
    command: config.command,
    args: config.args,
    cwd,
    env: getFilteredEnv(processEnv),
    promptLength: config.prompt.length,
    exitCode,
    stdout,
    stderr,
    durationMs,
  };

  // Log detailed execution info
  logCommandExecution(debugInfo);

  // Write debug artifacts if debug dir is configured
  let debugArtifactDir: string | undefined;
  if (getDebugDir()) {
    const artifactDir = await writeDebugArtifact(stepName, debugInfo, config.prompt);
    if (artifactDir) {
      debugArtifactDir = artifactDir;
      console.log(`[DEBUG] Debug artifacts written to: ${artifactDir}`);
      console.log(`[DEBUG] To reproduce: ${artifactDir}/repro.sh`);
    }
  }

  // Log error info prominently if command failed
  if (exitCode !== 0) {
    console.error(`\n[ERROR] Command failed with exit code ${exitCode}`);
    console.error(`[ERROR] Command: ${config.command} ${config.args.join(" ")}`);
    console.error(`[ERROR] Working directory: ${cwd}`);
    if (stderr) {
      console.error(`[ERROR] stderr:\n${stderr.slice(0, 2000)}${stderr.length > 2000 ? "\n... (truncated)" : ""}`);
    }
    if (debugArtifactDir) {
      console.error(`[ERROR] Full debug info available at: ${debugArtifactDir}`);
    }
  }

  return {
    success: exitCode === 0,
    exitCode,
    stdout,
    stderr,
    debugArtifactDir,
  };
}

export async function checkCommandExists(command: string): Promise<boolean> {
  try {
    const proc = spawn(["which", command], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

export async function runCommand(
  command: string,
  args: string[],
  cwd: string
): Promise<ProcessResult> {
  debug(`Executing command: ${command} ${args.join(" ")}`);
  debug(`Working directory: ${cwd}`);

  const proc = spawn([command, ...args], {
    cwd,
    stdin: "inherit",
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  debug(`Command exited with code: ${exitCode}`);

  return {
    success: exitCode === 0,
    exitCode,
    stdout,
    stderr,
  };
}
