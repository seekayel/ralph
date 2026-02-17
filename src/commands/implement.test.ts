import { describe, expect, it } from "bun:test";

import { checkImplementPostconditions } from "./implement.ts";

describe("checkImplementPostconditions", () => {
  it("passes only when all required postconditions are explicitly satisfied", () => {
    expect(
      checkImplementPostconditions(`
IMPLEMENT_POSTCONDITIONS
PLAN_COMPLETE: yes
REQUIRED_TESTS: yes
CHECKS_PASSING: yes
`)
    ).toBe(true);
  });

  it("fails closed for ambiguous or incomplete output", () => {
    expect(
      checkImplementPostconditions(
        "Implemented most tasks and ran some tests successfully."
      )
    ).toBe(false);
    expect(
      checkImplementPostconditions(`
IMPLEMENT_POSTCONDITIONS
PLAN_COMPLETE: yes
REQUIRED_TESTS: yes
`)
    ).toBe(false);
  });

  it("fails when any postcondition is explicitly negative", () => {
    expect(
      checkImplementPostconditions(`
IMPLEMENT_POSTCONDITIONS
PLAN_COMPLETE: yes
REQUIRED_TESTS: no
CHECKS_PASSING: yes
`)
    ).toBe(false);
  });
});
