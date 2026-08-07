export const AUTO_RENDER_CLIPBOARD_STORAGE_KEY = "pastelens.auto-render-clipboard.v1";
export const ASK_SELECTION_ENABLED_STORAGE_KEY = "pastelens.ask-selection-enabled.v1";
export const ASK_CONTEXT_SCOPE_STORAGE_KEY = "pastelens.ask-context-scope.v1";
export const ASK_PROMPT_TEMPLATE_STORAGE_KEY = "pastelens.ask-prompt-template.v1";
export const ASK_CUSTOM_PROMPT_STORAGE_KEY = "pastelens.ask-custom-prompt.v1";

export function parseAutoRenderClipboardPreference(value: string | null): boolean {
  return value !== "false";
}

export function parseAskSelectionEnabledPreference(value: string | null): boolean {
  return value !== "false";
}
