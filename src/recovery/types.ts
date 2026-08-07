export type RepairKind = "ansi" | "display-math" | "inline-math" | "terminal-table";

export interface RepairRecord {
  kind: RepairKind;
  startLine: number;
  endLine: number;
  confidence: number;
  original: string;
  normalized: string;
  reason: string;
}
export interface RecoveryStats {
  displayMath: number;
  inlineMath: number;
  terminalTables: number;
  strippedControls: boolean;
}

export interface RecoveryResult {
  source: string;
  normalized: string;
  repairs: RepairRecord[];
  warnings: string[];
  stats: RecoveryStats;
}

export interface InlineRecoveryResult {
  line: string;
  repairs: RepairRecord[];
}

export interface DisplayRecoveryResult {
  endIndex: number;
  markdown: string[];
  repair: RepairRecord;
}

export interface TerminalTableResult {
  endIndex: number;
  markdown: string[];
  repair: RepairRecord;
}
