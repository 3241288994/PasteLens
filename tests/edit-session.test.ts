import { describe, expect, it } from "vitest";
import {
  createResultEditSession,
  isResultEditDirty,
  resumeResultEditSession,
  updateResultEditSession,
} from "../src/edit-session";

describe("result edit session", () => {
  it("keeps unsaved deletions when the edit view is selected again", () => {
    const initial = createResultEditSession("alpha beta", "alpha beta");
    const edited = updateResultEditSession(initial, "alpha");
    const resumed = resumeResultEditSession(edited, "alpha beta", "alpha beta");

    expect(resumed.value).toBe("alpha");
    expect(isResultEditDirty(resumed)).toBe(true);
  });

  it("starts a fresh session when another document is opened", () => {
    const edited = updateResultEditSession(
      createResultEditSession("first source", "first result"),
      "changed result",
    );

    expect(resumeResultEditSession(edited, "second source", "second result")).toEqual({
      source: "second source",
      baseline: "second result",
      value: "second result",
    });
  });

  it("refreshes an unchanged session after the renderer updates", () => {
    const session = createResultEditSession("source", "before recovery");

    expect(resumeResultEditSession(session, "source", "after recovery").value).toBe("after recovery");
  });
});
