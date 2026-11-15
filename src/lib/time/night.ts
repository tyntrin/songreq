// Night = 06:00 -> 05:59 next day in Asia/Bangkok (UTC+7, no DST).
// Pure UTC arithmetic; never uses local-time Date methods.
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const OFFSET = 7 * HOUR;
const NIGHT_START_HOUR = 6;

/** Shift so that UTC fields of the result read as Bangkok wall-clock, minus the 06:00 night start. */
function shifted(at: Date): number {
  return at.getTime() + OFFSET - NIGHT_START_HOUR * HOUR;
}

/** Epoch ms of the start (06:00 Bangkok) of the night containing `at`. */
function nightStartMs(at: Date): number {
  return Math.floor(shifted(at) / DAY) * DAY - OFFSET + NIGHT_START_HOUR * HOUR;
}

/** "YYYY-MM-DD" of the Bangkok date on which the night containing `at` started. */
export function nightKey(at: Date): string {
  return new Date(Math.floor(shifted(at) / DAY) * DAY).toISOString().slice(0, 10);
}

/** [start, end) of the night containing `at`. */
export function nightRange(at: Date): { start: Date; end: Date } {
  const s = nightStartMs(at);
  return { start: new Date(s), end: new Date(s + DAY) };
}

export function periodRange(
  period: "night" | "week" | "month",
  now: Date,
): { start: Date; end: Date } {
  const night = nightRange(now);
  if (period === "night") return night;
  if (period === "week") {
    return { start: new Date(night.end.getTime() - 7 * DAY), end: night.end };
  }
  // month: 06:00 Bangkok on the 1st of tonight's (night-key) month
  const [y, m] = nightKey(now).split("-").map(Number);
  const start = Date.UTC(y, m - 1, 1, NIGHT_START_HOUR) - OFFSET;
  return { start: new Date(start), end: night.end };
}
