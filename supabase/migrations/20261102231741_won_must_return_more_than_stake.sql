-- A won bet must return MORE than its stake. A bet that returns exactly its stake is
-- recorded as void (it counts towards nothing). Replaces the ">=" rule with ">".
alter table public.bets drop constraint bets_settlement_consistency;
alter table public.bets add constraint bets_settlement_consistency check (
  (status = 'pending' and settled_at is null and gross_return_minor is null)
  or (status = 'won' and settled_at is not null and gross_return_minor is not null
      and gross_return_minor > stake_minor)
  or (status in ('lost', 'void') and settled_at is not null and gross_return_minor is null)
);
