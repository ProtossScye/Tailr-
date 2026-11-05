-- Tailr phase two, step 12: a log of AI calls, which is also where the per-user limits are enforced.
--
-- Every call to the AI provider is recorded here BEFORE it is made (status 'started'), and closed
-- afterwards with its outcome, model and token counts. Token counts are what the provider reports;
-- no prices are stored, so cost can be worked out later without guessing. The pasted text, the
-- model's answer and anything else the person typed are NOT stored: only sizes and outcomes.
--
-- Limits: 10 calls per hour and 40 per day, per user. They live inside begin_ai_call because the
-- function is the only way to add a row. People can read their own log but cannot insert, change or
-- delete rows, so they cannot reset their own limit. The functions are SECURITY DEFINER for exactly
-- that reason; each one acts only for auth.uid() and refuses anyone who is not signed in.

create table public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  purpose text not null check (purpose in ('read_slip')),
  status text not null default 'started' check (status in ('started', 'ok', 'timeout', 'invalid_output', 'provider_error')),
  input_chars integer not null default 0 check (input_chars >= 0),
  model text check (model is null or char_length(model) between 1 and 100),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  created_at timestamptz not null default now()
);

create index ai_calls_user_created_idx on public.ai_calls (user_id, created_at desc);

-- security: read your own log, nothing else ------------------------------------------------

alter table public.ai_calls enable row level security;

revoke all on public.ai_calls from anon;
revoke all on public.ai_calls from authenticated;
grant select on public.ai_calls to authenticated;

create policy "Users read their own AI calls"
  on public.ai_calls for select to authenticated
  using ((select auth.uid()) = user_id);

-- begin_ai_call: records a call and returns its id, or returns null when the person has used
-- their allowance. Calls are serialized per user so two at once cannot both slip under the limit.

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
  if p_purpose is null or p_purpose not in ('read_slip') then
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

-- finish_ai_call: closes a call the caller started, once. false when there is no such open call.

create or replace function public.finish_ai_call(
  p_id uuid,
  p_status text,
  p_model text default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_latency_ms integer default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  updated_count integer;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('ok', 'timeout', 'invalid_output', 'provider_error') then
    raise exception 'Unknown status' using errcode = '22023';
  end if;

  update public.ai_calls
  set status = p_status,
      model = p_model,
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      latency_ms = p_latency_ms
  where id = p_id and user_id = uid and status = 'started';

  get diagnostics updated_count = row_count;
  return updated_count > 0;
end;
$$;

revoke execute on function public.begin_ai_call(text, integer) from public, anon;
revoke execute on function public.finish_ai_call(uuid, text, text, integer, integer, integer) from public, anon;
grant execute on function public.begin_ai_call(text, integer) to authenticated;
grant execute on function public.finish_ai_call(uuid, text, text, integer, integer, integer) to authenticated;
