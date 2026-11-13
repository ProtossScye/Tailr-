-- Tailr private beta numbers. Paste into the Supabase SQL editor (it runs as the project owner, so it
-- sees every person). Counts only; it reads no bet, slip or message content.
-- "Came back" means activity (a slip draft or a bet made) on two or more different Lagos calendar days.
-- Corrections to parsed slips are not tracked yet, so they are not here.
with activity as (
  select user_id, (created_at at time zone 'Africa/Lagos')::date as day from public.slip_drafts
  union
  select user_id, (created_at at time zone 'Africa/Lagos')::date as day from public.bets
),
returning_people as (
  select user_id from activity group by user_id having count(distinct day) >= 2
)
select
  (select count(*) from public.profiles) as people,
  (select count(distinct user_id) from public.slip_drafts) as made_a_slip,
  (select count(distinct user_id) from public.bets) as recorded_a_bet,
  (select count(*) from returning_people) as came_back,
  (select count(*) from public.telegram_links) as telegram_linked,
  (select count(*) from public.slip_drafts where source_type = 'pasted_text') as slips_from_text,
  (select count(*) from public.slip_drafts where source_type = 'image') as slips_from_screenshots,
  (select count(*) from public.user_feedback) as feedback_notes;
