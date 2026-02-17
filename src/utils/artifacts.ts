import { Glob } from "bun";

const ARTIFACT_FILE_REGEX = /^\d{3}_[a-z0-9]+(?:_[a-z0-9]+)*\.md$/;

export function isWorkflowArtifactFileName(fileName: string): boolean {
  return ARTIFACT_FILE_REGEX.test(fileName);
}

export async function findWorkflowArtifact(
  worktreeDir: string,
  subdir: string
): Promise<string | null> {
  const artifactsDir = `${worktreeDir}/_thoughts/${subdir}`;
  const glob = new Glob("*.md");
  const matches: string[] = [];

  for await (const file of glob.scan(artifactsDir)) {
    if (isWorkflowArtifactFileName(file)) {
      matches.push(file);
    }
  }

  if (matches.length === 0) {
    return null;
  }

  matches.sort();
  return `${artifactsDir}/${matches[matches.length - 1]}`;
}
