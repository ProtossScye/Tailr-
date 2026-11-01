# Supabase Auth settings checklist

Do this once in the Supabase dashboard (project "Tailr"). These settings cannot be changed from code or from Claude's Supabase connector.
Open: **Authentication** in the left menu.

## 1. URLs (Authentication → URL Configuration)

- [ ] **Site URL:** `http://localhost:3000` while developing. Change it to the real domain when you deploy.
- [ ] **Redirect URLs:** add `http://localhost:3000/**`. When you deploy, also add `https://YOUR-DOMAIN/**` (and your Vercel preview pattern if you use one).

If these are wrong, the confirmation email link sends people to the wrong place or is rejected.

## 2. Email sign-in (Authentication → Sign In / Providers → Email)

- [ ] Email provider is **enabled**.
- [ ] **Confirm email:** decide.
  - **On (recommended before real users):** people must click the emailed link. The app shows "Check your email".
  - **Off (fastest for development):** sign-up signs them straight in. Turn it on again before launch.
- [ ] **Minimum password length:** 8 or more (the app already asks for 8).
- [ ] Optional: turn on **leaked password protection** if your plan offers it.

## 3. Confirmation email template (Authentication → Email Templates → Confirm signup)

The app handles Supabase's default link as it is, so you can skip this at first. For the most reliable link (works when the email is opened on a different device), change the link in the template to:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm your email</a>
```

## 4. Email sending limits (Authentication → SMTP Settings)

Supabase's built-in email sender is for testing only and allows very few emails per hour. Before real users, add your own SMTP provider (Resend, Postmark, Brevo, etc.).

## 5. Keys

- [ ] Project Settings → API Keys: copy the **publishable** key (`sb_publishable_...`) into `.env.local` as `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- [ ] Do **not** copy the secret key anywhere yet. Nothing in the app uses it.

## 6. Check it works

1. `npm run dev`, open http://localhost:3000/sign-up, create an account.
2. In Supabase → Table Editor → `profiles`: a row for that user exists (created by the trigger).
3. Confirm the email (or skip if confirmation is off) and sign in. You land on `/dashboard`.
4. Visit `/dashboard` in a private window: you are sent to `/sign-in`.
