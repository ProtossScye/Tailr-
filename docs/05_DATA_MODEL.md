# 05 — Initial Data Model

Use migrations, stable IDs, and decimal-safe money fields.

- `profiles`: id, display_name, created_at, updated_at.
- `user_preferences`: user_id, favorite_sports, preferred_markets, avoided_markets, slip_style, optional target_odds_min/max, detail_level, explicitly_confirmed_at.
- `slip_drafts`: id, user_id, source_type, source_bookmaker, status, versioned parsed_data, combined_odds_estimate, odds_source/timestamp, timestamps.
- `slip_selections`: id, slip_draft_id, sport, event, event_start_at, market_type, selection, odds_decimal, confidence, verification_status, sort_order.
- `bets`: id, user_id, optional slip_draft_id, bookmaker_label, currency, stake_amount, decimal_odds, status, placed_at, settled_at, gross_return, net_profit, provenance, notes, timestamps.
- `bet_selections`: id, bet_id, sport, event, market_type, selection, odds_decimal, sort_order.
- `channel_accounts`: id, user_id, channel, external_user_id, linked_at, verification_status.
- `events_audit`: id, user_id, event_type, entity_type/id, created_at, minimized metadata.

## Accounting rules
- Win: net profit = gross return − stake.
- Loss: net profit = −stake.
- Void: net profit = 0; agree whether void stake is excluded from ROI denominator.
- Pending: exclude from settled P/L and ROI.
- ROI = sum(net profit for included settled bets) ÷ sum(stakes for those same bets) × 100.
- Win rate = wins ÷ (wins + losses) × 100; pending and void excluded.
- Daily P/L uses settlement date; “bets placed today” uses placement date.
- Every user-owned table needs row-level authorization and cross-user access tests.
