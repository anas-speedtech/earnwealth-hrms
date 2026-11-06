// Shared date helpers.
//
// The live database stores dates as MySQL DATE/DATETIME values which the
// driver serializes as full ISO instants (a DATE of 2026-10-25 comes back as
// "2026-10-24T18:30:00.000Z" — UTC for IST midnight). Rendering that raw is
// how users end up seeing "2026-10-18T00:00:00.000Z" in the UI. These
// helpers normalise any such value back to the IST wall-clock day it
// represents, so the UI can show a clean "25 Oct 2026".

const IST_MS = 5.5 * 3600 * 1000;

/**
 * The IST "YYYY-MM-DD" day that a date value represents, whether it arrives
 * as a full ISO instant ("2026-10-24T18:30:00.000Z") or a plain day key
 * ("2026-10-25").
 */
export function istDayKey(value: string | Date | null | undefined): string {
  if (!value) return '';
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    // Not parseable as a timestamp — assume it is already a day key.
    return String(value).slice(0, 10);
  }
  return new Date(parsed.getTime() + IST_MS).toISOString().slice(0, 10);
}

/** Human-friendly IST day ("25 Oct 2026") from a date value or day key. */
export function formatISTDay(value: string | Date | null | undefined): string {
  const key = istDayKey(value);
  if (!key) return '—';
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** H:MM IST time for an ISO instant (punch times etc.). */
export function formatISTTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Date(parsed.getTime() + IST_MS).toISOString().slice(11, 16);
}

/** Whole calendar days spanned by a start/end day range (inclusive). */
export function daysBetween(startKey: string, endKey: string): number {
  const start = istDayKey(startKey);
  const end = istDayKey(endKey);
  if (!start || !end) return 0;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.round(ms / 86400000) + 1;
}
