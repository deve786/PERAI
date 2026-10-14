export interface AiLogEntry {
  id: string;
  timestamp: string;
  type: 'categorize' | 'test';
  title?: string;
  status: 'success' | 'error';
  result?: string;
  error?: string;
  model: string;
}

const MAX_LOGS = 50;
let logs: AiLogEntry[] = [];
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {}
  }
}

export function addAiLog(entry: Omit<AiLogEntry, 'id' | 'timestamp'>): AiLogEntry {
  const newEntry: AiLogEntry = {
    ...entry,
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  };
  logs = [newEntry, ...logs].slice(0, MAX_LOGS);
  notify();
  return newEntry;
}

export function getAiLogs(): AiLogEntry[] {
  return [...logs];
}

export function clearAiLogs(): void {
  logs = [];
  notify();
}

export function subscribeAiLogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
