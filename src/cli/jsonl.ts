import { hasFailures } from '../results.js';

export type JsonlRecord =
  | { type: 'item' | 'result'; data: unknown }
  | { type: 'summary'; ok: boolean; count: number; collection?: string | null };

/** Collection names are declared by commands; arbitrary nested objects stay intact. */
export function* jsonlRecords(data: unknown, collection?: string): Generator<JsonlRecord> {
  const ok = !hasFailures(data);
  if (Array.isArray(data)) {
    for (const item of data) yield { type: 'item', data: item };
    yield { type: 'summary', ok, count: data.length, collection: null };
  } else if (collection && data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>)[collection])) {
    const { [collection]: items, ...metadata } = data as Record<string, unknown>;
    for (const item of items as unknown[]) yield { type: 'item', data: item };
    if (Object.keys(metadata).length) yield { type: 'result', data: metadata };
    yield { type: 'summary', ok, count: (items as unknown[]).length, collection };
  } else {
    yield { type: 'result', data: data ?? null };
    yield { type: 'summary', ok, count: 1 };
  }
}
