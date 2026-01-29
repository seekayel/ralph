import { parse as parseYaml } from "yaml";
import type { Issue, StepConfig } from "../types.js";
import { debug, debugObject } from "./logger.js";

interface ConfigFrontMatter {
  command: string;
  args?: string[];
}

/**
 * Extracts skill file paths from config prompt text.
 * Looks for patterns like .ralph/_agents/skills/foo/skill.md
 */
export function extractSkillPaths(text: string): string[] {
  // Match .ralph/_agents/skills/* paths ending in .md
  // Pattern: .ralph/_agents/skills/ followed by one or more path chars (letters, numbers, -, _, /) then .md
  const skillPathRegex = /\.ralph\/_agents\/skills\/[\w\-\/]+\.md/g;
  const matches = text.match(skillPathRegex);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Validates that all skill file paths referenced in the prompt exist.
 * @param prompt - The prompt text containing skill path references
 * @param worktreeDir - The worktree directory to resolve paths from
 * @throws Error if any skill file path does not exist
 */
export async function validateSkillPaths(
  prompt: string,
  worktreeDir: string
): Promise<void> {
  const skillPaths = extractSkillPaths(prompt);

  if (skillPaths.length === 0) {
    debug("No skill paths found in prompt");
    return;
  }

  debug(`Found ${skillPaths.length} skill path(s) to validate: ${skillPaths.join(", ")}`);

  const missingPaths: string[] = [];

  for (const skillPath of skillPaths) {
    const fullPath = `${worktreeDir}/${skillPath}`;
    const file = Bun.file(fullPath);
    if (!(await file.exists())) {
      missingPaths.push(skillPath);
    }
  }

  if (missingPaths.length > 0) {
    throw new Error(
      `Skill file(s) not found: ${missingPaths.join(", ")}. ` +
        `Ensure these files exist in the worktree directory: ${worktreeDir}`
    );
  }

  debug("All skill paths validated successfully");
}

export async function loadStepConfig(
  configPath: string,
  issue: Issue,
  worktreeDir?: string
): Promise<StepConfig> {
  debug(`Loading config file: ${configPath}`);

  const file = Bun.file(configPath);
  if (!(await file.exists())) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const content = await file.text();
  debug(`Config file loaded, size: ${content.length} bytes`);

  const { frontMatter, body } = parseFrontMatter(content);
  debug(`Parsed front-matter, body length: ${body.length} characters`);

  const config = parseYaml(frontMatter) as ConfigFrontMatter;
  debugObject("Parsed config front-matter", config);

  if (!config.command) {
    throw new Error(`Config file missing required 'command' field: ${configPath}`);
  }

  const substitutedArgs = (config.args || []).map((arg) =>
    substituteVariables(arg, issue)
  );
  const substitutedPrompt = substituteVariables(body, issue);

  debug(`Variable substitution complete for issue: ${issue.id}`);
  debugObject("Final command args", substitutedArgs);

  // Validate skill paths if worktreeDir is provided
  if (worktreeDir) {
    await validateSkillPaths(substitutedPrompt, worktreeDir);
  }

  return {
    command: config.command,
    args: substitutedArgs,
    prompt: substitutedPrompt,
  };
}

function parseFrontMatter(content: string): {
  frontMatter: string;
  body: string;
} {
  const frontMatterRegex = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
  const match = content.match(frontMatterRegex);

  if (!match) {
    throw new Error("Config file must have YAML front-matter");
  }

  return {
    frontMatter: match[1],
    body: match[2].trim(),
  };
}

export function substituteVariables(template: string, issue: Issue): string {
  return template
    .replace(/\$\{issue\.id\}/g, issue.id)
    .replace(/\$\{issue\.title\}/g, issue.title)
    .replace(/\$\{issue\.description\}/g, issue.description);
}

/**
 * Validates that an issue ID is safe and well-formed.
 * Allows alphanumeric characters, hyphens, and underscores.
 * Protects against path traversal and reserved names.
 */
export function validateIssueId(id: string): void {
  const trimmedId = id.trim();

  if (!trimmedId) {
    throw new Error("Issue ID cannot be empty or whitespace-only");
  }

  // Check for path traversal attempts
  if (trimmedId.includes("..") || trimmedId.includes("/") || trimmedId.includes("\\")) {
    throw new Error("Issue ID contains invalid path characters");
  }

  // Only allow alphanumeric, hyphens, and underscores
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmedId)) {
    throw new Error(
      "Issue ID must contain only alphanumeric characters, hyphens, and underscores"
    );
  }

  // Check for reserved git names (case-insensitive)
  const reserved = ["head", "master", "main", ".git", "git"];
  if (reserved.includes(trimmedId.toLowerCase())) {
    throw new Error(`Issue ID cannot be a reserved name: ${trimmedId}`);
  }

  // Reasonable length limit (git branch names have limits)
  if (trimmedId.length > 100) {
    throw new Error("Issue ID is too long (maximum 100 characters)");
  }
}

/**
 * Validates that a title is not empty or whitespace-only.
 */
export function validateIssueTitle(title: string): void {
  if (!title.trim()) {
    throw new Error("Issue title cannot be empty or whitespace-only");
  }

  // Reasonable length limit
  if (title.length > 500) {
    throw new Error("Issue title is too long (maximum 500 characters)");
  }
}

export function parseIssuePayload(input: string): Issue {
  try {
    const parsed = JSON.parse(input);

    if (typeof parsed.id !== "string" || !parsed.id) {
      throw new Error("Issue payload must have a string 'id' field");
    }
    if (typeof parsed.title !== "string" || !parsed.title) {
      throw new Error("Issue payload must have a string 'title' field");
    }
    if (typeof parsed.description !== "string") {
      throw new Error("Issue payload must have a string 'description' field");
    }

    // Validate issue ID format and safety
    validateIssueId(parsed.id);

    // Validate title is not empty/whitespace
    validateIssueTitle(parsed.title);

    return {
      id: parsed.id.trim(),
      title: parsed.title,
      description: parsed.description,
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON payload: ${error.message}`);
    }
    throw error;
  }
}

export async function readPayloadFromStdinOrFile(
  inputFile?: string
): Promise<Issue> {
  let content: string;

  if (inputFile) {
    debug(`Reading payload from file: ${inputFile}`);
    const file = Bun.file(inputFile);
    if (!(await file.exists())) {
      throw new Error(`Input file not found: ${inputFile}`);
    }
    content = await file.text();
  } else {
    debug("Reading payload from stdin");
    content = await Bun.stdin.text();
  }

  const issue = parseIssuePayload(content.trim());
  debugObject("Parsed issue payload", issue);
  return issue;
}

export function issueToBranchName(issueId: string): string {
  return `ralph-${issueId}`;
}

export function issueToWorktreeName(issueId: string): string {
  return issueId.toLowerCase();
}

export function issueToTopicName(issueTitle: string): string {
  return issueTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 50);
}
