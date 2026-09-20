import { stripVTControlCharacters } from 'node:util';
import stringWidth from 'string-width';
import { DryRunPreview, executionOptions } from '../execution.js';
import { formatApiError } from '../helpers.js';
import { errorCode, hasFailures } from '../results.js';
import { jsonlRecords } from './jsonl.js';

export interface OutputOptions {
  json?: boolean;
  jsonl?: boolean;
  collection?: string;
}

export function isMachineOutput(options: OutputOptions = {}): boolean {
  return !!(options.json || options.jsonl || executionOptions.jsonl || !isTTY());
}

/** Check if stdout is a TTY (interactive terminal) */
export function isTTY(): boolean {
  return process.stdout.isTTY === true;
}

/** Get terminal width, defaulting to 80 if unavailable */
function termWidth(): number {
  return process.stdout.columns || 80;
}

/** Format a value for display in a table cell */
function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return stripVTControlCharacters(value).replace(/[\x00-\x1f\x7f]/g, ch => `\\x${ch.charCodeAt(0).toString(16).padStart(2, '0')}`);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === 'object') return '{...}';
  return String(value);
}

/** Truncate a string to maxLen, appending ... if truncated */
function truncate(str: string, maxLen: number): string {
  if (stringWidth(str) <= maxLen) return str;
  const suffix = maxLen < 4 ? '' : '...';
  let result = '';
  for (const { segment } of new Intl.Segmenter().segment(str)) {
    if (stringWidth(result + segment) > maxLen - suffix.length) break;
    result += segment;
  }
  return result + suffix;
}

/** Pad a string to the right with spaces */
function padRight(str: string, width: number): string {
  return str + ' '.repeat(Math.max(0, width - stringWidth(str)));
}

/**
 * Render an array of objects as an aligned table.
 * Columns are auto-sized to content, then shrunk proportionally if they
 * exceed terminal width. A minimum gap of 2 spaces separates columns.
 */
function formatTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';

  // Collect all keys across all rows (preserving insertion order)
  const keySet = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      keySet.add(key);
    }
  }
  const keys = Array.from(keySet);

  // Build string grid: headers + data
  const headers = keys.map((k) => formatCell(k).toUpperCase());
  const grid = rows.map((row) => keys.map((k) => formatCell(row[k])));

  // Compute natural column widths (max of header and all data cells)
  const colWidths = keys.map((_, i) => {
    let max = stringWidth(headers[i]);
    for (const row of grid) {
      max = Math.max(max, stringWidth(row[i]));
    }
    return max;
  });

  const gap = 2;
  const maxWidth = termWidth();
  const totalGap = gap * (keys.length - 1);
  const totalNatural = colWidths.reduce((a, b) => a + b, 0) + totalGap;

  // If columns exceed terminal width, shrink the widest columns first
  if (totalNatural > maxWidth && keys.length > 0) {
    const budget = maxWidth - totalGap;
    if (budget > 0) {
      // Give each column at least 4 chars, distribute remaining proportionally
      const minCol = 4;
      const guaranteed = Math.min(minCol, Math.floor(budget / keys.length));
      let remaining = budget;

      // First pass: cap each column to its natural width or proportional share
      const totalContent = colWidths.reduce((a, b) => a + b, 0);
      for (let i = 0; i < colWidths.length; i++) {
        const share = Math.max(guaranteed, Math.floor((colWidths[i] / totalContent) * budget));
        colWidths[i] = Math.min(colWidths[i], share);
        remaining -= colWidths[i];
      }

      // Minimum widths can oversubscribe the proportional allocation.
      while (remaining < 0) {
        const widest = colWidths.indexOf(Math.max(...colWidths));
        colWidths[widest]--;
        remaining++;
      }

      // Distribute leftover to columns that were truncated
      if (remaining > 0) {
        for (let i = 0; i < colWidths.length && remaining > 0; i++) {
          const natural = headers[i].length;
          const canGrow = Math.max(0, natural - colWidths[i]);
          const give = Math.min(canGrow, remaining);
          colWidths[i] += give;
          remaining -= give;
        }
      }
    }
  }

  // Render rows
  const lines: string[] = [];

  // Header row
  const headerLine = keys
    .map((_, i) => padRight(truncate(headers[i], colWidths[i]), colWidths[i]))
    .join(' '.repeat(gap));
  lines.push(headerLine.trimEnd());

  // Data rows
  for (const row of grid) {
    const line = keys
      .map((_, i) => padRight(truncate(row[i], colWidths[i]), colWidths[i]))
      .join(' '.repeat(gap));
    lines.push(line.trimEnd());
  }

  return lines.join('\n');
}

