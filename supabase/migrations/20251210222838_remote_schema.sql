drop extension if exists "pg_net";

create schema if not exists "drizzle";

create sequence "drizzle"."__drizzle_migrations_id_seq";

create sequence "public"."transactions_id_seq";

create sequence "public"."wallets_id_seq";


  create table "drizzle"."__drizzle_migrations" (
    "id" integer not null default nextval('drizzle.__drizzle_migrations_id_seq'::regclass),
    "hash" text not null,
    "created_at" bigint
      );



  create table "public"."transactions" (
    "id" integer not null default nextval('public.transactions_id_seq'::regclass),
    "type" text,
    "amount" bigint,
    "status" text,
    "reference" text,
    "from_user_id" text,
    "to_wallet_number" text,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."users" (
    "id" text not null,
    "email" text,
    "name" text,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."wallets" (
    "id" integer not null default nextval('public.wallets_id_seq'::regclass),
    "user_id" text,
    "balance" bigint default 0,
    "wallet_number" text,
    "created_at" timestamp with time zone default now()
      );


alter sequence "drizzle"."__drizzle_migrations_id_seq" owned by "drizzle"."__drizzle_migrations"."id";

alter sequence "public"."transactions_id_seq" owned by "public"."transactions"."id";

alter sequence "public"."wallets_id_seq" owned by "public"."wallets"."id";

CREATE UNIQUE INDEX __drizzle_migrations_pkey ON drizzle.__drizzle_migrations USING btree (id);

CREATE UNIQUE INDEX api_keys_key_key ON public.api_keys USING btree (key);

CREATE INDEX idx_transactions_from_user ON public.transactions USING btree (from_user_id);

CREATE INDEX idx_transactions_reference ON public.transactions USING btree (reference);

CREATE INDEX idx_transactions_to_wallet ON public.transactions USING btree (to_wallet_number);

CREATE INDEX idx_wallets_user_id ON public.wallets USING btree (user_id);

CREATE UNIQUE INDEX transactions_pkey ON public.transactions USING btree (id);

CREATE UNIQUE INDEX transactions_reference_key ON public.transactions USING btree (reference);

CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id);

CREATE UNIQUE INDEX wallets_pkey ON public.wallets USING btree (id);

CREATE UNIQUE INDEX wallets_wallet_number_key ON public.wallets USING btree (wallet_number);

alter table "drizzle"."__drizzle_migrations" add constraint "__drizzle_migrations_pkey" PRIMARY KEY using index "__drizzle_migrations_pkey";

alter table "public"."transactions" add constraint "transactions_pkey" PRIMARY KEY using index "transactions_pkey";

alter table "public"."users" add constraint "users_pkey" PRIMARY KEY using index "users_pkey";

alter table "public"."wallets" add constraint "wallets_pkey" PRIMARY KEY using index "wallets_pkey";

alter table "public"."api_keys" add constraint "api_keys_key_key" UNIQUE using index "api_keys_key_key";

alter table "public"."api_keys" add constraint "api_keys_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE not valid;

alter table "public"."api_keys" validate constraint "api_keys_user_id_fkey";

alter table "public"."api_keys" add constraint "api_keys_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE not valid;

alter table "public"."api_keys" validate constraint "api_keys_user_id_users_id_fk";

alter table "public"."transactions" add constraint "transactions_reference_key" UNIQUE using index "transactions_reference_key";

alter table "public"."wallets" add constraint "wallets_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE not valid;

alter table "public"."wallets" validate constraint "wallets_user_id_fkey";

alter table "public"."wallets" add constraint "wallets_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE not valid;

alter table "public"."wallets" validate constraint "wallets_user_id_users_id_fk";

alter table "public"."wallets" add constraint "wallets_wallet_number_key" UNIQUE using index "wallets_wallet_number_key";

grant delete on table "public"."transactions" to "anon";

grant insert on table "public"."transactions" to "anon";

grant references on table "public"."transactions" to "anon";

grant select on table "public"."transactions" to "anon";

grant trigger on table "public"."transactions" to "anon";

grant truncate on table "public"."transactions" to "anon";

grant update on table "public"."transactions" to "anon";

grant delete on table "public"."transactions" to "authenticated";

grant insert on table "public"."transactions" to "authenticated";

grant references on table "public"."transactions" to "authenticated";

grant select on table "public"."transactions" to "authenticated";

grant trigger on table "public"."transactions" to "authenticated";

grant truncate on table "public"."transactions" to "authenticated";

grant update on table "public"."transactions" to "authenticated";

grant delete on table "public"."transactions" to "service_role";

grant insert on table "public"."transactions" to "service_role";

grant references on table "public"."transactions" to "service_role";

grant select on table "public"."transactions" to "service_role";

grant trigger on table "public"."transactions" to "service_role";

grant truncate on table "public"."transactions" to "service_role";

grant update on table "public"."transactions" to "service_role";

grant delete on table "public"."users" to "anon";

grant insert on table "public"."users" to "anon";

grant references on table "public"."users" to "anon";

grant select on table "public"."users" to "anon";

grant trigger on table "public"."users" to "anon";

grant truncate on table "public"."users" to "anon";

grant update on table "public"."users" to "anon";

grant delete on table "public"."users" to "authenticated";

grant insert on table "public"."users" to "authenticated";

grant references on table "public"."users" to "authenticated";

grant select on table "public"."users" to "authenticated";

grant trigger on table "public"."users" to "authenticated";

grant truncate on table "public"."users" to "authenticated";

grant update on table "public"."users" to "authenticated";

grant delete on table "public"."users" to "service_role";

grant insert on table "public"."users" to "service_role";

grant references on table "public"."users" to "service_role";

grant select on table "public"."users" to "service_role";

grant trigger on table "public"."users" to "service_role";

grant truncate on table "public"."users" to "service_role";

grant update on table "public"."users" to "service_role";

grant delete on table "public"."wallets" to "anon";

grant insert on table "public"."wallets" to "anon";

grant references on table "public"."wallets" to "anon";

grant select on table "public"."wallets" to "anon";

grant trigger on table "public"."wallets" to "anon";

grant truncate on table "public"."wallets" to "anon";

grant update on table "public"."wallets" to "anon";

grant delete on table "public"."wallets" to "authenticated";

grant insert on table "public"."wallets" to "authenticated";

grant references on table "public"."wallets" to "authenticated";

grant select on table "public"."wallets" to "authenticated";

grant trigger on table "public"."wallets" to "authenticated";

grant truncate on table "public"."wallets" to "authenticated";

grant update on table "public"."wallets" to "authenticated";

grant delete on table "public"."wallets" to "service_role";

grant insert on table "public"."wallets" to "service_role";

grant references on table "public"."wallets" to "service_role";

grant select on table "public"."wallets" to "service_role";

grant trigger on table "public"."wallets" to "service_role";

grant truncate on table "public"."wallets" to "service_role";

grant update on table "public"."wallets" to "service_role";


