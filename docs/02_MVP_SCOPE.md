# 02 — MVP Scope

## Must-have
### Accounts and preferences
Secure sign-in; editable favorite sports, preferred/avoided markets, slip style, optional target odds range, and explanation level. Users can skip or override preferences.

### Slip assistant
Start with pasted text, then add image upload/OCR. Extract sport, event, market, selection, visible odds, bookmaker/code if present, and confidence/unknown fields. Show a review screen; let users correct selections. Suggest edits based on preferences and explain trade-offs. Save and copy/share drafts. Booking codes, live odds, and bookmaker conversion are not promised until individually verified.

### Manual tracker
Users separately add bets they actually placed. Store stake, currency (NGN initially), bookmaker label, selections, odds if known, placement date, status (pending/won/lost/void), and optional notes. Allow correction/deletion and label entries “User-reported.” Define cash-out accounting before adding it.

### Dashboard
Settled profit/loss and total stake for the same date range; ROI = net profit ÷ included settled stakes × 100 when denominator > 0; pending bets shown separately; win rate = wins ÷ (wins + losses) × 100, excluding pending/void. Show history and filters. Never use fake performance data.

## Not in V1
Automatic sportsbook sync, placing bets, wallets/payments, copy-betting, claims of verified history, public leaderboards, and trying to support every sport/market/bookmaker. Web core first; Telegram next; X only after feasibility review.

## Critical distinction
A slip draft is not a placed bet. A shared pick is not proof that someone placed it. A target-odds request is a preference, not a guarantee.

## Acceptance test
A user can sign up, set/skip preferences, submit text, review/correct a draft, request preference-aware suggestions, save/copy it, separately record a placed bet, settle it, and see correct dashboard calculations.
