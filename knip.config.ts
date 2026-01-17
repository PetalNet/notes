import type { KnipConfig } from "knip";

export default {
  ignoreExportsUsedInFile: {
    interface: true,
    type: true,
  },
  includeEntryExports: true,
  treatConfigHintsAsErrors: true,
  ignoreUnresolved: [/\$env\/(?:dynamic|static)\/(?:private|public)/],
} satisfies KnipConfig;
