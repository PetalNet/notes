import { customType } from "drizzle-orm/sqlite-core";

export const uint8array = customType<{
  data: Uint8Array<ArrayBuffer>;
  driverData: Buffer<ArrayBuffer>;
  jsonData: string;
}>({
  dataType() {
    return "blob";
  },
  fromDriver(value) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  },
  toDriver(value) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  },
  forJsonSelect: (identifier, sql) => {
    return sql`hex(${identifier})`;
  },
  fromJson: (value: string) => {
    return Uint8Array.fromHex(value);
  },
});
