import { describe, expect, it } from "vitest";
import { filePathFromHref } from "../src/file-link";

describe("filePathFromHref", () => {
  it("extracts decoded paths from file URLs", () => {
    expect(filePathFromHref("file:///Users/demo/My%20Report.md")).toBe("/Users/demo/My Report.md");
  });

  it("accepts relative and Windows file paths", () => {
    expect(filePathFromHref("reports/experiment.md#L12")).toBe("reports/experiment.md#L12");
    expect(filePathFromHref("C:\\work\\result.json")).toBe("C:\\work\\result.json");
  });

  it("accepts standalone filenames with extensions", () => {
    expect(filePathFromHref("analysis.pdf")).toBe("analysis.pdf");
  });

  it("does not treat web links as local files", () => {
    expect(filePathFromHref("https://example.com/report.pdf")).toBeNull();
    expect(filePathFromHref("mailto:test@example.com")).toBeNull();
  });
});
