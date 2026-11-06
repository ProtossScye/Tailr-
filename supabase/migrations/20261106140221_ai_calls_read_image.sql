-- Screenshot reading: a second kind of AI call. It shares the per-person limit with text reading
-- (10 an hour, 40 a day across both), since an image read costs at least as much as a text one.
-- Still no pasted text, image or answer is stored: only size, model, token counts, timing, outcome.

alter table public.ai_calls drop constraint if exists ai_calls_purpose_check;
alter table public.ai_calls add constraint ai_calls_purpose_check check (purpose in ('read_slip', 'read_image'));

create or replace function public.begin_ai_call(p_purpose text, p_input_chars integer default 0)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  new_id uuid;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_purpose is null or p_purpose not in ('read_slip', 'read_image') then
    raise exception 'Unknown purpose' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

  if (select count(*) from public.ai_calls where user_id = uid and created_at > now() - interval '1 hour') >= 10
     or (select count(*) from public.ai_calls where user_id = uid and created_at > now() - interval '1 day') >= 40 then
    return null;
  end if;

  insert into public.ai_calls (user_id, purpose, input_chars)
  values (uid, p_purpose, greatest(coalesce(p_input_chars, 0), 0))
  returning id into new_id;

  return new_id;
end;
$$;

-- create or replace keeps existing grants, but state them again so this file is self-contained.
revoke execute on function public.begin_ai_call(text, integer) from public, anon;
grant execute on function public.begin_ai_call(text, integer) to authenticated;
