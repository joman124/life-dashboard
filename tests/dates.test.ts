import { describe, expect, test } from 'vitest';
import {
  addDays,
  daysBetween,
  dayLabel,
  endOfDay,
  formatClock,
  formatDateLong,
  hourOfDay,
  isoWeek,
  lastNDates,
  startOfDay,
  todayISO,
} from '@/lib/dates';

describe('todayISO', () => {
  test('resolves the date in UTC-7, not UTC', () => {
    // 02:30 UTC on Aug 6 is 19:30 on Aug 5 in UTC-7. Reporting Aug 6 here is
    // the exact bug that filed an evening health import under tomorrow.
    expect(todayISO(new Date('2026-08-06T02:30:00Z'))).toBe('2026-08-05');
  });

  test('rolls to the next date at 07:00 UTC', () => {
    expect(todayISO(new Date('2026-08-06T06:59:59Z'))).toBe('2026-08-05');
    expect(todayISO(new Date('2026-08-06T07:00:00Z'))).toBe('2026-08-06');
  });

  test('does not shift for daylight saving — UTC-7 all year', () => {
    // Mid-January and mid-July resolve with the same offset.
    expect(todayISO(new Date('2026-01-15T07:00:00Z'))).toBe('2026-01-15');
    expect(todayISO(new Date('2026-07-15T07:00:00Z'))).toBe('2026-07-15');
  });

  test('is formatted as YYYY-MM-DD', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('hourOfDay', () => {
  test('returns the UTC-7 hour', () => {
    // 02:30 UTC → 19:30 the previous evening in UTC-7.
    expect(hourOfDay(new Date('2026-08-06T02:30:00Z'))).toBe(19);
    expect(hourOfDay(new Date('2026-08-06T16:00:00Z'))).toBe(9);
  });

  test('covers the full 0–23 range across a day', () => {
    const hours = Array.from({ length: 24 }, (_, h) =>
      hourOfDay(new Date(Date.UTC(2026, 7, 6, h, 30))),
    );
    expect(new Set(hours).size).toBe(24);
  });
});

describe('startOfDay / endOfDay', () => {
  test('a UTC-7 calendar day begins at 07:00 UTC', () => {
    expect(startOfDay('2026-08-05').toISOString()).toBe('2026-08-05T07:00:00.000Z');
  });

  test('spans exactly 24 hours', () => {
    const ms = endOfDay('2026-08-05').getTime() - startOfDay('2026-08-05').getTime();
    expect(ms).toBe(86_400_000);
  });

  test('round-trips through todayISO', () => {
    // Any instant inside the window must report that same calendar date.
    const start = startOfDay('2026-08-05');
    const justBeforeEnd = new Date(endOfDay('2026-08-05').getTime() - 1);
    expect(todayISO(start)).toBe('2026-08-05');
    expect(todayISO(justBeforeEnd)).toBe('2026-08-05');
  });
});

describe('formatClock', () => {
  test('renders the UTC-7 wall clock', () => {
    expect(formatClock('2026-08-06T02:30:00Z')).toBe('19:30');
    expect(formatClock('2026-08-06T16:05:00Z')).toBe('09:05');
  });

  test('zero-pads both fields', () => {
    expect(formatClock('2026-08-06T08:03:00Z')).toBe('01:03');
  });
});

describe('isoWeek', () => {
  test('numbers a mid-year week', () => {
    // 2026-08-05 is a Wednesday in ISO week 32.
    expect(isoWeek('2026-08-05')).toBe(32);
  });

  test('is stable across a single Monday–Sunday week', () => {
    const week = lastNDates('2026-08-09', 7).map(isoWeek); // Mon 3rd → Sun 9th
    expect(new Set(week).size).toBe(1);
    expect(week[0]).toBe(32);
  });

  test('increments on Monday', () => {
    expect(isoWeek('2026-08-09')).toBe(32); // Sunday
    expect(isoWeek('2026-08-10')).toBe(33); // Monday
  });

  test('assigns early-January days to the prior year final week', () => {
    // 2027-01-01 is a Friday, so it belongs to the last ISO week of 2026.
    expect(isoWeek('2027-01-01')).toBe(53);
    expect(isoWeek('2027-01-04')).toBe(1); // the following Monday starts week 1
  });

  test('never returns a week outside 1–53', () => {
    for (const d of lastNDates('2026-12-31', 365)) {
      const w = isoWeek(d);
      expect(w).toBeGreaterThanOrEqual(1);
      expect(w).toBeLessThanOrEqual(53);
    }
  });
});

describe('daysBetween', () => {
  test('counts forward', () => {
    expect(daysBetween('2026-08-01', '2026-08-05')).toBe(4);
  });

  test('is negative when the end precedes the start', () => {
    expect(daysBetween('2026-08-05', '2026-08-01')).toBe(-4);
  });

  test('is zero for the same date', () => {
    expect(daysBetween('2026-08-05', '2026-08-05')).toBe(0);
  });

  test('crosses a year boundary', () => {
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365);
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