/**
 * Render a single object as key-value pairs.
 * Falls back to JSON for deeply nested objects.
 */
function formatKeyValue(obj: Record<string, unknown>): string {
  // If every value is a nested object/array, this won't be readable as k/v.
  // Check if the majority of values are complex -- if so, fall back to JSON.
  const values = Object.values(obj);
  const complexCount = values.filter(
    (v) => v !== null && typeof v === 'object',
  ).length;
  if (complexCount > values.length / 2) {
    return JSON.stringify(obj, null, 2);
  }

  const entries = Object.entries(obj);
  if (entries.length === 0) return '{}';

  return entries.map(([key, val]) => `${formatCell(key)}: ${formatCell(val)}`).join('\n');
}

/** Format output: JSON if piped or --json flag, human-readable if TTY */
export function formatOutput(data: unknown, options: OutputOptions): string {
  if (options.jsonl || executionOptions.jsonl) {
    return Array.from(jsonlRecords(data, options.collection), record => JSON.stringify(record)).join('\n');
  }
  if (options.json || !isTTY()) {
    return JSON.stringify(data, null, 2);
  }

  // Primitives: render as-is
  if (data === null || data === undefined) return '';
  if (typeof data === 'string') return formatCell(data);
  if (typeof data === 'number' || typeof data === 'boolean') return String(data);

  // Array of objects: table
  if (Array.isArray(data)) {
    if (data.length === 0) return '';
    // If every element is a plain object, render as table
    if (data.every((item) => item !== null && typeof item === 'object' && !Array.isArray(item))) {
      return formatTable(data as Record<string, unknown>[]);
    }
    // Array of primitives or mixed: one per line
    return data.map((item) => formatCell(item)).join('\n');
  }

  // Single object
  if (typeof data === 'object') {
    return formatKeyValue(data as Record<string, unknown>);
  }

  return String(data);
}

/** Print formatted output to stdout */
export function output(data: unknown, options: OutputOptions = {}): void {
  if (hasFailures(data)) process.exitCode = 1;
  if (options.jsonl || executionOptions.jsonl) {
    for (const record of jsonlRecords(data, options.collection)) console.log(JSON.stringify(record));
    return;
  }
  console.log(formatOutput(data, options));
}

/** Print error message to stderr */
export function error(value: unknown): void {
  const message = typeof value === 'string' ? value : formatApiError(value);
  if (executionOptions.jsonl) {
    console.error(JSON.stringify({ type: 'error', error: { code: errorCode(message), message } }));
  } else if (executionOptions.errorFormat === 'json') {
    console.error(JSON.stringify({ error: { code: errorCode(message), message } }));
  } else {
    console.error(`error: ${stripVTControlCharacters(message)}`);
  }
}

/** Finish an action without forcing buffered stdout to be discarded. */
export function fail(value: unknown): void {
  if (value instanceof DryRunPreview) {
    output({ dry_run: true, operation: value.operation, input: value.input, validation: 'local input only', executed: false }, { json: true });
    process.exitCode = 0;
  } else {
    error(value);
    process.exitCode = 1;
  }
}

export function outputEmpty(data: unknown, message: string, options: OutputOptions): void {
  if (isMachineOutput(options)) output(data, options);
  else console.log(message);
}
