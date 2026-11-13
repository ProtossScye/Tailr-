-- Tailr phase two, step 16: private beta.
--
-- 1. user_feedback: short notes testers send from the Profile tab. Private to the sender; the team
--    reads them in the Supabase dashboard. Sending goes through submit_feedback, which checks the
--    text and allows 10 notes an hour per person.
-- 2. telegram_redeem_link now also clears wrong-code rows older than a day, so that table cannot grow forever.

create table public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('bug', 'idea', 'other')),
  message text not null check (char_length(message) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index user_feedback_user_idx on public.user_feedback (user_id, created_at desc);

alter table public.user_feedback enable row level security;
revoke all on public.user_feedback from anon, authenticated;
grant select on public.user_feedback to authenticated;

create policy "Users read their own feedback"
  on public.user_feedback for select to authenticated
  using ((select auth.uid()) = user_id);

-- submit_feedback: returns 'ok', 'invalid' (empty, too long or unknown kind) or 'limited' (10 in an hour).
create or replace function public.submit_feedback(p_kind text, p_message text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  msg text := regexp_replace(coalesce(p_message, ''), '^\s+|\s+$', '', 'g');
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_kind is null or p_kind not in ('bug', 'idea', 'other') or char_length(msg) not between 1 and 2000 then
    return 'invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text, 4));
  if (select count(*) from public.user_feedback where user_id = uid and created_at > now() - interval '1 hour') >= 10 then
    return 'limited';
  end if;

  insert into public.user_feedback (user_id, kind, message) values (uid, p_kind, msg);
  return 'ok';
end;
$$;

revoke all on function public.submit_feedback(text, text) from public, anon;
grant execute on function public.submit_feedback(text, text) to authenticated;

-- telegram_redeem_link: same as before, plus pruning of old wrong-code rows.
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

  delete from public.telegram_failed_links where created_at < now() - interval '1 day';

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
