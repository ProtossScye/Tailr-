-- Tailr phase two, step 15: Telegram.
--
-- A person connects their Telegram account to their Tailr account with a one-time code made in the
-- app (it lasts 10 minutes and only its hash is stored). The bot then saves slips they send it as
-- DRAFTS in their account. Nothing here creates, settles or reads a bet.
--
-- The Telegram webhook has no signed-in user, so it talks to the database with the server's secret
-- key. The webhook code only ever calls the telegram_* functions below (each acts for one Telegram
-- user id and nothing else); the secret key itself can do anything, so it stays on the server.
-- Ordinary signed-in users and signed-out visitors cannot call these functions at all.

-- tables ----------------------------------------------------------------------------------------

create table public.telegram_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  telegram_user_id bigint not null unique,
  chat_id bigint not null,
  linked_at timestamptz not null default now()
);

-- Only the SHA-256 hash of a code is stored, so reading this table never reveals a usable code.
create table public.telegram_link_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index telegram_link_codes_user_idx on public.telegram_link_codes (user_id, created_at desc);

-- One row per Telegram update the bot has accepted: Telegram retries, and this stops a retry from
-- saving the same slip twice. It also counts messages per person for the rate limit. No text is stored.
create table public.telegram_updates (
  update_id bigint primary key,
  telegram_user_id bigint not null,
  received_at timestamptz not null default now()
);
create index telegram_updates_user_idx on public.telegram_updates (telegram_user_id, received_at desc);

-- Wrong codes, per Telegram user, so a code cannot be guessed by trying many.
create table public.telegram_failed_links (
  id bigint generated always as identity primary key,
  telegram_user_id bigint not null,
  created_at timestamptz not null default now()
);
create index telegram_failed_links_idx on public.telegram_failed_links (telegram_user_id, created_at desc);

-- security: deny by default ---------------------------------------------------------------------

alter table public.telegram_links enable row level security;
alter table public.telegram_link_codes enable row level security;
alter table public.telegram_updates enable row level security;
alter table public.telegram_failed_links enable row level security;

revoke all on public.telegram_links, public.telegram_link_codes, public.telegram_updates, public.telegram_failed_links from anon, authenticated;

-- A person can see, and remove, their own connection. They cannot create or change one directly.
grant select, delete on public.telegram_links to authenticated;

create policy "Users read their own Telegram link"
  on public.telegram_links for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users remove their own Telegram link"
  on public.telegram_links for delete to authenticated
  using ((select auth.uid()) = user_id);

-- create_telegram_link_code: for a signed-in person. Stores the hash of a code the app made, and
-- stops any earlier unused code from working. Returns when it expires, or null after 5 codes in an hour.

create or replace function public.create_telegram_link_code(p_code_hash text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  expires timestamptz := now() + interval '10 minutes';
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid code' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text, 1));

  if (select count(*) from public.telegram_link_codes where user_id = uid and created_at > now() - interval '1 hour') >= 5 then
    return null;
  end if;

  -- Earlier codes stop working but stay for a day, so the hourly limit above can count them.
  update public.telegram_link_codes set expires_at = now() where user_id = uid and expires_at > now();
  delete from public.telegram_link_codes where created_at < now() - interval '1 day';
  insert into public.telegram_link_codes (user_id, code_hash, expires_at) values (uid, p_code_hash, expires);
  return expires;
end;
$$;

-- The bot's functions. Each acts for one Telegram user id. Only the server's secret key may call them.

-- telegram_accept_update: 'ok' for a new update, 'duplicate' for one already seen, 'limited' after
-- 30 messages from one person in an hour (still recorded, so a retry is a duplicate).
create or replace function public.telegram_accept_update(p_update_id bigint, p_telegram_user_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_telegram_user_id::text, 2));
  delete from public.telegram_updates where received_at < now() - interval '2 days';

  if exists (select 1 from public.telegram_updates where update_id = p_update_id) then
    return 'duplicate';
  end if;

  select count(*) into recent from public.telegram_updates
   where telegram_user_id = p_telegram_user_id and received_at > now() - interval '1 hour';

  insert into public.telegram_updates (update_id, telegram_user_id) values (p_update_id, p_telegram_user_id);
  return case when recent >= 30 then 'limited' else 'ok' end;
end;
$$;

