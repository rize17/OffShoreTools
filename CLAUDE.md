# Offshore Tools

A landing page linking to the separate offshore tool apps (Ship ETA and the
rest). This repo holds only the landing page and its API worker; it shares no
code with the tools. See README.md for the Cloudflare setup.

## Layout

`index.html` is the whole page. `worker/offshoretools-api.js` is a Cloudflare
Worker with one KV namespace bound as `TOOLS`. The page is on GitHub Pages; the
worker is deployed separately by Workers Builds from the same repo.

## Conventions that matter

- **The page holds no links and no keys.** Every tool comes from the worker,
  and only with a key in the `X-API-Key` header. Don't add a hardcoded list or
  a fallback list to the page: the page is public and its source is readable.
- **Two keys, both dashboard secrets.** `VIEW_KEY` reads; `ADMIN_KEY` reads and
  writes. The worker fails shut (503) if either is unset. Never put either in
  `wrangler.toml`. KV `auth:view` / `auth:admin` are a fallback only, for the
  case Ship ETA hit where secrets couldn't be set on the worker.
- **The key is remembered, never expired.** It's in localStorage until the
  person chooses *Forget key* or the key stops working (401). Don't add
  timeouts or sessions: avoiding re-logging in is the reason this isn't a login.
- **Every write names one tool.** There is no endpoint that replaces the list.
- **Screenshots live in KV** under `img:<id>`, shrunk in the browser to 800px
  WebP/JPEG (~30-80 KB) before upload. `imgAt` on the tool is the upload time;
  the page caches each image in localStorage against it and refetches only
  when it changes. Images are fetched with the key, so they're never plain
  `<img src>` URLs.
- **Links must be http(s).** The worker rejects anything else, because the link
  becomes an `href` on everyone's page.
- **Works with no signal.** The last list and its screenshots are kept on the
  device and shown immediately, then refreshed in the background.
- **Bump the version on every functional change**, in all four places: the
  `<title>`, the `.version` span, `CACHE` in `sw.js`, and *Current* in README.
