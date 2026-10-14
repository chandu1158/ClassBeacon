import { describe, it, expect } from 'vitest';
import { escapeCsvCell, generateCsv } from '@cb/lib/csvExport';

describe('CSV Formula Injection Protection', () => {
  it('escapes cells starting with formula triggers (=, +, -, @, tab, CR)', () => {
    expect(escapeCsvCell('=1+1')).toBe('"\'=1+1"');
    expect(escapeCsvCell('+cmd|\' /C calc\'!A0')).toBe('"\'\+cmd|\' /C calc\'!A0"');
    expect(escapeCsvCell('-2+3')).toBe('"\'\-2+3"');
    expect(escapeCsvCell('@SUM(1,2)')).toBe('"\'@SUM(1,2)"');
    expect(escapeCsvCell('\tEXEC')).toBe('"\'\tEXEC"');
  });

  it('safely handles standard text and numbers without formula triggers', () => {
    expect(escapeCsvCell('John Doe')).toBe('"John Doe"');
    expect(escapeCsvCell(12345)).toBe('"12345"');
    expect(escapeCsvCell('student@school.edu')).toBe('"student@school.edu"');
  });

  it('escapes internal double quotes properly', () => {
    expect(escapeCsvCell('He said "Hello"')).toBe('"He said ""Hello"""');
  });

  it('generates complete CSV with sanitized rows', () => {
    interface TestRecord {
      name: string;
      notes: string;
      score: number;
    }

    const data: TestRecord[] = [
      { name: 'Alice', notes: 'Good job', score: 95 },
      { name: 'Bob', notes: '=HYPERLINK("http://evil.com")', score: 80 },
    ];

    const csv = generateCsv(data, [
      { header: 'Student Name', accessor: (r) => r.name },
      { header: 'Notes', accessor: (r) => r.notes },
      { header: 'Score', accessor: (r) => r.score },
    ]);

    expect(csv).toContain('"Student Name","Notes","Score"');
    expect(csv).toContain('"Alice","Good job","95"');
    expect(csv).toContain('"Bob","\'=HYPERLINK(""http://evil.com"")","80"');
  });
});
