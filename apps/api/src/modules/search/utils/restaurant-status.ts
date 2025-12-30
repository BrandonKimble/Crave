import { Prisma } from '@prisma/client';
import type { LoggerService } from '../../../shared';
import type { OperatingStatus } from '@crave-search/shared';

const DAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

type DayKey = (typeof DAY_KEYS)[number];

type DaySegment = {
  start: number;
  end: number;
  crossesMidnight: boolean;
};

type DailySchedule = Partial<Record<DayKey, DaySegment[]>>;

type LocalTimeContext = {
  dayKey: DayKey;
  minutes: number;
  timezoneApplied: boolean;
};

export type RestaurantMetadata = Record<string, unknown> & {
  hours?: Record<string, unknown> | Array<unknown> | string;
  timezone?: string;
  timeZone?: string;
  time_zone?: string;
  tz?: string;
  utc_offset_minutes?: number;
  utcOffsetMinutes?: number;
};

export class RestaurantStatusEvaluator {
  constructor(private readonly logger?: LoggerService) {}

  buildOperatingMetadataFromLocation(
    hoursValue: unknown,
    utcOffsetMinutesValue: Prisma.Decimal | number | string | null | undefined,
    timeZoneValue: string | null | undefined,
  ): RestaurantMetadata | null {
    const hours = this.coerceRecord(hoursValue);
    const timeZone =
      typeof timeZoneValue === 'string' && timeZoneValue.trim()
        ? timeZoneValue.trim()
        : null;
    const utcOffsetMinutes = this.toOptionalNumber(utcOffsetMinutesValue);

    if (!hours && !timeZone && utcOffsetMinutes === null) {
      return null;
    }

    const metadata: RestaurantMetadata = {};
    if (hours) {
      metadata.hours = hours;
    }
    if (timeZone) {
      metadata.timezone = timeZone;
    }
    if (utcOffsetMinutes !== null) {
      metadata.utc_offset_minutes = utcOffsetMinutes;
    }
    return metadata;
  }

  buildOperatingMetadataFromRestaurantMetadata(
    metadataValue: Prisma.JsonValue | null | undefined,
  ): RestaurantMetadata | null {
    const metadataRecord = this.coerceRecord(metadataValue);
    if (!metadataRecord) {
      return null;
    }

    const hoursValue = metadataRecord.hours;
    const utcOffsetCandidate =
      metadataRecord.utc_offset_minutes ?? metadataRecord.utcOffsetMinutes;
    const timeZoneCandidate =
      typeof metadataRecord.timezone === 'string'
        ? metadataRecord.timezone
        : typeof metadataRecord.timeZone === 'string'
          ? metadataRecord.timeZone
          : typeof metadataRecord.time_zone === 'string'
            ? metadataRecord.time_zone
            : typeof metadataRecord.tz === 'string'
              ? metadataRecord.tz
              : null;

    return this.buildOperatingMetadataFromLocation(
      hoursValue,
      utcOffsetCandidate as Prisma.Decimal | number | string | null | undefined,
      timeZoneCandidate,
    );
  }

  evaluateOperatingStatus(
    metadataValue: RestaurantMetadata | null | undefined,
    referenceDate: Date,
  ): OperatingStatus | null {
    const metadata = this.coerceRecord(
      metadataValue,
    ) as RestaurantMetadata | null;
    if (!metadata) {
      return null;
    }

    const schedule = this.buildDailySchedule(metadata);
    if (!schedule) {
      return null;
    }

    const timeContext = this.getLocalTimeContext(metadata, referenceDate);
    if (!timeContext) {
      return null;
    }

    const daySegments = schedule[timeContext.dayKey] || [];
    const dayIndex = DAY_KEYS.indexOf(timeContext.dayKey);
    const previousDayKey =
      DAY_KEYS[(dayIndex + DAY_KEYS.length - 1) % DAY_KEYS.length];
    const previousDaySegments = schedule[previousDayKey] || [];

    for (const segment of daySegments) {
      if (this.matchesSegment(segment, timeContext.minutes, false)) {
        const minutesUntilClose = this.computeMinutesUntilClose(
          segment,
          timeContext.minutes,
          false,
        );
        return {
          isOpen: true,
          closesAtDisplay: this.formatMinutesToDisplay(segment.end),
          closesInMinutes: minutesUntilClose,
          nextOpenDisplay: null,
        };
      }
    }

    for (const segment of previousDaySegments) {
      if (
        segment.crossesMidnight &&
        this.matchesSegment(segment, timeContext.minutes, true)
      ) {
        const minutesUntilClose = this.computeMinutesUntilClose(
          segment,
          timeContext.minutes,
          true,
        );
        return {
          isOpen: true,
          closesAtDisplay: this.formatMinutesToDisplay(segment.end),
          closesInMinutes: minutesUntilClose,
          nextOpenDisplay: null,
        };
      }
    }

    const nextOpenDisplay = this.findNextOpenDisplay(schedule, timeContext);

    return {
      isOpen: false,
      closesAtDisplay: null,
      closesInMinutes: null,
      nextOpenDisplay,
    };
  }

