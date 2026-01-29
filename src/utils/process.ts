import { spawn } from "bun";
import type { StepConfig } from "../types.js";
import { debug, debugObject, isVerbose } from "./logger.js";

export interface ProcessResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runAgentCommand(
  config: StepConfig,
  cwd: string
): Promise<ProcessResult> {
  const args = [...config.args, config.prompt];

  debug(`Executing agent command: ${config.command}`);
  debug(`Working directory: ${cwd}`);
  debugObject("Command arguments", config.args);
  if (isVerbose()) {
    debug(`Prompt length: ${config.prompt.length} characters`);
  }

  const proc = spawn([config.command, ...args], {
    cwd,
    stdin: "inherit",
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  debug(`Command exited with code: ${exitCode}`);
  if (isVerbose() && stdout) {
    debug(`stdout length: ${stdout.length} characters`);
  }
  if (isVerbose() && stderr) {
    debug(`stderr length: ${stderr.length} characters`);
  }

  return {
    success: exitCode === 0,
    exitCode,
    stdout,
    stderr,
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
