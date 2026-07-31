# GEIP Investment Terminal — Powered by Meridyen

Bilingual (TR/EN), single-page investment/cash-flow terminal, deployed as a
static site on Vercel with a small serverless API for the AI features.

## AI features

- **AI Danışman (advisor chat)** — floating chat widget available on every
  view. It answers questions about the current user's portfolio, expenses
  and the platform's investment opportunities, grounded in a JSON summary
  of local app state sent with each request.
- **AI ile geliştir (editor assistant)** — inside the inline page editor
  (`?edit=1`), rewrites the currently focused text fragment per a
  free-text instruction (e.g. "shorter", "more formal").

Both features call `POST /api/chat` (`api/chat.js`), a Vercel serverless
function that talks to the Anthropic Messages API server-side. The API key
is never exposed to the browser.

### Setup

1. Copy `.env.example` to `.env` locally, or set the variable directly in
   the Vercel project settings (Project → Settings → Environment Variables).
2. Set `ANTHROPIC_API_KEY` to a valid Anthropic API key.
3. Deploy. `vercel.json` routes everything except `/api/*` to
   `index.html`, so the chat endpoint is reachable at `/api/chat`.

### Notes / follow-ups

- There is no per-user auth or rate limiting on `/api/chat` yet — anyone
  who can reach the deployment can call it. Before a public launch, add
  request throttling (e.g. Vercel Edge Config / KV, or an API gateway) and
  consider capping tokens/spend.
- The advisor's system prompt instructs it to avoid definitive investment
  directives and to flag that it is not a licensed financial advisor;
  review this against your actual compliance requirements before shipping
  to real users.
