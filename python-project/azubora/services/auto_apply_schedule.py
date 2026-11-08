"""Weekly time windows for the auto-apply bot (days are 0=Sunday … 6=Saturday)."""
import datetime as dt
import json
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def parse_schedule_days(value) -> list[int]:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            value = []
    if not isinstance(value, list):
        return []
    days = set()
    for item in value:
        try:
            number = float(item)
        except (TypeError, ValueError):
            continue
        if number.is_integer() and 0 <= number <= 6:
            days.add(int(number))
    return sorted(days)


def is_valid_time_zone(name: str) -> bool:
    if not name:
        return False
    try:
        ZoneInfo(name)
        return True
    except (ZoneInfoNotFoundError, ValueError):
        return False


def _local_day_and_minute(moment: dt.datetime, zone: ZoneInfo) -> tuple[int, int]:
    local = moment.astimezone(zone)
    return (local.weekday() + 1) % 7, local.hour * 60 + local.minute


def _schedule(config) -> tuple[list[int], int, int, str]:
    if isinstance(config, dict):
        return (parse_schedule_days(config['scheduleDays']), config['scheduleStartMinute'],
                config['scheduleEndMinute'], config['scheduleTimezone'])
    return (parse_schedule_days(config.schedule_days), config.schedule_start_minute,
            config.schedule_end_minute, config.schedule_timezone)


def is_within_schedule(config, moment: dt.datetime | None = None) -> bool:
    days, start, end, zone_name = _schedule(config)
    if not days or not is_valid_time_zone(zone_name):
        return False
    day, minute = _local_day_and_minute(moment or dt.datetime.now(dt.timezone.utc), ZoneInfo(zone_name))
    return day in days and start <= minute < end


def next_run_at(config, start: dt.datetime | None = None, interval_minutes: int = 3) -> dt.datetime | None:
    days, start_minute, end_minute, zone_name = _schedule(config)
    if not days or not is_valid_time_zone(zone_name):
        return None
    zone = ZoneInfo(zone_name)

    def allowed(moment: dt.datetime) -> bool:
        day, minute = _local_day_and_minute(moment, zone)
        return day in days and start_minute <= minute < end_minute

    target = (start or dt.datetime.now(dt.timezone.utc)) + dt.timedelta(minutes=interval_minutes)
    if allowed(target):
        return target
    # Scan UTC minutes so daylight-saving transitions are handled by zoneinfo.
    first = target.replace(second=0, microsecond=0)
    if first < target:
        first += dt.timedelta(minutes=1)
    for offset in range(8 * 24 * 60 + 1):
        candidate = first + dt.timedelta(minutes=offset)
        if allowed(candidate):
            return candidate
    return None
