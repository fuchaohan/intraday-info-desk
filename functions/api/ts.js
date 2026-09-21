// Tushare 日频板块资金流备用源：/api/ts?api=moneyflow_ind_dc
// token 从平台环境变量 TUSHARE_TOKEN 读取（EdgeOne 控制台-函数环境变量 / Cloudflare Pages-Dashboard 环境变量配置），
// 绝不写入仓库、绝不下发浏览器；浏览器无 CORS 且无 token，tushare 只能经本函数访问。
// Cloudflare Pages Functions 与 EdgeOne Pages Functions 均按 onRequestGet + 文件路由约定加载本文件。
const TUSHARE_API = "https://api.tushare.pro";
const UPSTREAM_TIMEOUT_MS = 15000;
/* 白名单：仅板块资金流接口（东财口径，content_type 区分 行业/概念/地域） */
const ALLOWED = new Set(["moneyflow_ind_dc"]);

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
  const api = url.searchParams.get("api") || "";
  if (!ALLOWED.has(api)) {
    return json({ error: "bad api" }, 400);
  }
  const env = context.env || {};
  const token = env.TUSHARE_TOKEN || env.TUSHARE_KEY || "";
  if (!token) {
    return json({ error: "TUSHARE_TOKEN not configured (set platform env var)" }, 500);
  }
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const r = await fetch(TUSHARE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_name: api, token, params: {}, fields: "" }),
      signal: ctl.signal,
    });
    const text = await r.text();
    // 原样透传 tushare JSON（code!=0 的业务错误也让客户端按 msg 处理）
    return new Response(text, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return json({ error: "upstream failed" }, 502);
  } finally {
    clearTimeout(tm);
  }
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
