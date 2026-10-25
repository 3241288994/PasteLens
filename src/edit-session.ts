export interface ResultEditSession {
  source: string;
  baseline: string;
  value: string;
}

export function createResultEditSession(source: string, normalized: string): ResultEditSession {
  return { source, baseline: normalized, value: normalized };
}

export function isResultEditDirty(session: ResultEditSession): boolean {
  return session.value !== session.baseline;
}

export function resumeResultEditSession(
  session: ResultEditSession,
  source: string,
  normalized: string,
): ResultEditSession {
  if (session.source !== source) {
    return createResultEditSession(source, normalized);
  }
  if (!isResultEditDirty(session) && session.baseline !== normalized) {
    return createResultEditSession(source, normalized);
  }
  return session;
}

export function updateResultEditSession(
  session: ResultEditSession,
  value: string,
): ResultEditSession {
  return { ...session, value };
}
