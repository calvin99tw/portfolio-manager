// Cloudflare Worker — API proxy + 看板推播（dashboard.json 契約 v1 階段③）
//
// 路由（fetch，Origin 白名單保護）：
//   /taifex/* /cbc/* /yahoo/* /rwd/* /*  → 既有 upstream proxy（T5/T6/T11）
//   POST /push/test                      → 對 body 內的 subscription 發測試通知（管線驗證用）
//   GET  /push/scan?market=TW|US         → 手動觸發一次掃描（測試/補掃用）
//
// 排程（scheduled，T13）：
//   30 6 * * 1-5  → 台股收盤掃描（14:30 台北）
//   0 21 * * 1-5  → 美股收盤掃描（05:00 台北，夏令收盤後 1hr）
//
// 環境（wrangler.toml [vars]）：SUPABASE_URL, VAPID_PUBLIC_KEY, VAPID_SUBJECT, PRICE_PUSH_ENABLED
// Secrets：SUPABASE_SERVICE_KEY（service_role，僅存於 Worker）, VAPID_PRIVATE_JWK
//
// Feature flag：PRICE_PUSH_ENABLED="false" 時只發催化劑推播（契約附錄 D：
// 價格推播藏於 flag，雙軌比對驗證通過後改 "true" 重新部署）。

const ALLOWED_ORIGINS = [
  "https://calvin99tw.github.io",
  "http://localhost",
  "http://127.0.0.1",
];

const TW_CRON = "30 6 * * 1-5";
const US_CRON = "0 21 * * 1-5";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// ══════════════ 小工具 ══════════════

const te = new TextEncoder();

function b64uToBytes(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function bytesToB64u(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concatBytes(...arrs) {
  const len = arrs.reduce((a, x) => a + x.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

function todayInTZ(tz) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date()); // en-CA → YYYY-MM-DD
}

// ══════════════ Supabase REST（service_role，僅 Worker 端） ══════════════

async function sbGet(env, path) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase GET ${path} → ${res.status}`);
  return res.json();
}

async function sbDelete(env, path) {
  await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method: "DELETE",
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
  });
}

// ══════════════ Web Push：VAPID (RFC 8292) + aes128gcm (RFC 8291) ══════════════

async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, len * 8));
}

async function vapidJWT(aud, env) {
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = bytesToB64u(te.encode('{"typ":"JWT","alg":"ES256"}'));
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const payload = bytesToB64u(te.encode(JSON.stringify({ aud, exp, sub: env.VAPID_SUBJECT })));
  const sig = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, te.encode(`${header}.${payload}`)));
  return `${header}.${payload}.${bytesToB64u(sig)}`; // WebCrypto ECDSA 輸出即 r||s，符合 JWS
}

async function encryptPayload(p256dhB64u, authB64u, payloadStr) {
  const uaPub = b64uToBytes(p256dhB64u);      // 65 bytes 未壓縮點
  const authSecret = b64uToBytes(authB64u);   // 16 bytes
  const asKp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", asKp.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asKp.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, concatBytes(te.encode("WebPush: info\0"), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plaintext = concatBytes(te.encode(payloadStr), new Uint8Array([2])); // 0x02 = 最後一筆 record 分隔符
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext));
  const rs = new Uint8Array(4); new DataView(rs.buffer).setUint32(0, 4096);
  const header = concatBytes(salt, rs, new Uint8Array([asPub.length]), asPub);
  return concatBytes(header, ct);
}

// 回傳 HTTP status；404/410 表示訂閱已失效，呼叫端應刪除
async function sendWebPush(sub, payloadStr, env) {
  const aud = new URL(sub.endpoint).origin;
  const jwt = await vapidJWT(aud, env);
  const body = await encryptPayload(sub.p256dh, sub.auth, payloadStr);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      TTL: "86400",
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
    },
    body,
  });
  return res.status;
}

// ══════════════ 收盤掃描（契約第 3 節） ══════════════

async function yahooEOD(symbol) {
  // 台股後綴容錯：.TWO ↔ .TW 互換重試（同 App 端，對上游資料錯誤的最後防線）
  const candidates = [symbol];
  if (symbol.endsWith(".TWO")) candidates.push(symbol.slice(0, -1));
  else if (symbol.endsWith(".TW")) candidates.push(symbol + "O");
  for (const c of candidates) {
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(c)}?interval=1d&range=1d`,
        { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) continue;
      const data = await res.json();
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (typeof price === "number" && price > 0) return price;
    } catch (e) { /* 試下一個 */ }
  }
  return null;
}

const KIND_LABEL = { entry: "進場", add: "加碼", trim: "鎖利", stop: "停損", review: "檢視" };

