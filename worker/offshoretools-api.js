/* Offshore Tools API — Cloudflare Worker.
 *
 * Holds the list of tools (name, link, description) and a screenshot for
 * each, and hands them out only to someone with a key. The landing page is
 * public on GitHub Pages and carries no links of its own; everything it
 * shows comes from here.
 *
 * Two keys, both sent in the X-API-Key header:
 *   view key   — read the list and the screenshots. Give this to the crew.
 *   admin key  — everything the view key can, plus add, edit and remove.
 * The header rather than the query string keeps keys out of Cloudflare's
 * request logs and out of browser history.
 *
 * Bindings this expects:
 *   TOOLS      KV namespace (from wrangler.toml)
 *   VIEW_KEY   secret, set in the dashboard
 *   ADMIN_KEY  secret, set in the dashboard
 *
 * As in Ship ETA, every write names one tool and the worker merges it into
 * the stored list. There is no endpoint that replaces the whole list, so a
 * tab left open for a week cannot revert anyone's changes.
 */

const STORE = "tools:v1";
const IMG = "img:";               // + tool id → screenshot bytes
const MAX_TOOLS = 50;
const MAX_IMAGE = 1024 * 1024;    // the page shrinks screenshots to ~50 KB; this is a backstop
const IMAGE_TYPES = ["image/webp", "image/jpeg", "image/png"];

/* Keys prefer runtime secrets and fall back to values in KV under auth:view
   and auth:admin. Ship ETA once lost the ability to set secrets after an
   accidental static-assets deploy; the fallback is the way back in if that
   ever happens here. It costs a KV read only when a secret is missing. */
async function keys(env) {
  return {
    view: env.VIEW_KEY || await env.TOOLS.get("auth:view"),
    admin: env.ADMIN_KEY || await env.TOOLS.get("auth:admin")
  };
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
  "Access-Control-Max-Age": "86400"
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS }
  });

/* Constant time, so the response can't be timed to guess a key a character
   at a time. */
function sameKey(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function load(env) {
  const raw = await env.TOOLS.get(STORE);
  if (!raw) return { tools: [], updated: 0 };
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v.tools) ? v : { tools: [], updated: 0 };
  } catch (_) {
    return { tools: [], updated: 0 };
  }
}

async function save(env, tools) {
  tools.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const out = { tools, updated: Date.now() };
  await env.TOOLS.put(STORE, JSON.stringify(out));
  return out;
}

const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/* Only http(s). The link becomes an href on everyone's page, and a
   javascript: URL there would run in whoever clicked it. */
function cleanUrl(v) {
  try {
    const u = new URL(String(v || "").trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch (_) {
    return null;
  }
}

/* "data:image/webp;base64,...." → { type, bytes } */
function decodeImage(dataUrl) {
  const m = /^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m || !IMAGE_TYPES.includes(m[1])) return null;
  const bin = atob(m[2]);
  if (bin.length > MAX_IMAGE) return null;
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { type: m[1], bytes };
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    const path = new URL(req.url).pathname.replace(/\/+$/, "");

    /* Plain text and before the key check, so a phone can tell a broken
       deploy from a working one. Says what is wired up, never what a key is. */
    if (path === "/health") {
      const kv = !!env.TOOLS;
      const k = kv ? await keys(env) : {};
      let held = "?";
      if (kv) {
        try { held = String((await load(env)).tools.length); } catch (_) { held = "unreadable"; }
      }
      return new Response(
        "offshoretools-api is running\n" +
        "KV bound:    " + (kv ? "yes" : "NO - bind the namespace as TOOLS") + "\n" +
        "view key:    " + (k.view ? "set" : "NOT SET - add the VIEW_KEY secret") + "\n" +
        "admin key:   " + (k.admin ? "set" : "NOT SET - add the ADMIN_KEY secret") + "\n" +
        "tools held:  " + held + "\n",
        { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...CORS } });
    }

    /* An unset key must fail shut. Treating "no key configured" as "no key
       required" is how a private list quietly becomes a public one. */
    if (!env.TOOLS) return json({ error: "no KV namespace bound as TOOLS" }, 503);
    const k = await keys(env);
    if (!k.view || !k.admin) return json({ error: "keys not configured on the worker" }, 503);

    const given = req.headers.get("X-API-Key") || "";
    const role = sameKey(given, k.admin) ? "admin" : sameKey(given, k.view) ? "view" : null;
    if (!role) return json({ error: "bad or missing key" }, 401);

    if (path === "/tools" && req.method === "GET") return json({ ...(await load(env)), role });

    if (path.startsWith("/img/") && req.method === "GET") {
      const id = decodeURIComponent(path.slice(5));
      const got = await env.TOOLS.getWithMetadata(IMG + id, "arrayBuffer");
      if (!got.value) return json({ error: "no image" }, 404);
      return new Response(got.value, {
        headers: { "Content-Type": (got.metadata && got.metadata.type) || "image/webp",
                   "Cache-Control": "no-store", ...CORS }
      });
    }

    const id = path.startsWith("/tools/") ? decodeURIComponent(path.slice(7)) : null;
    if (id !== null && (req.method === "PUT" || req.method === "DELETE")) {
      if (role !== "admin") return json({ error: "the admin key is needed to change tools" }, 403);
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) return json({ error: "bad tool id" }, 400);

      const cur = await load(env);
      const at = cur.tools.findIndex(t => t && t.id === id);

      if (req.method === "DELETE") {
        await env.TOOLS.delete(IMG + id);
        if (at < 0) return json({ ...cur, role });      // already gone; not an error
        cur.tools.splice(at, 1);
        return json({ ...(await save(env, cur.tools)), role });
      }

      let body;
      try { body = await req.json(); } catch (_) { return json({ error: "bad json" }, 400); }
      if (!body || typeof body !== "object") return json({ error: "expected a tool" }, 400);

      const name = text(body.name, 60);
      const url = cleanUrl(body.url);
      if (!name) return json({ error: "a name is needed" }, 400);
      if (!url) return json({ error: "the link must start with https:// or http://" }, 400);
      if (at < 0 && cur.tools.length >= MAX_TOOLS) return json({ error: "too many tools" }, 413);

      const prev = at >= 0 ? cur.tools[at] : {};
      const tool = {
        id, name, url,
        description: text(body.description, 200),
        icon: text(body.icon, 8),
        imgAt: prev.imgAt || 0
      };

      // image: a data URL replaces the screenshot, null removes it,
      // and leaving it out keeps whatever is there.
      if (body.image === null) {
        await env.TOOLS.delete(IMG + id);
        tool.imgAt = 0;
      } else if (body.image !== undefined) {
        const img = decodeImage(body.image);
        if (!img) return json({ error: "the screenshot must be a WebP, JPEG or PNG under 1 MB" }, 400);
        await env.TOOLS.put(IMG + id, img.bytes, { metadata: { type: img.type } });
        tool.imgAt = Date.now();
      }

      if (at >= 0) cur.tools[at] = tool;
      else cur.tools.push(tool);
      return json({ ...(await save(env, cur.tools)), role });
    }

    return json({ error: "not found" }, 404);
  }
};
