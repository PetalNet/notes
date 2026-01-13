import type { KnipConfig } from "knip";

export default {
  entry: ["./src/instrumentation.server.ts"],
  ignoreExportsUsedInFile: {
    interface: true,
    type: true,
  },
  includeEntryExports: true,
  treatConfigHintsAsErrors: true,
  ignoreFiles: ["src/lib/types/**/*.ts"],
  ignoreUnresolved: [/\$env\/(?:dynamic|static)\/(?:private|public)/],
} satisfies KnipConfig;