async function runScan(market, env) {
  const dashboards = await sbGet(env, "dashboard?select=user_id,payload");
  if (!Array.isArray(dashboards) || dashboards.length === 0) return { users: 0, sent: 0 };
  const subs = await sbGet(env, "push_subscriptions?select=id,user_id,endpoint,p256dh,auth");
  const priceOn = env.PRICE_PUSH_ENABLED === "true";
  const tz = market === "US" ? "America/New_York" : "Asia/Taipei";
  const today = todayInTZ(tz);
  let sent = 0;

  for (const row of dashboards) {
    const userSubs = (subs || []).filter((s) => s.user_id === row.user_id);
    if (userSubs.length === 0) continue;
    const tickers = (row.payload?.tickers || []).filter((t) => t.market === market);
    if (tickers.length === 0) continue;
    const near = row.payload?.alertRule?.nearLinePct ?? 3.0;

    const prices = {};
    if (priceOn) {
      await Promise.all(tickers.map(async (t) => {
        const p = await yahooEOD(t.yahooSymbol);
        if (p) prices[t.ticker] = p;
      }));
    }

    const lines = [];
    for (const t of tickers) {
      for (const c of t.catalysts || []) {
        if (c.date === today) lines.push(`${t.ticker} ${t.name}｜今日 ${c.event}`);
      }
      if (priceOn && prices[t.ticker]) {
        const price = prices[t.ticker];
        for (const lv of t.levels || []) {
          const dist = ((lv.price - price) / price) * 100;
          const crossed = lv.direction === "below" ? price < lv.price : price > lv.price;
          const kind = KIND_LABEL[lv.kind] || lv.kind;
          if (crossed) lines.push(`${t.ticker} ${t.name}｜收盤 ${price} 觸發${kind} ${lv.price}，量能條件待確認`);
          else if (Math.abs(dist) <= near) lines.push(`${t.ticker} ${t.name}｜距${kind} ${lv.price} 僅 ${dist >= 0 ? "+" : ""}${dist.toFixed(1)}%`);
        }
      }
    }
    if (lines.length === 0) continue;

    // 一次 cron 對每使用者合併為一則通知（對應「10 行掃描表」語意，避免通知轟炸）
    const genDate = (row.payload?.generatedAt || "").slice(5, 10).replace("-", "/");
    const title = `看板掃描（${market === "TW" ? "台股" : "美股"} ${today.slice(5).replace("-", "/")}）`;
    const body = lines.slice(0, 10).join("\n")
      + (lines.length > 10 ? `\n…共 ${lines.length} 項` : "")
      + (genDate ? `\n（依 ${genDate} 看板）` : "");
    const payload = JSON.stringify({ title, body, tag: `scan-${market}-${today}` });

    for (const s of userSubs) {
      try {
        const status = await sendWebPush(s, payload, env);
        if (status === 404 || status === 410) await sbDelete(env, `push_subscriptions?id=eq.${s.id}`);
        else sent++;
      } catch (e) { /* 單一訂閱失敗不影響其他 */ }
    }
  }
  return { users: dashboards.length, sent };
}

// ══════════════ Handlers ══════════════

export default {
  async scheduled(event, env, ctx) {
    const market = event.cron === US_CRON ? "US" : "TW";
    ctx.waitUntil(runScan(market, env));
  },

  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = ALLOWED_ORIGINS.some(
      (o) => origin === o || origin.startsWith(o + ":")
    );

    if (!allowed) {
      return new Response("Forbidden", { status: 403 });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      const url = new URL(request.url);

      // ── 推播測試：對 body 的 subscription 發一則測試通知 ──
      if (url.pathname === "/push/test" && request.method === "POST") {
        const j = await request.json();
        if (!j?.endpoint || !j?.keys?.p256dh || !j?.keys?.auth) {
          return new Response(JSON.stringify({ error: "invalid subscription" }), {
            status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
        }
        const status = await sendWebPush(
          { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth },
          JSON.stringify({ title: "測試通知", body: "推播管線正常 ✓（投資組合看板）", tag: "push-test" }),
          env);
        return new Response(JSON.stringify({ pushServiceStatus: status }), {
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
      }

      // ── 手動掃描（測試/補掃）──
      if (url.pathname === "/push/scan") {
        const market = url.searchParams.get("market") === "US" ? "US" : "TW";
        const result = await runScan(market, env);
        return new Response(JSON.stringify({ market, ...result }), {
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
      }

      // ── 既有 upstream proxy ──
      let targetUrl;
      if (url.pathname.startsWith('/taifex/')) {
        const path = url.pathname.slice('/taifex'.length);
        targetUrl = "https://openapi.taifex.com.tw" + path + url.search;
      } else if (url.pathname.startsWith('/cbc/')) {
        const path = url.pathname.slice('/cbc'.length);
        targetUrl = "https://cpx.cbc.gov.tw" + path + url.search;
      } else if (url.pathname.startsWith('/yahoo/')) {
        const path = url.pathname.slice('/yahoo'.length);
        targetUrl = "https://query1.finance.yahoo.com" + path + url.search;
      } else if (url.pathname.startsWith('/rwd/')) {
        targetUrl = "https://www.twse.com.tw" + url.pathname + url.search;
      } else {
        targetUrl = "https://openapi.twse.com.tw" + url.pathname + url.search;
      }

      const isCbc = url.pathname.startsWith('/cbc/');
      const res = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          ...(isCbc ? { "Accept": "application/json" } : {}),
        }
      });
      const body = await res.text();
      return new Response(body, {
        headers: {
          "Content-Type": res.headers.get("content-type") || "application/json",
          ...corsHeaders(origin)
        }
      });
    } catch(e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) }
      });
    }
  }
};
