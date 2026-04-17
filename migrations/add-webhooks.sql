CREATE TABLE IF NOT EXISTS "webhook_endpoints" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"event_types" jsonb NOT NULL,
	"created_by_user_id" integer REFERENCES users(id) ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "webhook_outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"endpoint_id" integer NOT NULL REFERENCES webhook_endpoints(id) ON DELETE cascade,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "webhook_outbox_status_next_attempt_idx" ON "webhook_outbox" USING btree ("status","next_attempt_at");
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_outbox_endpoint_event_idx" ON "webhook_outbox" USING btree ("endpoint_id","event_id");
