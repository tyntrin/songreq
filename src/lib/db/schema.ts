import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  boolean,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "@auth/core/adapters";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").notNull().defaultNow();

// ---- Auth.js (shape required by @auth/drizzle-adapter, Postgres) ----
export const users = pgTable("users", {
  id: id(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date", withTimezone: true }),
  image: text("image"),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ---- App tables (spec §7) ----
export const performers = pgTable("performers", {
  id: id(),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  promptpayType: text("promptpay_type", { enum: ["phone", "national_id"] }),
  promptpayId: text("promptpay_id"),
  acceptingRequests: boolean("accepting_requests").notNull().default(true),
  suspendedAt: ts("suspended_at"),
  createdAt: createdAt(),
});

export const performerMembers = pgTable(
  "performer_members",
  {
    id: id(),
    performerId: text("performer_id")
      .notNull()
      .references(() => performers.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "member"] }).notNull(),
  },
  (t) => [unique().on(t.performerId, t.userId)],
);

export const performerInvites = pgTable("performer_invites", {
  id: id(),
  token: text("token").notNull().unique(),
  performerId: text("performer_id")
    .notNull()
    .references(() => performers.id, { onDelete: "cascade" }),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
});

export const songs = pgTable("songs", {
  id: id(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  source: text("source", { enum: ["itunes", "custom"] }).notNull(),
  itunesTrackId: text("itunes_track_id").unique(),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
});

export const repertoire = pgTable(
  "repertoire",
  {
    id: id(),
    performerId: text("performer_id")
      .notNull()
      .references(() => performers.id, { onDelete: "cascade" }),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    songKey: text("song_key"),
    tags: text("tags").array().notNull().default([]),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.performerId, t.songId)],
);

export const setlists = pgTable("setlists", {
  id: id(),
  performerId: text("performer_id")
    .notNull()
    .references(() => performers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  publicId: text("public_id").notNull().unique(),
  /** Soft delete: an archived setlist's QR stops working, its request history stays. */
  archivedAt: ts("archived_at"),
  createdAt: createdAt(),
});

export const setlistSongs = pgTable(
  "setlist_songs",
  {
    setlistId: text("setlist_id")
      .notNull()
      .references(() => setlists.id, { onDelete: "cascade" }),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.setlistId, t.songId] }),
    index("setlist_songs_setlist_position_idx").on(t.setlistId, t.position),
  ],
);

export const requests = pgTable(
  "requests",
  {
    id: id(),
    setlistId: text("setlist_id")
      .notNull()
      .references(() => setlists.id, { onDelete: "cascade" }),
    performerId: text("performer_id")
      .notNull()
      .references(() => performers.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    clientRequestId: text("client_request_id").notNull(),
    requesterName: text("requester_name"),
    message: text("message"),
    tipAmount: integer("tip_amount").notNull().default(0),
    tipClaimedAt: ts("tip_claimed_at"),
    hiddenAt: ts("hidden_at"),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.performerId, t.deviceId, t.clientRequestId),
    index("requests_performer_created_idx").on(t.performerId, t.createdAt),
  ],
);

export const requestItems = pgTable(
  "request_items",
  {
    id: id(),
    requestId: text("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    seenAt: ts("seen_at"),
    /** Musician hid this song card ("ซ่อนการ์ดนี้"); excluded from feed, stats and customer status. */
    hiddenAt: ts("hidden_at"),
  },
  (t) => [index("request_items_request_idx").on(t.requestId)],
);

export const blockedDevices = pgTable(
  "blocked_devices",
  {
    performerId: text("performer_id")
      .notNull()
      .references(() => performers.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.performerId, t.deviceId] })],
);
