-- Tailr phase two, step 9: atomic slip writes, and recording a bet from a draft.
--
-- Same approach as create_bet / update_bet: a draft and its selections must be saved
-- together or not at all, and PostgREST cannot run two statements in one transaction.
-- Both functions are SECURITY INVOKER, so they run as the signed-in user and every
-- privacy rule still applies. create_slip takes the owner from the session, never from
-- the input. A slip is always created as a manual draft; nothing here creates a bet.

create or replace function public.create_slip(p_slip jsonb, p_selections jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if p_selections is null
     or jsonb_typeof(p_selections) <> 'array'
     or jsonb_array_length(p_selections) = 0 then
    raise exception 'A slip needs at least one selection' using errcode = '22023';
  end if;
  if jsonb_array_length(p_selections) > 50 then
    raise exception 'A slip can have at most 50 selections' using errcode = '22023';
  end if;

  insert into public.slip_drafts (user_id, name, source_bookmaker)
  values (
    (select auth.uid()),
    p_slip ->> 'name',
    p_slip ->> 'source_bookmaker'
  )
  returning id into new_id;

  insert into public.slip_selections (slip_draft_id, sport, event, market_type, selection, odds_decimal, sort_order)
  select
    new_id,
    s ->> 'sport',
    s ->> 'event',
    s ->> 'market_type',
    s ->> 'selection',
    (s ->> 'odds_decimal')::numeric,
    (t.ord - 1)::int
  from jsonb_array_elements(p_selections) with ordinality as t(s, ord);

  return new_id;
end;
$$;

-- Updates only the fields present in p_patch (a key set to null clears that field; name
-- cannot be cleared). When p_selections is given, the selections are replaced as a whole.
-- Returns false when the draft does not exist or does not belong to the caller.

create or replace function public.update_slip(p_id uuid, p_patch jsonb, p_selections jsonb default null)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated_count int;
begin
  if p_selections is not null then
    if jsonb_typeof(p_selections) <> 'array' or jsonb_array_length(p_selections) = 0 then
      raise exception 'A slip needs at least one selection' using errcode = '22023';
    end if;
    if jsonb_array_length(p_selections) > 50 then
      raise exception 'A slip can have at most 50 selections' using errcode = '22023';
    end if;
  end if;

  -- updated_at is set explicitly so a change to only the selections still moves the draft up the list.
  update public.slip_drafts set
    name             = case when p_patch ? 'name'             then p_patch ->> 'name'             else name end,
    source_bookmaker = case when p_patch ? 'source_bookmaker' then p_patch ->> 'source_bookmaker' else source_bookmaker end,
    status           = case when p_patch ? 'status'           then p_patch ->> 'status'           else status end,
    updated_at       = now()
  where id = p_id;

  get diagnostics updated_count = row_count;
  if updated_count = 0 then
    return false;
  end if;

  if p_selections is not null then
    delete from public.slip_selections where slip_draft_id = p_id;

    insert into public.slip_selections (slip_draft_id, sport, event, market_type, selection, odds_decimal, sort_order)
    select
      p_id,
      s ->> 'sport',
      s ->> 'event',
      s ->> 'market_type',
      s ->> 'selection',
      (s ->> 'odds_decimal')::numeric,
      (t.ord - 1)::int
    from jsonb_array_elements(p_selections) with ordinality as t(s, ord);
  end if;

  return true;
end;
$$;

revoke execute on function public.create_slip(jsonb, jsonb) from public, anon;
revoke execute on function public.update_slip(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.create_slip(jsonb, jsonb) to authenticated;
grant execute on function public.update_slip(uuid, jsonb, jsonb) to authenticated;

-- create_bet can now record which draft the bet came from. The foreign key added in step 8
-- covers (draft, owner), so a bet can only point at a draft the same user owns; anything
-- else fails with a foreign key error and nothing is saved. The draft itself is untouched:
-- it stays a draft.

create or replace function public.create_bet(p_bet jsonb, p_selections jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if p_selections is null
     or jsonb_typeof(p_selections) <> 'array'
     or jsonb_array_length(p_selections) = 0 then
    raise exception 'A bet needs at least one selection' using errcode = '22023';
  end if;

  insert into public.bets (user_id, bookmaker_label, currency, stake_minor, decimal_odds, placed_at, notes, slip_draft_id)
  values (
    (select auth.uid()),
    p_bet ->> 'bookmaker_label',
    p_bet ->> 'currency',
    (p_bet ->> 'stake_minor')::bigint,
    (p_bet ->> 'decimal_odds')::numeric,
    (p_bet ->> 'placed_at')::timestamptz,
    p_bet ->> 'notes',
    (p_bet ->> 'slip_draft_id')::uuid
  )
  returning id into new_id;

  insert into public.bet_selections (bet_id, sport, event, market_type, selection, odds_decimal, sort_order)
  select
    new_id,
    s ->> 'sport',
    s ->> 'event',
    s ->> 'market_type',
    s ->> 'selection',
    (s ->> 'odds_decimal')::numeric,
    (t.ord - 1)::int
  from jsonb_array_elements(p_selections) with ordinality as t(s, ord);

  return new_id;
end;
$$;
