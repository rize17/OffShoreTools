# Offshore Tools

One page with a big card for each of the offshore tools (Ship ETA, calendars,
timers and so on). Tap a card to open that tool. The tools themselves stay
separate apps in their own repos.

The page is public, but it shows nothing until a key is entered. The key is
typed once per device and remembered: there's no login and no timeout.

- **Viewing key**: shows the cards. Give this to the crew.
- **Admin key**: adds an *Edit mode* switch to ⚙️ Settings (off every time
  the page opens). With it on, ✏️ shows on each card and a **＋ Add app** card, to add,
  edit and remove tools and their screenshots, and ◀ ▶ on each card to change
  the order. The order is the same for everyone.

⚙️ Settings changes the key or forgets it on that device.

**Beta apps.** When adding or editing an app, tick *Beta* for one that's
still being tried out. Beta apps only show for people who switch on *Show
beta apps* in ⚙️ Settings (remembered on that device), with a BETA tag on
the card. They're hidden, not locked: anyone with a key could switch it on.

## Files

```
index.html             the whole page - UI, storage and API calls
sw.js                  offline shell cache
manifest.webmanifest   home-screen install metadata
icon-192.png icon-512.png
worker/offshoretools-api.js   Cloudflare Worker holding the list (KV)
wrangler.toml worker/wrangler.toml   deploy config for the worker
```

No build step and no package manager.

## One-off Cloudflare setup

1. **KV namespace**: Cloudflare dashboard → Storage & Databases → Workers KV →
   *Create* → name it `offshoretools`. Copy its **ID** into *both*
   `wrangler.toml` and `worker/wrangler.toml` in place of
   `PASTE_KV_NAMESPACE_ID_HERE`, and push.
2. **Worker**: Workers & Pages → *Create* → *Import a repository* →
   `rize17/OffShoreTools`, root directory `/` (or `worker`). The name must be
   `offshoretools-api`, so that it is served at
   `https://offshoretools-api.ryantholliday.workers.dev` (the address
   `index.html` calls). A push then deploys it.
3. **Keys**: the worker → Settings → Variables and Secrets → add two
   **Secrets**: `VIEW_KEY` and `ADMIN_KEY`. Make them different. Never put
   them in the repo.
4. **Check**: open `https://offshoretools-api.ryantholliday.workers.dev/health`.
   It should say KV bound: yes, and both keys set.

**Shared with Ship ETA and the Flight Operations Calendar.** Both accept
these keys too, and pick up the key saved here on the same device, so a card
opens its app without a second key. Their workers hold copies as the secrets
`OFFSHORE_VIEW_KEY` and `OFFSHORE_ADMIN_KEY`: changing a key here means
changing it on those two workers as well (three places, same value).

Changing a key later is just editing the secret. Devices holding the old
key are sent back to the key screen on their next load.

## Deploying the page

Push to the branch GitHub Pages serves (Settings → Pages → *Deploy from a
branch*, root). `.nojekyll` keeps the files out of Jekyll.

Bump the version on every functional change, in all four places at once: the
`<title>`, the `.version` span, `CACHE` in `sw.js`, and *Current* below.

Current: **v1.11**.
