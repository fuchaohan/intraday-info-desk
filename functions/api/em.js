// 同源代理（query 参数式）：/api/em?path=<编码路径> → 服务端转发。
// 东财行情接口（/api/qt/*）→ push2delay/push2/push2his；新浪板块资金流快照（/q/view/newFLJK.php）→ vip.stock.finance.sina.com.cn。
// 服务端请求不受浏览器 CORS/MIME 检查限制，出口为边缘节点 IP，绕开东财对访客侧的风控与格式改动。
// 采用 ?path= 而非子路径转发：EdgeOne / Cloudflare Pages 的函数路由均为精确匹配，/api/em 一条路由即可命中。
// Cloudflare Pages Functions 与 EdgeOne Pages Functions 均按 onRequestGet + 文件路由约定加载本文件。
const UPSTREAMS_EAST = [
  "https://push2delay.eastmoney.com",
  "https://push2.eastmoney.com",
  "https://push2his.eastmoney.com",
];
const UPSTREAMS_SINA = ["https://vip.stock.finance.sina.com.cn"];
const UPSTREAM_TIMEOUT_MS = 12000;

/* 按路径前缀选上游：东财行情接口 / 新浪板块资金流快照（GBK 编码，边缘侧转 UTF-8） */
const ROUTES = [
  { re: /^\/api\/qt\/[\w./-]+(\?.*)?$/, upstreams: UPSTREAMS_EAST,
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Referer": "https://quote.eastmoney.com/", "Accept": "application/json,text/plain,*/*" } },
  { re: /^\/q\/view\/newFLJK\.php(\?.*)?$/, upstreams: UPSTREAMS_SINA, gbk: true,
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Referer": "https://finance.sina.com.cn/" } },
];

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
  const route = ROUTES.find(r => r.re.test(p));
  // 白名单：仅东财行情与新浪板块资金流快照；拒绝内嵌路径穿越
  if (!route || p.includes("..")) {
    return json({ error: "bad path" }, 400);
  }
  for (const base of route.upstreams) {
    const ctl = new AbortController();
    const tm = setTimeout(() => ctl.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const r = await fetch(base + p, { headers: route.headers, signal: ctl.signal });
      if (!r.ok) continue;
      let text;
      if (route.gbk) {
        text = new TextDecoder("gbk").decode(await r.arrayBuffer());
      } else {
        text = await r.text();
      }
      // 粗校验是 JSON/JS 变量体（纯 JSON、JSONP 包装体或 var 声明均可），避免把风控拦截页原样透传
      const trimmed = text.replace(/^\s+/, "");
      if (!trimmed.startsWith("{") && !trimmed.startsWith("var ") && !/^[A-Za-z_$][\w$]*\s*\(/.test(trimmed)) continue;
      return new Response(text, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
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
