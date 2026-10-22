import type { Metric } from './types';

/** Accept grouped numbers, decimal comma and h:mm without silently changing units. */
export function parseMetricInput(
  raw: string,
  metric: Pick<Metric, 'name' | 'unit' | 'max'>,
): { value: number | null; error: string | null } {
  let text = raw.trim();
  if (!text) return { value: null, error: null };
  let value: number;
  if (metric.unit === 'h' && /^\d+:\d{2}$/.test(text)) {
    const [h, m] = text.split(':').map(Number);
    if (m >= 60)
      return { value: null, error: `${metric.name}: minutes must be between 00 and 59.` };
    value = h + m / 60;
  } else {
    // A comma followed by exactly three digits is a thousands separator.
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) text = text.replaceAll(',', '');
    else if (/^\d+,\d{1,2}$/.test(text)) text = text.replace(',', '.');
    if (!/^(\d+(\.\d*)?|\.\d+)$/.test(text))
      return {
        value: null,
        error: `${metric.name}: enter a positive number${metric.unit === 'h' ? ' or a time like 7:30' : ''}.`,
      };
    value = Number(text);
  }
  if (!Number.isFinite(value) || value < 0 || value > metric.max)
    return { value: null, error: `${metric.name}: enter a value between 0 and ${metric.max}.` };
  return { value: Math.round(value * 10000) / 10000, error: null };
}
