export type AutoApplySchedule = {
  scheduleDays: string | number[];
  scheduleStartMinute: number;
  scheduleEndMinute: number;
  scheduleTimezone: string;
};

const WEEKDAY_NUMBER: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function parseScheduleDays(value: string | number[]): number[] {
  let input: unknown = value;
  if (typeof value === 'string') {
    try {
      input = JSON.parse(value);
    } catch {
      input = [];
    }
  }
  if (!Array.isArray(input)) return [];
  return [...new Set(
    input
      .map(Number)
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  )].sort((a, b) => a - b);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

function createScheduleFormatter(timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

function zonedDayAndMinute(date: Date, formatter: Intl.DateTimeFormat) {
  const parts = formatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value || '';
  return {
    day: WEEKDAY_NUMBER[part('weekday')],
    minute: Number(part('hour')) * 60 + Number(part('minute')),
  };
}

export function isWithinAutoApplySchedule(
  schedule: AutoApplySchedule,
  date = new Date()
): boolean {
  const days = parseScheduleDays(schedule.scheduleDays);
  if (!days.length || !isValidTimeZone(schedule.scheduleTimezone)) return false;
  const local = zonedDayAndMinute(date, createScheduleFormatter(schedule.scheduleTimezone));
  return days.includes(local.day) &&
    local.minute >= schedule.scheduleStartMinute &&
    local.minute < schedule.scheduleEndMinute;
}

export function nextAutoApplyRunAt(
  schedule: AutoApplySchedule,
  from = new Date(),
  intervalMinutes = 3
): Date | null {
  if (!parseScheduleDays(schedule.scheduleDays).length ||
      !isValidTimeZone(schedule.scheduleTimezone)) return null;
  const days = parseScheduleDays(schedule.scheduleDays);
  const formatter = createScheduleFormatter(schedule.scheduleTimezone);
  const isAllowed = (date: Date) => {
    const local = zonedDayAndMinute(date, formatter);
    return days.includes(local.day) &&
      local.minute >= schedule.scheduleStartMinute &&
      local.minute < schedule.scheduleEndMinute;
  };

  const intervalTarget = new Date(from.getTime() + intervalMinutes * 60_000);
  if (isAllowed(intervalTarget)) return intervalTarget;

  // Scan UTC minutes so daylight-saving transitions are handled by Intl rather
  // than by manually applying a timezone offset.
  const firstMinute = new Date(intervalTarget);
  firstMinute.setUTCSeconds(0, 0);
  if (firstMinute < intervalTarget) firstMinute.setUTCMinutes(firstMinute.getUTCMinutes() + 1);
  for (let offset = 0; offset <= 8 * 24 * 60; offset++) {
    const candidate = new Date(firstMinute.getTime() + offset * 60_000);
    if (isAllowed(candidate)) return candidate;
  }
  return null;
}
