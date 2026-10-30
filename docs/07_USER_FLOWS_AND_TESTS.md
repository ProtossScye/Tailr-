# 07 — User Flows and Tests

## Adapt a slip
Paste text/upload image → extract draft → show uncertain fields → user corrects → user requests change → Tailr proposes edits with reasons → user approves/edits/rejects → save/copy draft → explicitly state no bet was placed.

## Record a bet
Choose “Record a bet I placed” → enter stake/bookmaker/selections/odds/date → confirm placed → pending → settle won/lost/void → dashboard recalculates. A saved slip never becomes a bet automatically.

## Telegram
Link account using an expiring secure code or signed link → send privately → receive review link → same saved preferences apply. Never expose private history in groups.

## X
Only after feasibility review. Handle API limits, duplicate mentions, inaccessible posts/media, and private data carefully.

## Calculation test
Stake ₦5,000, gross return ₦9,000 → profit ₦4,000. Stake ₦3,000 lost → −₦3,000. Stake ₦2,000 lost → −₦2,000. Total profit −₦1,000 / settled stake ₦10,000 = ROI −10%.

Also test pending exclusion, void rule, zero denominator, settlement date boundaries, invalid stakes, and cross-user access denial.
