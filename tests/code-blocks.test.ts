import { describe, expect, it } from "vitest";
import { codeLanguageFromClassName, codeLineCount } from "../src/code-blocks";

describe("code block helpers", () => {
  it("extracts fenced code language names", () => {
    expect(codeLanguageFromClassName("hljs language-typescript")).toBe("typescript");
    expect(codeLanguageFromClassName("no-highlight")).toBe("text");
  });

  it("counts lines without adding a trailing phantom line", () => {
    expect(codeLineCount("one\ntwo\n")).toBe(2);
    expect(codeLineCount("")).toBe(1);
  });
});
