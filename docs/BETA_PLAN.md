# Private beta plan (step 16)

Goal: 20 to 50 invited testers use Tailr for two to four weeks, so we learn what stops people before spending on more features.

## Who and how
- Invite people you know who bet on football regularly, in small waves (first 5, then 15, then up to 50).
- Give everyone the shared invite code (`TAILR_BETA_CODE` on Vercel). Change the code to stop new sign-ups from anyone who has it.
- The invite code is a soft gate. For a hard wall, turn off **Allow new users to sign up** in Supabase (Authentication, Sign In / Providers) and add each tester by hand under Authentication, Users. Pick one: soft is easier, hard is stricter.

## Setup checklist (you)
1. Merge the PRs in order: step 14, Telegram, then this one.
2. Vercel env vars: `TAILR_BETA_CODE`, `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY` (needs credit), and the Telegram set (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_USERNAME`, `TAILR_APP_URL`). Redeploy after.
3. Supabase email templates: include `{{ .Token }}` and set the code length to 6.
4. Telegram: create the bot with @BotFather, then register the webhook `https://<your-site>/api/telegram/webhook` with the same secret.
5. Send yourself and your co-founder through sign-up, a pasted slip, a screenshot, a Telegram slip, a recorded bet, a settle, export, and delete-account on a spare email.

## What we measure
Run `supabase/beta-metrics.sql` in the Supabase SQL editor. It gives: people joined, made a slip, recorded a bet, came back on a second day, Telegram linked, slips from text and from screenshots, feedback notes. Target for a healthy beta: most joiners make a slip, at least a third record a bet, at least a quarter come back.
Not tracked yet: how often people correct a parsed slip, and app errors (check Vercel logs).

## Interview questions (15 minutes each)
1. Walk me through the last bet you placed. Where did the slip come from?
2. Show me how you tried Tailr. Where did you hesitate?
3. Did the parsed slip match what you meant? What was wrong?
4. Would you rather paste, screenshot, or type? Why?
5. What did you expect Tailr to do that it did not?
6. Would you tell a friend? What would you say?

## Go or no-go
Go wider if: testers finish a first slip without help, parsing mistakes are rare enough that people trust the review step, and no one loses data. Stop and fix first if: anyone sees another person's data, deletion fails, or sign-up emails do not arrive.
After two weeks, list the top three blockers from feedback notes and interviews and fix those before anything new.

## Before inviting people
- Have a lawyer review `docs/TERMS_DRAFT.md` and the `/privacy` page, including Nigerian data protection and any gambling-advertising rules that apply to a betting assistant.
- Tell testers plainly: this is a beta, Tailr does not place bets, and betting can lose money.
