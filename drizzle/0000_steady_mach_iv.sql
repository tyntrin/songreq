CREATE TABLE "accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "blocked_devices" (
	"performer_id" text NOT NULL,
	"device_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocked_devices_performer_id_device_id_pk" PRIMARY KEY("performer_id","device_id")
);
--> statement-breakpoint
CREATE TABLE "performer_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"performer_id" text NOT NULL,
	"created_by" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "performer_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "performer_members" (
	"id" text PRIMARY KEY NOT NULL,
	"performer_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "performer_members_performer_id_user_id_unique" UNIQUE("performer_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "performers" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"promptpay_type" text,
	"promptpay_id" text,
	"accepting_requests" boolean DEFAULT true NOT NULL,
	"suspended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "performers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "repertoire" (
	"id" text PRIMARY KEY NOT NULL,
	"performer_id" text NOT NULL,
	"song_id" text NOT NULL,
	"song_key" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repertoire_performer_id_song_id_unique" UNIQUE("performer_id","song_id")
);
--> statement-breakpoint
CREATE TABLE "request_items" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"song_id" text NOT NULL,
	"seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" text PRIMARY KEY NOT NULL,
	"setlist_id" text NOT NULL,
	"performer_id" text NOT NULL,
	"device_id" text NOT NULL,
	"client_request_id" text NOT NULL,
	"requester_name" text,
	"message" text,
	"tip_amount" integer DEFAULT 0 NOT NULL,
	"tip_claimed_at" timestamp with time zone,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requests_performer_id_device_id_client_request_id_unique" UNIQUE("performer_id","device_id","client_request_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setlist_songs" (
	"setlist_id" text NOT NULL,
	"song_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "setlist_songs_setlist_id_song_id_pk" PRIMARY KEY("setlist_id","song_id")
);
--> statement-breakpoint
CREATE TABLE "setlists" (
	"id" text PRIMARY KEY NOT NULL,
	"performer_id" text NOT NULL,
	"name" text NOT NULL,
	"public_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setlists_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"source" text NOT NULL,
	"itunes_track_id" text,
	"created_by" text,
	CONSTRAINT "songs_itunes_track_id_unique" UNIQUE("itunes_track_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"email_verified" timestamp with time zone,
	"image" text,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_devices" ADD CONSTRAINT "blocked_devices_performer_id_performers_id_fk" FOREIGN KEY ("performer_id") REFERENCES "public"."performers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performer_invites" ADD CONSTRAINT "performer_invites_performer_id_performers_id_fk" FOREIGN KEY ("performer_id") REFERENCES "public"."performers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performer_invites" ADD CONSTRAINT "performer_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performer_members" ADD CONSTRAINT "performer_members_performer_id_performers_id_fk" FOREIGN KEY ("performer_id") REFERENCES "public"."performers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performer_members" ADD CONSTRAINT "performer_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repertoire" ADD CONSTRAINT "repertoire_performer_id_performers_id_fk" FOREIGN KEY ("performer_id") REFERENCES "public"."performers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repertoire" ADD CONSTRAINT "repertoire_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_items" ADD CONSTRAINT "request_items_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_items" ADD CONSTRAINT "request_items_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_setlist_id_setlists_id_fk" FOREIGN KEY ("setlist_id") REFERENCES "public"."setlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_performer_id_performers_id_fk" FOREIGN KEY ("performer_id") REFERENCES "public"."performers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlist_songs" ADD CONSTRAINT "setlist_songs_setlist_id_setlists_id_fk" FOREIGN KEY ("setlist_id") REFERENCES "public"."setlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlist_songs" ADD CONSTRAINT "setlist_songs_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlists" ADD CONSTRAINT "setlists_performer_id_performers_id_fk" FOREIGN KEY ("performer_id") REFERENCES "public"."performers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "request_items_request_idx" ON "request_items" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "requests_performer_created_idx" ON "requests" USING btree ("performer_id","created_at");--> statement-breakpoint
CREATE INDEX "setlist_songs_setlist_position_idx" ON "setlist_songs" USING btree ("setlist_id","position");