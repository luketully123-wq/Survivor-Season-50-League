# Deploy Supabase Edge Functions (simple guide)

These are in `supabase/functions/`.

## 1) Install Supabase CLI
Google: "Install Supabase CLI" and follow the official Supabase docs for your computer.

## 2) Login + link your project
In a terminal, inside this project folder:
- `supabase login`
- `supabase link --project-ref YOUR_PROJECT_REF`
  (Your project ref is shown in Supabase dashboard → Project Settings → General)

## 3) Deploy functions
Run:
- `supabase functions deploy league-get`
- `supabase functions deploy draft-set`
- `supabase functions deploy draft-remove`
- `supabase functions deploy outcome-set`

## 4) Set secrets (server-side)
Run:
- `supabase secrets set SUPABASE_URL="https://YOUR_PROJECT.supabase.co"`
- `supabase secrets set SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"`
- `supabase secrets set SURVIVOR_ADMIN_CODE="YOUR_COMMISSIONER_CODE"`

The value you set for `SURVIVOR_ADMIN_CODE` is what you type into the website’s **Admin code** box.
