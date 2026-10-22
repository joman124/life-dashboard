import { describe, expect, it } from 'vitest';
import { parseMetricInput } from '@/lib/metricInput';
const hours = { name: 'Sleep', unit: 'h', max: 24 };
const steps = { name: 'Steps', unit: 'count', max: 100000 };
describe('fast metric entry', () => {
  it('converts h:mm to hours without treating minutes as decimals', () => {
    expect(parseMetricInput('7:30', hours).value).toBe(7.5);
    expect(parseMetricInput('0:45', hours).value).toBe(0.75);
    expect(parseMetricInput('7:60', hours).error).toBeTruthy();
    expect(parseMetricInput('7:30', steps).error).toBeTruthy();
  });
  it('accepts grouped step counts and decimal comma on mobile keyboards', () => {
    expect(parseMetricInput('9,336', steps).value).toBe(9336);
    expect(parseMetricInput('7,5', hours).value).toBe(7.5);
    expect(parseMetricInput('.5', hours).value).toBe(0.5);
  });
  it('keeps zero distinct from an empty value', () => {
    expect(parseMetricInput('0', hours).value).toBe(0);
    expect(parseMetricInput(' ', hours)).toEqual({ value: null, error: null });
  });
  it('rejects impossible values and malformed input instead of partially parsing', () => {
    for (const raw of ['25', '-1', 'Infinity', 'NaN', '7h', '7:5', '1e2', '1,2,3'])
      expect(parseMetricInput(raw, hours).error, raw).toBeTruthy();
  });
});
