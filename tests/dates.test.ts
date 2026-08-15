import { describe, expect, test } from 'vitest';
import { addDays, dayLabel, formatDateLong, isoWeek, isoWeekYear, isoWeeksInYear, lastNDates, todayISO } from '@/lib/dates';

describe('todayISO', () => {
  test('returns the local calendar date, not the UTC one', () => {
    // Arrange: the local calendar fields of "now", assembled independently of
    // the implementation. This is the assertion that actually matters — a naive
    // toISOString() implementation reports the wrong day for anyone west of UTC
    // in the evening (and east of UTC in the early morning).
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const expected = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    // Act & Assert
    expect(todayISO()).toBe(expected);
  });

  test('is formatted as YYYY-MM-DD', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('addDays', () => {
  test('adds days within a month', () => {
    expect(addDays('2026-06-12', 3)).toBe('2026-06-15');
  });

  test('subtracts days with a negative offset', () => {
    expect(addDays('2026-06-12', -3)).toBe('2026-06-09');
  });

  test('returns the same date for an offset of zero', () => {
    expect(addDays('2026-06-12', 0)).toBe('2026-06-12');
  });

  test('rolls forward across a month boundary', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01');
  });

  test('rolls backward across a month boundary', () => {
    expect(addDays('2026-07-01', -1)).toBe('2026-06-30');
  });

  test('rolls across a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  test('handles February in a leap year', () => {
    // 2028 is a leap year, so Feb 29 exists.
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
  });

  test('handles February in a non-leap year', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  test('crosses a spring-forward DST boundary without losing a day', () => {
    // US DST began 2026-03-08. Adding a day across it must advance the calendar
    // date by exactly one, even though that local day is only 23 hours long.
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
  });

  test('crosses a fall-back DST boundary without repeating a day', () => {
    // US DST ended 2026-11-01 — a 25-hour local day.
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
  });

  test('spans a large offset correctly', () => {
    expect(addDays('2026-01-01', 365)).toBe('2027-01-01');
  });
});

describe('lastNDates', () => {
  test('returns n dates ending at endISO, oldest first', () => {
    expect(lastNDates('2026-06-12', 4)).toEqual([
      '2026-06-09',
      '2026-06-10',
      '2026-06-11',
      '2026-06-12',
    ]);
  });

  test('includes the end date as the final element', () => {
    const dates = lastNDates('2026-06-12', 14);
    expect(dates).toHaveLength(14);
    expect(dates[dates.length - 1]).toBe('2026-06-12');
  });

  test('returns just the end date for n = 1', () => {
    expect(lastNDates('2026-06-12', 1)).toEqual(['2026-06-12']);
  });

  test('returns an empty array for n = 0', () => {
    expect(lastNDates('2026-06-12', 0)).toEqual([]);
  });

  test('produces strictly ascending dates', () => {
    const dates = lastNDates('2026-03-10', 30);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
    expect(new Set(dates).size).toBe(30);
  });
});

describe('dayLabel', () => {
  test('returns the short weekday name', () => {
    // 2026-06-12 is a Friday.
    expect(dayLabel('2026-06-12')).toBe('Fri');
  });

  test('covers a full week without repeating', () => {
    const labels = lastNDates('2026-06-12', 7).map(dayLabel);
    expect(new Set(labels).size).toBe(7);
    expect(labels).toEqual(['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  });
});

describe('formatDateLong', () => {
  test('formats as "Weekday, Month D"', () => {
    expect(formatDateLong('2026-06-12')).toBe('Friday, June 12');
  });

  test('does not zero-pad the day of month', () => {
    expect(formatDateLong('2026-06-01')).toBe('Monday, June 1');
  });

  test('formats a January date correctly (month index 0)', () => {
    expect(formatDateLong('2026-01-15')).toBe('Thursday, January 15');
  });

  test('formats a December date correctly (month index 11)', () => {
    expect(formatDateLong('2026-12-25')).toBe('Friday, December 25');
  });
});

describe('isoWeek', () => {
  test('numbers ordinary mid-year dates', () => {
    expect(isoWeek('2026-01-01')).toBe(1);
    expect(isoWeek('2026-08-14')).toBe(33);
  });

  test('a week belongs to the year containing its Thursday', () => {
    // 2027 opens on a Friday, so 1–3 Jan 2027 are still week 53 OF 2026 —
    // the case a naive day-of-year/7 always gets wrong.
    expect(isoWeek('2027-01-03')).toBe(53);
    expect(isoWeekYear('2027-01-03')).toBe(2026);
    expect(isoWeek('2027-01-04')).toBe(1);
    expect(isoWeekYear('2027-01-04')).toBe(2027);
  });

  test('late-December dates can belong to week 1 of the next year', () => {
    // 2024 ends on a Tuesday: 30–31 Dec 2024 fall in week 1 of 2025.
    expect(isoWeek('2024-12-30')).toBe(1);
    expect(isoWeekYear('2024-12-30')).toBe(2025);
  });

  test('does NOT cap at 52 — long years really do have a week 53', () => {
    // 2026 opens on a Thursday, so it is a 53-week year. Clamping to 52 would
    // mislabel the final week of this very year.
    expect(isoWeek('2026-12-28')).toBe(53);
    expect(isoWeek('2026-12-31')).toBe(53);
    expect(isoWeek('2020-12-31')).toBe(53);
  });

  test('every date in a year lands in 1..53, and weeks never go backwards', () => {
    let previous = 0;
    let d = '2026-01-05'; // start of ISO week 2
    while (d <= '2026-12-27') {
      const w = isoWeek(d);
      expect(w).toBeGreaterThanOrEqual(1);
      expect(w).toBeLessThanOrEqual(53);
      expect(w).toBeGreaterThanOrEqual(previous);
      previous = w;
      d = addDays(d, 1);
    }
  });

  test('all seven days of one week share a number', () => {
    const week = isoWeek('2026-08-10'); // Monday
    for (let i = 0; i < 7; i++) expect(isoWeek(addDays('2026-08-10', i))).toBe(week);
    expect(isoWeek(addDays('2026-08-10', 7))).toBe(week + 1);
  });
});

describe('isoWeeksInYear', () => {
  test('reports 53 for long years and 52 for the rest', () => {
    expect(isoWeeksInYear(2026)).toBe(53); // 1 Jan is a Thursday
    expect(isoWeeksInYear(2020)).toBe(53); // leap year starting Wednesday
    expect(isoWeeksInYear(2025)).toBe(52);
    expect(isoWeeksInYear(2024)).toBe(52);
  });
});
