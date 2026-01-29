import { spawn } from "bun";
import type { StepConfig } from "../types.js";

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

  const proc = spawn([config.command, ...args], {
    cwd,
    stdin: "inherit",
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

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
  const proc = spawn([command, ...args], {
    cwd,
    stdin: "inherit",
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return {
    success: exitCode === 0,
    exitCode,
    stdout,
    stderr,
  };
}