  computeDistanceMiles(
    userLocation: { lat: number; lng: number },
    latitude: number,
    longitude: number,
  ): number | null {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const earthRadiusMiles = 3958.8;

    const lat1 = toRad(userLocation.lat);
    const lon1 = toRad(userLocation.lng);
    const lat2 = toRad(latitude);
    const lon2 = toRad(longitude);

    const dLat = lat2 - lat1;
    const dLon = lon2 - lon1;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = earthRadiusMiles * c;
    return Number.isFinite(distance) ? distance : null;
  }

  private matchesSegment(
    segment: DaySegment,
    minutes: number,
    previousDay: boolean,
  ): boolean {
    if (segment.crossesMidnight) {
      if (previousDay) {
        return minutes < segment.end;
      }
      return minutes >= segment.start;
    }

    return minutes >= segment.start && minutes < segment.end;
  }

  private computeMinutesUntilClose(
    segment: DaySegment,
    minutes: number,
    previousDay: boolean,
  ): number {
    if (segment.crossesMidnight) {
      if (previousDay) {
        return Math.max(segment.end - minutes, 0);
      }
      return Math.max(24 * 60 - minutes + segment.end, 0);
    }

    return Math.max(segment.end - minutes, 0);
  }

  private formatMinutesToDisplay(minutes: number): string {
    const totalMinutes = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
    let hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    const period = hour >= 12 ? 'PM' : 'AM';
    hour %= 12;
    if (hour === 0) {
      hour = 12;
    }
    const minuteText = minute.toString().padStart(2, '0');
    return `${hour}:${minuteText} ${period}`;
  }

  private getLocalTimeContext(
    metadata: RestaurantMetadata,
    referenceDate: Date,
  ): LocalTimeContext | null {
    const timezone = this.extractTimeZone(metadata);
    if (timezone) {
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          weekday: 'long',
        });
        const parts = formatter.formatToParts(referenceDate);
        const hourPart = parts.find((part) => part.type === 'hour');
        const minutePart = parts.find((part) => part.type === 'minute');
        const weekdayPart = parts.find((part) => part.type === 'weekday');
        if (!hourPart || !minutePart || !weekdayPart) {
          return null;
        }

        const dayKey = this.normalizeDayKey(weekdayPart.value);
        if (!dayKey) {
          return null;
        }

        const hour = Number(hourPart.value);
        const minute = Number(minutePart.value);
        if (Number.isNaN(hour) || Number.isNaN(minute)) {
          return null;
        }

