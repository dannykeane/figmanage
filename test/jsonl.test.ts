import { afterEach, expect, it, vi } from 'vitest';
import { formatOutput, outputEmpty, error } from '../src/cli/format.js';
import { jsonlRecords } from '../src/cli/jsonl.js';
import { configureExecution } from '../src/execution.js';
const originalTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
afterEach(() => {
  configureExecution({}); vi.restoreAllMocks();
  if (originalTTY) Object.defineProperty(process.stdout, 'isTTY', originalTTY);
  else delete (process.stdout as any).isTTY;
});
function decode(text: string) { return text.split('\n').map(line => JSON.parse(line)); }
function reconstruct(records: any[]): unknown {
  const summary = records.at(-1);
  const items = records.filter(record => record.type === 'item').map(record => record.data);
  const value = records.find(record => record.type === 'result')?.data;
  return summary.collection === null ? items : typeof summary.collection === 'string' ? { ...value, [summary.collection]: items } : value;
}
it('preserves escaped newlines, Unicode, nested fields, and data named type', () => {
  const data = [{ name: '界\nnext\r\nline', type: 'summary', nested: { key: 'value' } }, null];
  const text = formatOutput(data, { jsonl: true });
  expect(text.split('\n')).toHaveLength(3);
  expect(reconstruct(decode(text))).toEqual(data);
  expect(decode(text).at(-1)).toEqual({ type: 'summary', ok: true, count: 2, collection: null });
});
it.each([
  [],
  { files: [] },
  { files: [], pagination: { has_more: true, next_cursor: 'next' } },
  { files: [{ key: 'a' }], pagination: { has_more: true, next_cursor: 'next' }, count: 20 },
])('preserves empty and paginated collections: %j', data => {
  const records = Array.from(jsonlRecords(data, 'files'));
  expect(reconstruct(records)).toEqual(data);
  expect(records.at(-1)).toMatchObject({ type: 'summary', ok: true });
});
it.each([{ succeeded: 1, failed: 1, errors: { b: 'denied' } }, { succeeded: 0, failed: 0, unknown: 2 }])('marks partial/unknown outcomes without dropping data', data => {
  const records = Array.from(jsonlRecords(data));
  expect(records).toEqual([{ type: 'result', data }, { type: 'summary', ok: false, count: 1 }]);
});
it('keeps undeclared objects intact instead of guessing which arrays to split', () => {
  const data = { files: ['a'], teams: ['b'], total: 2 };
  expect(Array.from(jsonlRecords(data))[0]).toEqual({ type: 'result', data });
});
it('leaves existing JSON and terminal rendering unchanged unless opted in', () => {
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
  const data = [{ name: 'Name' }];
  expect(formatOutput(data, { json: true })).toBe(JSON.stringify(data, null, 2));
  expect(formatOutput(data, {})).toBe('NAME\nName');
  expect(decode(formatOutput(data, { jsonl: true }))[0]).toEqual({ type: 'item', data: data[0] });
});
it('forces empty JSONL output and typed errors even on a terminal', () => {
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
  configureExecution({ jsonl: true });
  const stdout = vi.spyOn(console, 'log').mockImplementation(() => {});
  const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
  outputEmpty([], 'No items.', {});
  error('Invalid input: bad ID\nTry another.');
  expect(JSON.parse(stdout.mock.calls[0][0])).toEqual({ type: 'summary', ok: true, count: 0, collection: null });
  expect(JSON.parse(stderr.mock.calls[0][0])).toMatchObject({ type: 'error', error: { code: 'invalid_input' } });
});
