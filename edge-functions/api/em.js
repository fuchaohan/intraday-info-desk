// 同源代理：/api/em/<东财路径>?<query> → 服务端转发 push2delay/push2/push2his。
// 服务端请求不受浏览器 CORS/MIME 检查限制，出口为边缘节点 IP，绕开东财对访客侧的风控与格式改动。
// Cloudflare Pages Functions 与 EdgeOne Pages Functions 均按 onRequestGet + 文件路由约定加载本文件。
const UPSTREAMS = [
  "https://push2delay.eastmoney.com",
  "https://push2.eastmoney.com",
  "https://push2his.eastmoney.com",
];
const UPSTREAM_TIMEOUT_MS = 12000;

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const path = url.pathname.replace(/^\/api\/em/, "") || "/";
  for (const base of UPSTREAMS) {
    const ctl = new AbortController();
    const tm = setTimeout(() => ctl.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const r = await fetch(base + path + url.search, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": "https://quote.eastmoney.com/",
          "Accept": "application/json,text/plain,*/*",
        },
        signal: ctl.signal,
      });
      if (!r.ok) continue;
      const text = await r.text();
      // 粗校验是 JSON（纯 JSON 或 JSONP 包装体均可），避免把风控拦截页原样透传
      const trimmed = text.replace(/^\s+/, "");
      if (!trimmed.startsWith("{") && !/^[A-Za-z_$][\w$]*\s*\(/.test(trimmed)) continue;
      return new Response(text, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (e) {
      // 换下一个上游
    } finally {
      clearTimeout(tm);
    }
  }
  return new Response(JSON.stringify({ error: "upstream failed" }), {
    status: 502,
    headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" },
  });
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
