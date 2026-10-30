-- Tailr backend step 1: tracker tables (profiles, bets, bet_selections).
--
-- Money is integer minor units: kobo (NGN) and cents (USD). Never floats.
-- Net profit is NOT stored. It is derived by lib/accounting from the stake and
-- gross return, so there is one source of truth for accounting.
-- Constraints below mirror the rules in lib/accounting so bad rows cannot be saved.
--
-- Row-level security is ON with no policies yet, so nothing is readable or
-- writable through the API until the privacy-rule migration adds policies.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- profiles ------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- bets: bets the user says they actually placed (never auto-created from a slip) ----

create table public.bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  bookmaker_label text check (bookmaker_label is null or char_length(bookmaker_label) between 1 and 80),
  currency text not null check (currency in ('NGN', 'USD')),
  stake_minor bigint not null check (stake_minor between 1 and 9007199254740991),
  decimal_odds numeric(12, 3) check (decimal_odds is null or decimal_odds >= 1),
  status text not null default 'pending' check (status in ('pending', 'won', 'lost', 'void')),
  placed_at timestamptz not null,
  settled_at timestamptz,
  gross_return_minor bigint check (gross_return_minor is null or gross_return_minor between 0 and 9007199254740991),
  provenance text not null default 'user_reported' check (provenance in ('user_reported')),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- pending: nothing settled yet. won: needs a return of at least the stake.
  -- lost/void: settled, and no return amount is stored.
  constraint bets_settlement_consistency check (
    (status = 'pending' and settled_at is null and gross_return_minor is null)
    or (status = 'won' and settled_at is not null and gross_return_minor is not null
        and gross_return_minor >= stake_minor)
    or (status in ('lost', 'void') and settled_at is not null and gross_return_minor is null)
  ),
  constraint bets_settled_after_placed check (settled_at is null or settled_at >= placed_at)
);

-- bet_selections: the legs of a bet ------------------------------------------

create table public.bet_selections (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null references public.bets (id) on delete cascade,
  sport text check (sport is null or char_length(sport) between 1 and 80),
  event text not null check (char_length(event) between 1 and 200),
  market_type text check (market_type is null or char_length(market_type) between 1 and 80),
  selection text not null check (char_length(selection) between 1 and 200),
  odds_decimal numeric(12, 3) check (odds_decimal is null or odds_decimal >= 1),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);

-- indexes for the dashboard and history queries ----------------------------------

create index bets_user_settled_idx on public.bets (user_id, settled_at desc);
create index bets_user_placed_idx on public.bets (user_id, placed_at desc);
create index bets_user_status_idx on public.bets (user_id, status);
create index bet_selections_bet_idx on public.bet_selections (bet_id, sort_order);

-- keep updated_at honest ---------------------------------------------------------

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger bets_set_updated_at
  before update on public.bets
  for each row execute function public.set_updated_at();

-- security: deny by default ------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.bets enable row level security;
alter table public.bet_selections enable row level security;

revoke all on public.profiles, public.bets, public.bet_selections from anon;

comment on table public.bets is 'User-reported placed bets. Money in integer minor units (kobo/cents). Net profit is derived, never stored.';
