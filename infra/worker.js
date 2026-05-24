const ALLOWED_ORIGINS = [
  "https://calvin99tw.github.io",
  "http://localhost",
  "http://127.0.0.1",
];

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request) {
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

      const res = await fetch(targetUrl, {
        headers: { "User-Agent": "Mozilla/5.0" }
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
