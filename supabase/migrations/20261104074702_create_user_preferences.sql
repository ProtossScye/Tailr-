-- Tailr phase two, step 10: optional slip preferences.
--
-- Everything here is optional. A user with no row simply has no preferences, and anything
-- saved can be overridden or removed at any time. A target odds range is a preference the
-- app compares a slip against; it is never a promise that odds or outcomes can be hit.
--
-- One row per user. Same privacy model as bets and slips: row-level security is on, signed-out
-- visitors can touch nothing, and a signed-in user can only see and change their own row.

-- A list of short, non-empty text values with a size limit. A CHECK cannot contain a subquery,
-- so the rule lives in a small immutable function.
create or replace function public.is_clean_text_list(items text[], max_items int, max_length int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select items is not null
    and cardinality(items) <= max_items
    and not exists (
      select 1 from unnest(items) as e
      where e is null or char_length(e) not between 1 and max_length
    );
$$;

create table public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  favorite_sports text[] not null default '{}' check (public.is_clean_text_list(favorite_sports, 20, 80)),
  preferred_markets text[] not null default '{}' check (public.is_clean_text_list(preferred_markets, 20, 80)),
  avoided_markets text[] not null default '{}' check (public.is_clean_text_list(avoided_markets, 20, 80)),
  slip_style text check (slip_style is null or slip_style in ('cautious', 'balanced', 'ambitious')),
  target_odds_min numeric(12, 3) check (target_odds_min is null or target_odds_min >= 1),
  target_odds_max numeric(12, 3) check (target_odds_max is null or target_odds_max >= 1),
  detail_level text not null default 'standard' check (detail_level in ('brief', 'standard', 'detailed')),
  -- When the person last saved their preferences themselves.
  explicitly_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_preferences_target_range check (
    target_odds_min is null or target_odds_max is null or target_odds_min <= target_odds_max
  ),
  -- A market cannot be both wanted and avoided.
  constraint user_preferences_markets_disjoint check (not (preferred_markets && avoided_markets))
);

create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- security: deny by default, then least privilege --------------------------------------

alter table public.user_preferences enable row level security;

revoke all on public.user_preferences from anon;
revoke all on public.user_preferences from authenticated;
grant select, insert, update, delete on public.user_preferences to authenticated;

create policy "Users read their own preferences"
  on public.user_preferences for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users add their own preferences"
  on public.user_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own preferences"
  on public.user_preferences for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own preferences"
  on public.user_preferences for delete to authenticated
  using ((select auth.uid()) = user_id);

-- save_preferences: create or replace the caller's row in one statement. The owner comes from
-- the session, never from the input. Every field is replaced (a missing key means "not set"),
-- so the stored row always equals what the person last saved. SECURITY INVOKER, so the
-- privacy rules above still apply.

create or replace function public.save_preferences(p_prefs jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  sports text[];
  preferred text[];
  avoided text[];
begin
  if p_prefs is null or jsonb_typeof(p_prefs) <> 'object' then
    raise exception 'Preferences must be an object' using errcode = '22023';
  end if;

  sports    := coalesce(array(select jsonb_array_elements_text(p_prefs -> 'favorite_sports')), '{}');
  preferred := coalesce(array(select jsonb_array_elements_text(p_prefs -> 'preferred_markets')), '{}');
  avoided   := coalesce(array(select jsonb_array_elements_text(p_prefs -> 'avoided_markets')), '{}');

  insert into public.user_preferences (
    user_id, favorite_sports, preferred_markets, avoided_markets, slip_style,
    target_odds_min, target_odds_max, detail_level, explicitly_confirmed_at
  )
  values (
    (select auth.uid()),
    sports, preferred, avoided,
    p_prefs ->> 'slip_style',
    (p_prefs ->> 'target_odds_min')::numeric,
    (p_prefs ->> 'target_odds_max')::numeric,
    coalesce(p_prefs ->> 'detail_level', 'standard'),
    now()
  )
  on conflict (user_id) do update set
    favorite_sports = excluded.favorite_sports,
    preferred_markets = excluded.preferred_markets,
    avoided_markets = excluded.avoided_markets,
    slip_style = excluded.slip_style,
    target_odds_min = excluded.target_odds_min,
    target_odds_max = excluded.target_odds_max,
    detail_level = excluded.detail_level,
    explicitly_confirmed_at = excluded.explicitly_confirmed_at;
end;
$$;

revoke execute on function public.save_preferences(jsonb) from public, anon;
grant execute on function public.save_preferences(jsonb) to authenticated;
