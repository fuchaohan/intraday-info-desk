// 同源代理（query 参数式）：/api/em?path=/api/qt/<东财路径+query> → 服务端转发 push2delay/push2/push2his。
// 服务端请求不受浏览器 CORS/MIME 检查限制，出口为边缘节点 IP，绕开东财对访客侧的风控与格式改动。
// 采用 ?path= 而非子路径转发：EdgeOne / Cloudflare Pages 的函数路由均为精确匹配，/api/em 一条路由即可命中。
// Cloudflare Pages Functions 与 EdgeOne Pages Functions 均按 onRequestGet + 文件路由约定加载本文件。
const UPSTREAMS = [
  "https://push2delay.eastmoney.com",
  "https://push2.eastmoney.com",
  "https://push2his.eastmoney.com",
];
const UPSTREAM_TIMEOUT_MS = 12000;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const p = url.searchParams.get("path") || "";
  // 白名单：只代理东财行情接口；拒绝内嵌路径穿越
  if (!/^\/api\/qt\/[\w./-]+(\?.*)?$/.test(p) || p.includes("..")) {
    return json({ error: "bad path" }, 400);
  }
  for (const base of UPSTREAMS) {
    const ctl = new AbortController();
    const tm = setTimeout(() => ctl.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const r = await fetch(base + p, {
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
  return json({ error: "upstream failed" }, 502);
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