-- telegram_redeem_link: 'linked', 'invalid' (wrong, used or expired code), 'limited' (5 wrong codes
-- in an hour) or 'taken' (this Telegram account is already connected to someone else).
create or replace function public.telegram_redeem_link(p_code_hash text, p_telegram_user_id bigint, p_chat_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  code_row public.telegram_link_codes;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_telegram_user_id::text, 3));

  if (select count(*) from public.telegram_failed_links where telegram_user_id = p_telegram_user_id and created_at > now() - interval '1 hour') >= 5 then
    return 'limited';
  end if;

  select * into code_row from public.telegram_link_codes
   where code_hash = p_code_hash and expires_at > now()
   for update;
  if not found then
    insert into public.telegram_failed_links (telegram_user_id) values (p_telegram_user_id);
    return 'invalid';
  end if;

  if exists (select 1 from public.telegram_links where telegram_user_id = p_telegram_user_id and user_id <> code_row.user_id) then
    return 'taken';
  end if;

  insert into public.telegram_links (user_id, telegram_user_id, chat_id)
  values (code_row.user_id, p_telegram_user_id, p_chat_id)
  on conflict (user_id) do update
    set telegram_user_id = excluded.telegram_user_id, chat_id = excluded.chat_id, linked_at = now();

  delete from public.telegram_link_codes where user_id = code_row.user_id;
  delete from public.telegram_failed_links where telegram_user_id = p_telegram_user_id;
  return 'linked';
end;
$$;

create or replace function public.telegram_is_linked(p_telegram_user_id bigint)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (select 1 from public.telegram_links where telegram_user_id = p_telegram_user_id);
$$;

create or replace function public.telegram_unlink(p_telegram_user_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed int;
begin
  delete from public.telegram_links where telegram_user_id = p_telegram_user_id;
  get diagnostics removed = row_count;
  return removed > 0;
end;
$$;

-- telegram_create_draft: saves what the bot read as a draft for the person this Telegram account is
-- connected to. Returns null when it is not connected. It is only ever a draft, marked needs_review.
create or replace function public.telegram_create_draft(p_telegram_user_id bigint, p_slip jsonb, p_selections jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
  new_id uuid;
begin
  select user_id into owner from public.telegram_links where telegram_user_id = p_telegram_user_id;
  if owner is null then
    return null;
  end if;

  if p_selections is null or jsonb_typeof(p_selections) <> 'array' or jsonb_array_length(p_selections) = 0 then
    raise exception 'A slip needs at least one selection' using errcode = '22023';
  end if;
  if jsonb_array_length(p_selections) > 50 then
    raise exception 'A slip can have at most 50 selections' using errcode = '22023';
  end if;

  insert into public.slip_drafts (user_id, name, source_type, source_bookmaker)
  values (owner, p_slip ->> 'name', 'pasted_text', p_slip ->> 'source_bookmaker')
  returning id into new_id;

  insert into public.slip_selections (slip_draft_id, sport, event, market_type, selection, odds_decimal, verification_status, sort_order)
  select
    new_id,
    s ->> 'sport',
    s ->> 'event',
    s ->> 'market_type',
    s ->> 'selection',
    (s ->> 'odds_decimal')::numeric,
    'needs_review',
    (t.ord - 1)::int
  from jsonb_array_elements(p_selections) with ordinality as t(s, ord);

  return new_id;
end;
$$;

-- who may call what ------------------------------------------------------------------------------

revoke execute on function public.create_telegram_link_code(text) from public, anon;
grant execute on function public.create_telegram_link_code(text) to authenticated;

revoke execute on function public.telegram_accept_update(bigint, bigint) from public, anon, authenticated;
revoke execute on function public.telegram_redeem_link(text, bigint, bigint) from public, anon, authenticated;
revoke execute on function public.telegram_is_linked(bigint) from public, anon, authenticated;
revoke execute on function public.telegram_unlink(bigint) from public, anon, authenticated;
revoke execute on function public.telegram_create_draft(bigint, jsonb, jsonb) from public, anon, authenticated;

grant execute on function public.telegram_accept_update(bigint, bigint) to service_role;
grant execute on function public.telegram_redeem_link(text, bigint, bigint) to service_role;
grant execute on function public.telegram_is_linked(bigint) to service_role;
grant execute on function public.telegram_unlink(bigint) to service_role;
grant execute on function public.telegram_create_draft(bigint, jsonb, jsonb) to service_role;
