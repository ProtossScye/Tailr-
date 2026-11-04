-- Tailr phase two, step 8: slip drafts and their selections.
--
-- A slip draft is NOT a placed bet. Nothing here creates a bet, and a bet is only ever
-- linked to a draft when the user records it themselves (bets.slip_draft_id, below).
-- Drafts hold only what the user entered (or later, what a parser extracted and the user
-- reviewed). Odds are never invented, and combined odds are not stored: like net profit,
-- they are derived from the selections so there is one source of truth.
--
-- Same privacy model as bets: row-level security is on, signed-out visitors can touch
-- nothing, and a signed-in user can only see and change their own rows.

-- slip_drafts ---------------------------------------------------------------------

create table public.slip_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  -- How the draft came to exist. Only 'manual' is used until the parser exists.
  source_type text not null default 'manual' check (source_type in ('manual', 'pasted_text', 'image')),
  source_bookmaker text check (source_bookmaker is null or char_length(source_bookmaker) between 1 and 80),
  status text not null default 'draft' check (status in ('draft', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Lets bets point at a draft AND prove the same user owns both (see below).
  constraint slip_drafts_id_user_unique unique (id, user_id)
);

-- slip_selections: the legs of a draft ----------------------------------------------

create table public.slip_selections (
  id uuid primary key default gen_random_uuid(),
  slip_draft_id uuid not null references public.slip_drafts (id) on delete cascade,
  sport text check (sport is null or char_length(sport) between 1 and 80),
  event text not null check (char_length(event) between 1 and 200),
  event_start_at timestamptz,
  market_type text check (market_type is null or char_length(market_type) between 1 and 80),
  selection text not null check (char_length(selection) between 1 and 200),
  -- Decimal odds exactly as the user entered them. Null when unknown. Never filled in by Tailr.
  odds_decimal numeric(12, 3) check (odds_decimal is null or odds_decimal >= 1),
  -- user_entered: typed by the person. needs_review: read from text or an image and not yet
  -- checked. verified: reserved for sources Tailr can actually verify (none yet).
  verification_status text not null default 'user_entered'
    check (verification_status in ('user_entered', 'needs_review', 'verified')),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);

create index slip_drafts_user_updated_idx on public.slip_drafts (user_id, updated_at desc);
create index slip_selections_draft_idx on public.slip_selections (slip_draft_id, sort_order);

create trigger slip_drafts_set_updated_at
  before update on public.slip_drafts
  for each row execute function public.set_updated_at();

-- bets can remember which draft they were recorded from -----------------------------
-- The foreign key covers (draft, owner), so a bet can only point at a draft owned by the
-- same user. Deleting a draft keeps the bet and clears just the link.

alter table public.bets add column slip_draft_id uuid;

alter table public.bets
  add constraint bets_slip_draft_same_owner_fk
  foreign key (slip_draft_id, user_id)
  references public.slip_drafts (id, user_id)
  on delete set null (slip_draft_id);

create index bets_slip_draft_idx on public.bets (slip_draft_id) where slip_draft_id is not null;

-- security: deny by default, then least privilege --------------------------------------

alter table public.slip_drafts enable row level security;
alter table public.slip_selections enable row level security;

revoke all on public.slip_drafts, public.slip_selections from anon;
revoke all on public.slip_drafts, public.slip_selections from authenticated;
grant select, insert, update, delete on public.slip_drafts to authenticated;
grant select, insert, update, delete on public.slip_selections to authenticated;

-- (select auth.uid()) is wrapped so Postgres evaluates it once per query.

create policy "Users read their own slip drafts"
  on public.slip_drafts for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users add their own slip drafts"
  on public.slip_drafts for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own slip drafts"
  on public.slip_drafts for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own slip drafts"
  on public.slip_drafts for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Selections have no user_id of their own: they belong to whoever owns the parent draft.

create policy "Users read selections of their own drafts"
  on public.slip_selections for select to authenticated
  using (exists (
    select 1 from public.slip_drafts d
    where d.id = slip_selections.slip_draft_id and d.user_id = (select auth.uid())
  ));

create policy "Users add selections to their own drafts"
  on public.slip_selections for insert to authenticated
  with check (exists (
    select 1 from public.slip_drafts d
    where d.id = slip_selections.slip_draft_id and d.user_id = (select auth.uid())
  ));

create policy "Users update selections of their own drafts"
  on public.slip_selections for update to authenticated
  using (exists (
    select 1 from public.slip_drafts d
    where d.id = slip_selections.slip_draft_id and d.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.slip_drafts d
    where d.id = slip_selections.slip_draft_id and d.user_id = (select auth.uid())
  ));

create policy "Users delete selections of their own drafts"
  on public.slip_selections for delete to authenticated
  using (exists (
    select 1 from public.slip_drafts d
    where d.id = slip_selections.slip_draft_id and d.user_id = (select auth.uid())
  ));

comment on table public.slip_drafts is 'Slip drafts. Not placed bets: a bet is only linked to a draft when the user records it. Private per user.';
comment on table public.slip_selections is 'Legs of a slip draft, as entered by the user. Odds are never invented.';
