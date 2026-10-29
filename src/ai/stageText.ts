import type { AskStage } from './askEnhanced';

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

/** "a, b and c" */
function listOf(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * The line shown under the waiting answer card, for each stage.
 *
 * The middle stage names what was found, so the wait reads as work being done
 * on your own things — "3 documents, 12 messages and your expenses" — rather
 * than as a machine thinking.
 */
export function describeStage(stage: AskStage | null): string {
  if (!stage || stage.step === 'searching') return 'Searching your record…';
  if (stage.step === 'writing') return 'Writing the answer…';

  const { memories, documents, websites, messages, expenses } = stage.found;
  const parts = [
    memories > 0 ? plural(memories, 'note') : null,
    documents > 0 ? plural(documents, 'document') : null,
    websites > 0 ? plural(websites, 'website') : null,
    messages > 0 ? plural(messages, 'message') : null,
    expenses ? 'your expenses' : null,
  ].filter((part): part is string => part !== null);

  if (parts.length === 0) return 'Nothing obviously matching — reading anyway…';
  return `Reading ${listOf(parts)}…`;
}
