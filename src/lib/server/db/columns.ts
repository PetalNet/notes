import { customType } from "drizzle-orm/sqlite-core";
import { Temporal } from "temporal-polyfill";
import { SQL } from "drizzle-orm";

// https://github.com/drizzle-team/drizzle-orm/issues/4419#issuecomment-2885561863
export const instant = customType<{
  data: Temporal.Instant;
  driverData: number;
}>({
  dataType: () => {
    return "timestamp";
  },
  fromDriver: (value) => {
    return Temporal.Instant.fromEpochMilliseconds(value);
  },
  toDriver: (value: Temporal.Instant | SQL) => {
    if (value instanceof SQL) {
      return value;
    }

    return value.epochMilliseconds;
  },
});

export const uint8array = customType<{
  data: Uint8Array<ArrayBuffer>;
  driverData: Buffer;
}>({
  dataType: () => {
    return "blob";
  },
  fromDriver: (value) => {
    return new Uint8Array(value);
  },
  toDriver: (value: Uint8Array | SQL) => {
    if (value instanceof SQL) {
      return value;
    }

    return Buffer.from(value);
  },
});
