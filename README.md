# CardCtrl

Mobile-first **NFC card writer** with local quick-access history. Tap, write, done.

Built with React + Vite + Tailwind. Fully client-side (Web NFC API + `localStorage`) — no backend required.

## Features

- Write URL or text NDEF records to NFC tags
- Scan tags into the editor for rewrite
- Local history for one-tap reuse
- Generate short codes (`https://red.viim.dev/…`)
- Mobile UX: sticky action bar, haptics, tones, safe-area padding

> **NFC note:** Web NFC works on **Chrome for Android** with NFC enabled (HTTPS). Other browsers show “No NFC” but still support drafting + history.

## Develop

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
```

Output: `dist/` (static SPA ready for Cloudflare Pages).

## Deploy to Cloudflare Pages

Same pattern as currentseas: build → `dist` → Pages deploy.

```bash
# login once
npx wrangler login

# create project once
npx wrangler pages project create cardctrl

# deploy
pnpm run deploy
```

| Setting | Value |
|--------|--------|
| Build command | `pnpm run build` |
| Output directory | `dist` |
| Project name | `cardctrl` |

Preview: `pnpm run deploy:preview`  
Local Pages sim: `pnpm run build && pnpm run pages:dev`

Full notes: [`output/deploy-cloudflare.md`](./output/deploy-cloudflare.md)

## Stack

- React 19 + Vite 7 + Tailwind CSS 4
- Wrangler for Cloudflare Pages deploy
- No server, D1, or KV — history stays on device
