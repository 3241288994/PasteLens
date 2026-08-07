import { describe, expect, it } from "vitest";
import { headingSlug } from "../src/document-navigation";

describe("headingSlug", () => {
  it("creates stable anchors for Chinese and English headings", () => {
    expect(headingSlug("需要估计的四个分量", 0)).toBe("需要估计的四个分量");
    expect(headingSlug("OC-CLIP relation / loss", 1)).toBe("oc-clip-relation-loss");
  });

  it("falls back when a heading has no usable characters", () => {
    expect(headingSlug("***", 2)).toBe("section-3");
  });
});
