import { describe, expect, it } from "bun:test";
import {
  issueToBranchName,
  issueToTopicName,
  issueToWorktreeName,
  parseIssuePayload,
  substituteVariables,
} from "./config.js";

describe("parseIssuePayload", () => {
  it("parses valid JSON payload", () => {
    const payload = JSON.stringify({
      id: "HLN-123",
      title: "Fix login bug",
      description: "Users cannot log in with valid credentials",
    });

    const issue = parseIssuePayload(payload);

    expect(issue.id).toBe("HLN-123");
    expect(issue.title).toBe("Fix login bug");
    expect(issue.description).toBe("Users cannot log in with valid credentials");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseIssuePayload("not json")).toThrow("Invalid JSON payload");
  });

  it("throws on missing id field", () => {
    const payload = JSON.stringify({
      title: "Fix bug",
      description: "Description",
    });

    expect(() => parseIssuePayload(payload)).toThrow(
      "Issue payload must have a string 'id' field"
    );
  });

  it("throws on missing title field", () => {
    const payload = JSON.stringify({
      id: "HLN-123",
      description: "Description",
    });

    expect(() => parseIssuePayload(payload)).toThrow(
      "Issue payload must have a string 'title' field"
    );
  });

  it("throws on missing description field", () => {
    const payload = JSON.stringify({
      id: "HLN-123",
      title: "Fix bug",
    });

    expect(() => parseIssuePayload(payload)).toThrow(
      "Issue payload must have a string 'description' field"
    );
  });

  it("accepts empty description", () => {
    const payload = JSON.stringify({
      id: "HLN-123",
      title: "Fix bug",
      description: "",
    });

    const issue = parseIssuePayload(payload);
    expect(issue.description).toBe("");
  });
});

describe("substituteVariables", () => {
  const issue = {
    id: "TEST-456",
    title: "Add feature",
    description: "Feature description here",
  };

  it("substitutes issue.id", () => {
    const result = substituteVariables("Issue: ${issue.id}", issue);
    expect(result).toBe("Issue: TEST-456");
  });

  it("substitutes issue.title", () => {
    const result = substituteVariables("Title: ${issue.title}", issue);
    expect(result).toBe("Title: Add feature");
  });

  it("substitutes issue.description", () => {
    const result = substituteVariables("Desc: ${issue.description}", issue);
    expect(result).toBe("Desc: Feature description here");
  });

  it("substitutes multiple variables", () => {
    const template = "[${issue.id}] ${issue.title}: ${issue.description}";
    const result = substituteVariables(template, issue);
    expect(result).toBe("[TEST-456] Add feature: Feature description here");
  });

  it("handles templates with no variables", () => {
    const result = substituteVariables("No variables here", issue);
    expect(result).toBe("No variables here");
  });

  it("handles multiple occurrences of same variable", () => {
    const result = substituteVariables("${issue.id} and ${issue.id}", issue);
    expect(result).toBe("TEST-456 and TEST-456");
  });
});

describe("issueToBranchName", () => {
  it("creates branch name with ralph- prefix", () => {
    expect(issueToBranchName("HLN-123")).toBe("ralph-HLN-123");
  });

  it("handles lowercase ids", () => {
    expect(issueToBranchName("abc-456")).toBe("ralph-abc-456");
  });
});

describe("issueToWorktreeName", () => {
  it("converts to lowercase", () => {
    expect(issueToWorktreeName("HLN-123")).toBe("hln-123");
  });

  it("handles already lowercase", () => {
    expect(issueToWorktreeName("abc-456")).toBe("abc-456");
  });
});

describe("issueToTopicName", () => {
  it("converts title to snake_case", () => {
    expect(issueToTopicName("Add New Feature")).toBe("add_new_feature");
  });

  it("removes special characters", () => {
    expect(issueToTopicName("Fix bug: login!")).toBe("fix_bug_login");
  });

  it("truncates long titles", () => {
    const longTitle = "This is a very long title that exceeds fifty characters limit";
    const result = issueToTopicName(longTitle);
    expect(result.length).toBeLessThanOrEqual(50);
  });

  it("handles empty title", () => {
    expect(issueToTopicName("")).toBe("");
  });
});
