import { describe, expect, it } from "vitest";
import {
  parseAskSelectionEnabledPreference,
  parseAutoRenderClipboardPreference,
} from "../src/preferences";

describe("clipboard render preference", () => {
  it("keeps the existing auto-render behavior by default", () => {
    expect(parseAutoRenderClipboardPreference(null)).toBe(true);
    expect(parseAutoRenderClipboardPreference("true")).toBe(true);
  });

  it("allows auto-rendering to be disabled persistently", () => {
    expect(parseAutoRenderClipboardPreference("false")).toBe(false);
  });

  it("enables selection questions by default and persists opt-out", () => {
    expect(parseAskSelectionEnabledPreference(null)).toBe(true);
    expect(parseAskSelectionEnabledPreference("false")).toBe(false);
  });
});
