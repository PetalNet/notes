import { SQL } from "drizzle-orm";
import { customType } from "drizzle-orm/sqlite-core";

export const uint8array = customType<{
  data: Uint8Array<ArrayBuffer>;
  driverData: Buffer;
  jsonData: string;
}>({
  dataType: () => {
    return "blob";
  },
  fromDriver: (value) => {
    // Buffer.buffer can be a shared ArrayBuffer larger than the actual data.
    // Copy to a new Uint8Array with its own ArrayBuffer to avoid SharedArrayBuffer issues.
    return Uint8Array.from(value);
  },
  toDriver: (value: Uint8Array | SQL) => {
    if (value instanceof SQL) {
      return value;
    }

    return Buffer.from(value);
  },
  forJsonSelect: (identifier, sql) => {
    return sql`hex(${identifier})`;
  },
  fromJson: (value: string) => {
    return Uint8Array.fromHex(value);
  },
});
