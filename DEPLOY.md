# Deploying ChainScout

ChainScout is a full-stack Vite + TanStack Start + Nitro app. The production build
targets **Vercel** (`nitro({ preset: "vercel" })` in `vite.config.ts`, and `vercel.json`
already set). This page is everything you need for a permanent public URL.

## Option A — Vercel (recommended, full stack)

Two minutes, no CLI needed:

1. Push this repo to GitHub (it already lives at
   `timalen99-commits/apex-polar-honey-oasis`).
2. Go to **vercel.com/new** → **Continue with GitHub** → import
   `apex-polar-honey-oasis`.
3. Vercel reads `vercel.json` and the Nitro build-output automatically. Defaults are
   correct (Build: `npm run build`). Click **Deploy**.
4. Add environment variables in *Project → Settings → Environment Variables*:

   | Variable | Needed for |
   | --- | --- |
   | `GEMINI_API_KEY` | Agent Brain (free tier, first in rotation) |
   | `GROQ_API_KEY` | Agent Brain (free tier, fallback) |
   | `OPENROUTER_API_KEY` | Agent Brain (free tier, fallback) |
   | `XAI_API_KEY` | Live lead hunt + campaign scans |
   | `OPENAI_API_KEY` | Optional — paid fallback, last in rotation |
   | `DATABASE_URL` | Optional — Postgres; without it the app uses its PGLite fallback |

   Without keys the app still runs; Brain/hunt actions show honest
   "not configured / add a key" errors instead of failing silently.
5. Redeploy after adding keys, then smoke-test:
   - `/` renders all views (Earn now … 24/7 agent)
   - **Agent brain → Test providers** confirms which keys are live
   - **Grind board → Hunt live leads** exercises the xAI search path
   - `/?install=1` shows the PWA install page (works offline as an installed app)

CLI alternative from a local clone: `npx vercel` then `npx vercel --prod`
(same env vars via `vercel env pull` / project settings).

## Option B — other Node hosts

The build is Nitro, so any Nitro deploy target works after `npm run build`:

```sh
npm run build
npx nitro deploy --prebuilt   # provider prompts; needs that host's credentials
```

Railway / Render / Fly: connect the repo, build command `npm run build`,
and set the same environment variables.

## Option C — GitHub Pages (not recommended)

GitHub Pages is static-only: the dashboard and localStorage features work, but
**Agent Brain, live hunts, and auth popups are server routes and will 404**.
Only use this for a portfolio demo, and label it as such.

## Notes

- The wallet desk needs **HTTPS** (all hosted options above provide it) — browser
  wallets refuse plain HTTP except on localhost.
- "24/7 agent" cadence runs while the deployed app is open in a browser; a hosted
  always-on loop would need a separate scheduler worker (the engine is ready for it).
- Never commit `.env`. On Vercel, keys live only in project environment variables.
