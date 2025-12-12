import { defineRelations } from "drizzle-orm";
import * as schema from "./schema.ts";

export const relations = defineRelations(schema, (r) => ({
  users: {
    sessions: r.many.sessions(),
    notes: r.many.notes(),
  },
  sessions: {
    user: r.one.users({
      from: r.sessions.userId,
      to: r.users.id,
    }),
  },
  notes: {
    owner: r.one.users({
      from: r.notes.ownerId,
      to: r.users.id,
    }),
    parent: r.one.notes({
      from: r.notes.parentId,
      to: r.notes.id,
      alias: "parent",
    }),
    children: r.many.notes({
      alias: "children",
      from: r.notes.id,
      to: r.notes.parentId,
    }),
  },
}));
