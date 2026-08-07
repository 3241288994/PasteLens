import { describe, expect, it } from "vitest";
import { webUrlFromHref } from "../src/web-link";

describe("webUrlFromHref", () => {
  it("accepts HTTP and HTTPS links", () => {
    expect(webUrlFromHref("https://example.com/paper.pdf")).toBe("https://example.com/paper.pdf");
    expect(webUrlFromHref("http://example.com")).toBe("http://example.com/");
  });

  it("trims and normalizes valid web links", () => {
    expect(webUrlFromHref("  https://example.com/a%20b?q=1#part  ")).toBe(
      "https://example.com/a%20b?q=1#part",
    );
  });

  it("rejects local, relative, and unsafe links", () => {
    expect(webUrlFromHref("/Users/demo/report.md")).toBeNull();
    expect(webUrlFromHref("reports/experiment.md")).toBeNull();
    expect(webUrlFromHref("file:///Users/demo/report.md")).toBeNull();
    expect(webUrlFromHref("mailto:test@example.com")).toBeNull();
    expect(webUrlFromHref("javascript:alert(1)")).toBeNull();
    expect(webUrlFromHref("data:text/html,hello")).toBeNull();
  });
});
