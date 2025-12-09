import { Temporal } from "temporal-polyfill";

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function formatRelativeTime(then: Temporal.Instant): string {
  const now = Temporal.Now.zonedDateTimeISO();
  const thenZoned = then.toZonedDateTimeISO(now.timeZoneId);

  // If before today's midnight, show days ago using Intl
  const daysDiff = thenZoned.toPlainDate().until(now.toPlainDate()).days;
  if (daysDiff >= 1) {
    return rtf.format(-daysDiff, "day");
  }

  // Otherwise show hours/minutes/seconds using Intl
  const duration = now.toInstant().since(then, {
    largestUnit: "hour",
    smallestUnit: "second",
  });

  if (duration.hours >= 1) {
    return rtf.format(-duration.hours, "hour");
  }
  if (duration.minutes >= 1) {
    return rtf.format(-duration.minutes, "minute");
  }
  return rtf.format(-duration.seconds, "second");
}
