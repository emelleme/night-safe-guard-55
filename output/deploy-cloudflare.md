# Deploy CardCtrl to Cloudflare Pages

CardCtrl is a **static SPA** (Web NFC + localStorage). Same deploy shape as currentseas: build → `dist/` → `wrangler pages deploy`.

## Prerequisites

- Node 20+ and pnpm
- Cloudflare account
- Wrangler logged in: `npx wrangler login`

## One-time project create

```bash
pnpm install
pnpm run build
npx wrangler pages project create cardctrl
```

## Deploy (production)

```bash
pnpm run deploy
```

This runs `build` then:

```bash
wrangler pages deploy dist --project-name=cardctrl
```

Live URL will look like: `https://cardctrl.pages.dev`

## Preview deploy

```bash
pnpm run deploy:preview
```

## Local preview of the Pages output

```bash
pnpm run build
pnpm run pages:dev
```

## Cloudflare dashboard (Git-connected, optional)

| Setting | Value |
|--------|--------|
| Framework preset | Vite / None |
| Build command | `pnpm run build` |
| Build output directory | `dist` |
| Root directory | `/` (repo root) |
| Node version | 20+ |

**Do not set `NODE_ENV` as a CF build env var** (same rule as currentseas — it can strip devDependencies during install).

## What gets deployed

| File / dir | Purpose |
|------------|---------|
| `dist/` | Vite build output |
| `dist/_redirects` | SPA rewrite `/* → /index.html 200` |
| `dist/_headers` | Security + cache headers |

No Pages Functions, D1, or KV — everything runs in the browser.

## NFC note

Web NFC only works on **Chrome for Android** with NFC enabled, over **HTTPS** (Pages provides that). Desktop and iOS will show “No NFC” but still allow drafting payloads and using history.

## Custom domain

Cloudflare Dashboard → Workers & Pages → **cardctrl** → Custom domains → add e.g. `card.yourdomain.com`.
