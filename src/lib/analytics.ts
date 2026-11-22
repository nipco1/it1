import type { OpHoursRecord } from "./types";

/** Latest reading available on each day, relative to the first known reading in the range.
 * null means there was no reading available yet; it must not be displayed as zero.
 */
export function operatingHoursTrend(records: OpHoursRecord[], equipmentId: string, days: string[]): (number | null)[] {
  const ordered = records.filter(r => r.equipmentId === equipmentId && Number.isFinite(r.hours))
    .slice().sort((a, b) => (a.dateKey + a.time).localeCompare(b.dateKey + b.time));
  let index = 0;
  let latest: number | null = null;
  let baseline: number | null = null;
  return days.map(day => {
    while (index < ordered.length && ordered[index].dateKey <= day) {
      latest = ordered[index].hours;
      index++;
    }
    if (latest === null) return null;
    if (baseline === null) baseline = latest;
    return Math.round(latest - baseline);
  });
}
