CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"key" text,
	"key_fingerprint" text,
	"name" text,
	"permissions" text[],
	"expires_at" timestamp with time zone,
	"revoked" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "api_keys_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text,
	"amount" bigint,
	"status" text,
	"reference" text,
	"from_user_id" text,
	"to_wallet_number" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "transactions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"balance" bigint DEFAULT 0,
	"wallet_number" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "wallets_wallet_number_unique" UNIQUE("wallet_number")
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_api_keys_user_id" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_api_keys_key" ON "api_keys" USING btree ("key");--> statement-breakpoint
CREATE INDEX "idx_api_keys_fingerprint" ON "api_keys" USING btree ("key_fingerprint");--> statement-breakpoint
CREATE INDEX "idx_transactions_from_user" ON "transactions" USING btree ("from_user_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_to_wallet" ON "transactions" USING btree ("to_wallet_number");--> statement-breakpoint
CREATE INDEX "idx_transactions_reference" ON "transactions" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "idx_wallets_user_id" ON "wallets" USING btree ("user_id");