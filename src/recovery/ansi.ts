const OSC_SEQUENCE = /\u001B\][\s\S]*?(?:\u0007|\u001B\\)/g;
const CSI_SEQUENCE = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const TWO_CHARACTER_ESCAPE = /\u001B[@-_]/g;

export function stripTerminalControls(source: string): { text: string; changed: boolean } {
  const normalizedNewlines = source.replace(/\r\n?/g, "\n");
  const text = normalizedNewlines
    .replace(OSC_SEQUENCE, "")
    .replace(CSI_SEQUENCE, "")
    .replace(TWO_CHARACTER_ESCAPE, "")
    .replace(/\u0000|\u0008/g, "");

  return {
    text,
    changed: text !== source,
  };
}
