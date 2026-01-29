import { parse as parseYaml } from "yaml";
import type { Issue, StepConfig } from "../types.js";
import { debug, debugObject } from "./logger.js";

interface ConfigFrontMatter {
  command: string;
  args?: string[];
}

export async function loadStepConfig(
  configPath: string,
  issue: Issue
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

    return {
      id: parsed.id,
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
