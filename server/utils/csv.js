/**
 * CSV writing and parsing (PB-15 export, PB-17 import/export).
 *
 * Writing: RFC 4180 quoting, CRLF rows, UTF-8 BOM (so Excel reads accents), and
 * spreadsheet formula-injection defence — any text cell starting with
 * = + - @ tab or CR is prefixed with an apostrophe so it is shown as text.
 *
 * Parsing: handles a BOM, quoted fields with commas/quotes/newlines, and CRLF,
 * LF or CR line endings.
 */

const FORMULA_START = /^[=+\-@\t\r]/;

const cell = (value) => {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
};

/**
 * @param {Array<{ key: string, label: string, value?: (row) => unknown }>} columns
 * @param {Array<object>} rows
 */
const toCsv = (columns, rows) => {
  const header = columns.map((c) => cell(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => cell(c.value ? c.value(row) : row[c.key])).join(','));
  return `﻿${[header, ...lines].join('\r\n')}\r\n`;
};

const sendCsv = (res, filename, columns, rows) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`);
  res.send(toCsv(columns, rows));
};

/**
 * Parses CSV text into { headers, rows } where each row is { line, values: {header: value} }.
 * Throws an Error with `.line` on an unterminated quote.
 */
const parseCsv = (input) => {
  const text = String(input).replace(/^﻿/, '');
  const records = [];
  let field = '';
  let record = [];
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') line += 1;
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      record.push(field);
      records.push({ line: recordLine, cells: record });
      record = [];
      field = '';
      line += 1;
      recordLine = line;
    } else {
      field += ch;
    }
  }

  if (inQuotes) {
    const err = new Error(`Unterminated quoted field starting on line ${recordLine}`);
    err.line = recordLine;
    throw err;
  }
  if (field !== '' || record.length) {
    record.push(field);
    records.push({ line: recordLine, cells: record });
  }

  const nonEmpty = records.filter((r) => r.cells.some((c) => c.trim() !== ''));
  if (!nonEmpty.length) return { headers: [], rows: [] };

  const headers = nonEmpty[0].cells.map((h) => h.trim());
  const rows = nonEmpty.slice(1).map((r) => ({
    line: r.line,
    extra: r.cells.length > headers.length ? r.cells.slice(headers.length).filter((c) => c.trim() !== '').length : 0,
    values: Object.fromEntries(headers.map((h, index) => [h, (r.cells[index] ?? '').trim()])),
  }));
  return { headers, rows };
};

module.exports = { toCsv, sendCsv, parseCsv, cell };
