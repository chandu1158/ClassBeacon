/**
 * CSV Utility with Formula Injection Protection (OWASP compliant).
 * Prevents CSV / Excel macro injection (CSV Injection) by prefixing cells
 * starting with `=`, `+`, `-`, `@`, `\t`, `\r` with a single quote `'`.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';

  let str = String(value);

  // Check for formula injection triggers at start of cell
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // Escape double quotes by doubling them
  const escaped = str.replace(/"/g, '""');

  return `"${escaped}"`;
}

export interface CsvColumn<T> {
  header: string;
  accessor: (row: T) => unknown;
}

export function generateCsv<T>(data: T[], columns: CsvColumn<T>[]): string {
  const headerRow = columns.map((col) => escapeCsvCell(col.header)).join(',');

  const dataRows = data.map((row) =>
    columns.map((col) => escapeCsvCell(col.accessor(row))).join(','),
  );

  return [headerRow, ...dataRows].join('\r\n');
}
