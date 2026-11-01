-- Tailr backend step 7 support: atomic bet writes.
--
-- A bet and its legs must be saved together or not at all, and PostgREST cannot
-- run two statements in one transaction. These functions do it in one call.
--
-- Both are SECURITY INVOKER, so they run as the signed-in user and every privacy
-- rule (row-level security) still applies. create_bet takes the owner from the
-- session, never from the input, so a caller cannot create a bet in someone
-- else's name. New bets are always pending; settling goes through update_bet.

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

  insert into public.bets (user_id, bookmaker_label, currency, stake_minor, decimal_odds, placed_at, notes)
  values (
    (select auth.uid()),
    p_bet ->> 'bookmaker_label',
    p_bet ->> 'currency',
    (p_bet ->> 'stake_minor')::bigint,
    (p_bet ->> 'decimal_odds')::numeric,
    (p_bet ->> 'placed_at')::timestamptz,
    p_bet ->> 'notes'
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

-- Updates only the fields present in p_patch (a key set to null clears that field).
-- When p_selections is given, the legs are replaced as a whole. Returns false when
-- the bet does not exist or does not belong to the caller.

create or replace function public.update_bet(p_id uuid, p_patch jsonb, p_selections jsonb default null)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated_count int;
begin
  if p_selections is not null
     and (jsonb_typeof(p_selections) <> 'array' or jsonb_array_length(p_selections) = 0) then
    raise exception 'A bet needs at least one selection' using errcode = '22023';
  end if;

  update public.bets set
    bookmaker_label    = case when p_patch ? 'bookmaker_label'    then p_patch ->> 'bookmaker_label'              else bookmaker_label end,
    currency           = case when p_patch ? 'currency'           then p_patch ->> 'currency'                     else currency end,
    stake_minor        = case when p_patch ? 'stake_minor'        then (p_patch ->> 'stake_minor')::bigint        else stake_minor end,
    decimal_odds       = case when p_patch ? 'decimal_odds'       then (p_patch ->> 'decimal_odds')::numeric      else decimal_odds end,
    status             = case when p_patch ? 'status'             then p_patch ->> 'status'                       else status end,
    placed_at          = case when p_patch ? 'placed_at'          then (p_patch ->> 'placed_at')::timestamptz     else placed_at end,
    settled_at         = case when p_patch ? 'settled_at'         then (p_patch ->> 'settled_at')::timestamptz    else settled_at end,
    gross_return_minor = case when p_patch ? 'gross_return_minor' then (p_patch ->> 'gross_return_minor')::bigint else gross_return_minor end,
    notes              = case when p_patch ? 'notes'              then p_patch ->> 'notes'                        else notes end
  where id = p_id;

  get diagnostics updated_count = row_count;
  if updated_count = 0 then
    return false;
  end if;

  if p_selections is not null then
    delete from public.bet_selections where bet_id = p_id;

    insert into public.bet_selections (bet_id, sport, event, market_type, selection, odds_decimal, sort_order)
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

-- Only signed-in users may call these. Signed-out visitors cannot.

revoke execute on function public.create_bet(jsonb, jsonb) from public, anon;
revoke execute on function public.update_bet(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.create_bet(jsonb, jsonb) to authenticated;
grant execute on function public.update_bet(uuid, jsonb, jsonb) to authenticated;
