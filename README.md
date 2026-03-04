# Survivor Season 50 League — Commissioner Only (Draft later)

What this site does:
- **Leaderboard:** rank + player + total points
- **Teams section:** each player row shows tribe-style team name + 3 cast tiles
- **Commissioner tools:** enter draft picks + weekly outcomes per cast member
- Points **accumulate week to week** automatically.

## Logo
This repo includes an original placeholder logo (no copyrighted Survivor assets).
Replace it with your own image you have rights to use:
1) Put your logo in `src/assets/`
2) Edit `src/App.tsx` import:
   `import logoUrl from './assets/logo-placeholder.svg'`

## Supabase (required)
You need:
1) Database tables + seed data created (schema + seed SQL you ran earlier)
2) A public storage bucket named `headshots` (optional but recommended)
3) Edge Functions deployed:
   - `league-get`
   - `draft-set`
   - `draft-remove`
   - `outcome-set`

## Deploy to Vercel (recommended)
1) Upload this project to GitHub
2) Vercel → New Project → import repo
3) Add env vars in Vercel:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - optional: `VITE_DEFAULT_JOIN_CODE=survivor50letsgo`
4) Deploy and share the link.

## Commissioner admin code
This site asks for an Admin code before it can save draft/outcomes.
That admin code is verified server-side inside Supabase Edge Functions via a secret `SURVIVOR_ADMIN_CODE`.
