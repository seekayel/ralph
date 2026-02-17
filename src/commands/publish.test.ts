import { describe, expect, it } from "bun:test";
import { checkImplementationComplete } from "./publish.js";

describe("checkImplementationComplete", () => {
  it("passes when output explicitly reports full completion", () => {
    expect(
      checkImplementationComplete("All items implemented - ready for PR")
    ).toBe(true);
    expect(
      checkImplementationComplete('- "All items implemented - ready for PR".')
    ).toBe(true);
  });

  it("fails closed for ambiguous or neutral output", () => {
    expect(
      checkImplementationComplete(
        "Verification finished. Please review details above."
      )
    ).toBe(false);
    expect(checkImplementationComplete("complete")).toBe(false);
  });

  it("fails for explicit incomplete output", () => {
    expect(
      checkImplementationComplete(
        "Implementation incomplete: missing required tests"
      )
    ).toBe(false);
  });
});
