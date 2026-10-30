# 04 — System Architecture (Proposal)

Choose a stack based on team experience and cost. Suggested starting point: Next.js + TypeScript, PostgreSQL, managed auth/storage such as Supabase, server-side AI provider adapter, and low-cost managed hosting. Avoid splitting into microservices prematurely.

## Flow
1. Web/bot receives text or image.
2. Channel adapter authenticates and resolves Tailr account.
3. Parser creates structured draft with confidence/missing fields.
4. User reviews/corrects it.
5. Personalization service loads saved preferences.
6. Rules/AI propose edits and explain them.
7. Save slip draft.
8. Only after user confirms they placed a bet, create a separate bet record.
9. Accounting service calculates dashboard from settled records.

## Architecture rules
AI is not the source of truth for odds, market availability, settlement, or accounting. Telegram/X adapters call shared backend services; they do not contain their own betting logic.

## Security
No sportsbook credentials or scraping. Validate uploads and limit file size. Enforce server-side per-user authorization. Rate-limit expensive AI/OCR endpoints. Keep secrets server-side. Minimize screenshot retention and private data in logs. Plan export/deletion and appropriate privacy/legal review.
