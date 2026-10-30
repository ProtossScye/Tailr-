-- Tailr backend steps 2-4: a profile for every new user, privacy rules
-- (row-level security policies) and least-privilege grants.
--
-- After this migration a signed-in user can only ever read or change their own
-- profile, bets and bet legs. Signed-out visitors (anon) can touch nothing.

-- 1. A profile is created automatically when someone signs up --------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 80), '')
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- anyone who signed up before this trigger existed
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- 2. Least-privilege grants for signed-in users -----------------------------------
-- Profiles are created by the trigger and removed with the account, so users can
-- only read their profile and change its display name.

revoke all on public.profiles, public.bets, public.bet_selections from authenticated;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.bets to authenticated;
grant select, insert, update, delete on public.bet_selections to authenticated;

-- 3. Privacy rules: every row belongs to exactly one user --------------------------
-- (select auth.uid()) is wrapped so Postgres evaluates it once per query.

create policy "Users read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Users read their own bets"
  on public.bets for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users add their own bets"
  on public.bets for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own bets"
  on public.bets for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own bets"
  on public.bets for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Legs have no user_id of their own: they belong to whoever owns the parent bet.

create policy "Users read legs of their own bets"
  on public.bet_selections for select to authenticated
  using (exists (
    select 1 from public.bets b
    where b.id = bet_selections.bet_id and b.user_id = (select auth.uid())
  ));

create policy "Users add legs to their own bets"
  on public.bet_selections for insert to authenticated
  with check (exists (
    select 1 from public.bets b
    where b.id = bet_selections.bet_id and b.user_id = (select auth.uid())
  ));

create policy "Users update legs of their own bets"
  on public.bet_selections for update to authenticated
  using (exists (
    select 1 from public.bets b
    where b.id = bet_selections.bet_id and b.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.bets b
    where b.id = bet_selections.bet_id and b.user_id = (select auth.uid())
  ));

create policy "Users delete legs of their own bets"
  on public.bet_selections for delete to authenticated
  using (exists (
    select 1 from public.bets b
    where b.id = bet_selections.bet_id and b.user_id = (select auth.uid())
  ));