        return {
          dayKey,
          minutes: hour * 60 + minute,
          timezoneApplied: true,
        };
      } catch (error) {
        this.logger?.warn('Failed to evaluate timezone for open-now filter', {
          timezone,
          error: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
        });
      }
    }

    const offset = this.extractUtcOffset(metadata);
    if (offset !== null) {
      const adjusted = new Date(referenceDate.getTime() + offset * 60 * 1000);
      const dayKey = DAY_KEYS[adjusted.getUTCDay()];
      const minutes = adjusted.getUTCHours() * 60 + adjusted.getUTCMinutes();
      return {
        dayKey,
        minutes,
        timezoneApplied: false,
      };
    }

    return null;
  }

  private extractTimeZone(metadata: RestaurantMetadata): string | null {
    const candidates: Array<string | undefined> = [
      metadata.timezone,
      metadata.timeZone,
      metadata.time_zone,
      metadata.tz,
    ];

    const hoursRecord = this.coerceRecord(metadata.hours);
    if (hoursRecord) {
      const nestedCandidate =
        hoursRecord.timezone ??
        hoursRecord.timeZone ??
        hoursRecord.time_zone ??
        hoursRecord.tz;
      if (typeof nestedCandidate === 'string') {
        candidates.push(nestedCandidate);
      }
    }

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }

    return null;
  }

  private extractUtcOffset(metadata: RestaurantMetadata): number | null {
    const candidates: Array<number | string | undefined> = [
      metadata.utc_offset_minutes,
    ];
    const hoursRecord = this.coerceRecord(metadata.hours);
    if (hoursRecord) {
      const offsetCandidate = (
        hoursRecord as {
          utc_offset_minutes?: unknown;
        }
      ).utc_offset_minutes;
      if (
        typeof offsetCandidate === 'number' ||
        (typeof offsetCandidate === 'string' && offsetCandidate.trim())
      ) {
        candidates.push(offsetCandidate);
      }
    }

    for (const candidate of candidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        return candidate;
      }
      if (typeof candidate === 'string' && candidate.trim()) {
        const parsed = Number(candidate);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }

    return null;
  }

  private normalizeDayKey(value: string): DayKey | null {
    const normalized = value.trim().toLowerCase();
    const match = DAY_KEYS.find((day) => normalized.startsWith(day));
    return match ?? null;
  }

  private buildDailySchedule(
    metadata: RestaurantMetadata,
  ): DailySchedule | null {
    const hoursValue = metadata.hours;
    if (!hoursValue) {
      return null;
    }

    const schedule: Partial<Record<DayKey, DaySegment[]>> = {};
    const hoursRecord = this.coerceRecord(hoursValue);

    if (hoursRecord) {
      for (const [rawKey, value] of Object.entries(hoursRecord)) {
        if (this.isHoursMetadataProperty(rawKey)) {
          continue;
        }

        const dayKey = this.normalizeDayKey(rawKey);
        if (!dayKey) {
          continue;
        }

        const segments = this.parseHourValue(value);
        if (segments.length) {
          schedule[dayKey] = segments;
        }
      }
    } else if (Array.isArray(hoursValue)) {
      for (const entry of hoursValue) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }

        const entryRecord = entry as Record<string, unknown>;
        const rawDay = entryRecord.day ?? entryRecord.weekday;
        const dayKey = this.normalizeDayKey(
          typeof rawDay === 'string' ? rawDay : '',
        );
        if (!dayKey) {
          continue;
        }

        const value =
          entryRecord.value ?? entryRecord.hours ?? entryRecord.range ?? entry;
        const segments = this.parseHourValue(value);
        if (segments.length) {
          schedule[dayKey] = segments;
        }
      }
    } else if (typeof hoursValue === 'string') {
      const segments = this.parseHourValue(hoursValue);
      if (segments.length) {
        for (const day of DAY_KEYS) {
          schedule[day] = segments;
        }
      }
    }

    if (Object.keys(schedule).length === 0) {
      return null;
    }

    return schedule as DailySchedule;
  }

  private isHoursMetadataProperty(key: string): boolean {
    const normalized = key.toLowerCase();
    return (
      normalized === 'timezone' ||
      normalized === 'time_zone' ||
      normalized === 'tz' ||
      normalized === 'utc_offset_minutes' ||
      normalized === 'status'
    );
  }

  private parseHourValue(value: unknown): DaySegment[] {
    if (!value) {
      return [];
    }

    if (typeof value === 'string') {
      return this.parseHourString(value);
    }

    if (Array.isArray(value)) {
      return value.flatMap((entry) => this.parseHourValue(entry));
    }

    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const openValue = record.open ?? record.start ?? record.opens;
      const closeValue = record.close ?? record.end ?? record.closes;
      if (typeof openValue === 'string' && typeof closeValue === 'string') {
        return [this.buildSegmentFromHHMM(openValue, closeValue)];
      }
    }

    return [];
  }

  private parseHourString(value: string): DaySegment[] {
    const rangeMatch = value.match(
      /(\d{1,2}:?\d{0,2}\s?(am|pm)?)[^\d]+(\d{1,2}:?\d{0,2}\s?(am|pm)?)/i,
    );
    if (!rangeMatch) {
      return [];
    }

    const openRaw = rangeMatch[1];
    const closeRaw = rangeMatch[3];
    return [this.buildSegmentFromHHMM(openRaw, closeRaw)];
  }

  private buildSegmentFromHHMM(openRaw: string, closeRaw: string): DaySegment {
    const openMinutes = this.parseTimeString(openRaw);
    const closeMinutes = this.parseTimeString(closeRaw);

    if (openMinutes === null || closeMinutes === null) {
      return { start: 0, end: 0, crossesMidnight: false };
    }

    if (closeMinutes <= openMinutes) {
      return {
        start: openMinutes,
        end: closeMinutes,
        crossesMidnight: true,
      };
    }

    return {
      start: openMinutes,
      end: closeMinutes,
      crossesMidnight: false,
    };
  }

  private parseTimeString(value: string): number | null {
    const trimmed = value.trim().toLowerCase();
    const match = trimmed.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (!match) {
      return null;
    }

    let hour = Number(match[1]);
    const minutes = match[2] ? Number(match[2]) : 0;
    const period = match[3];

    if (period === 'pm' && hour < 12) {
      hour += 12;
    } else if (period === 'am' && hour === 12) {
      hour = 0;
    }

    return hour * 60 + minutes;
  }

  private findNextOpenDisplay(
    schedule: DailySchedule,
    timeContext: { dayKey: DayKey; minutes: number },
  ): string | null {
    const startDayIndex = DAY_KEYS.indexOf(timeContext.dayKey);
    if (startDayIndex < 0) {
      return null;
    }

    for (let offset = 0; offset < DAY_KEYS.length; offset += 1) {
      const dayIndex = (startDayIndex + offset) % DAY_KEYS.length;
      const dayKey = DAY_KEYS[dayIndex];
      const segments = schedule[dayKey] || [];

      for (const segment of segments) {
        if (offset === 0 && segment.start <= timeContext.minutes) {
          continue;
        }

        const timeLabel = this.formatMinutesToDisplay(segment.start);
        const dayLabel = this.describeDayOffset(dayKey, offset);
        return dayLabel ? `${timeLabel} ${dayLabel}` : timeLabel;
      }
    }

    return null;
  }

  private describeDayOffset(dayKey: DayKey, offset: number): string {
    if (offset === 0) {
      return '';
    }
    if (offset === 1) {
      return 'tomorrow';
    }
    const label = dayKey.slice(0, 3);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  private coerceRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private toOptionalNumber(
    value?: Prisma.Decimal | number | string | null,
  ): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (value instanceof Prisma.Decimal) {
      return value.toNumber();
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    return null;
  }
}
