/* ============================================================
 * vn-relay · Cloudflare Worker 版（透明反向代理）
 * ------------------------------------------------------------
 * 干什么：把 https://<你的域名>/<任意路径> 原样转发到 Supabase，
 *        连路径、查询串、请求头、请求体、状态码一起透传。
 * 于是前端只要把 assets/backend.js 里的 RELAY 填成这个域名，
 *        其它代码一行都不用改（脚本本来就是按路径拼的）。
 *
 * 为什么需要它：国内网络到 *.supabase.co 常是「DNS 能解析、TCP 连不上」
 *        （那个域名解析到 Cloudflare 的任播 IP）。中转的意思是——
 *        访客只跟你的域名打交道，剩下那一跳由服务器自己完成。
 *
 * ★ 使用前请先读同目录 README.md 的「先测再上」：
 *   Cloudflare 的网段在国内本来就不稳（*.workers.dev 基本不可达），
 *   所以 Worker 这条路只在「你的自定义域名恰好可达」时才成立。
 *   如果实测不通，请改用 Caddyfile / nginx.conf 那套（香港 VPS）。
 * ============================================================ */

const ORIGIN = "https://zhklmnxtdzhkouwfyghr.supabase.co";

/* 允许的来源：留 "*" 最省事（端点本来就只认 anon key / 你自己的令牌）。
   想收紧就写成 ["https://你的用户名.github.io"]。 */
const ALLOW_ORIGIN = "*";

export default {
  async fetch(req) {
    const url = new URL(req.url);

    /* 浏览器预检直接本地回掉，省一次到源站的往返 */
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": ALLOW_ORIGIN,
          "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
          "access-control-allow-headers": "apikey,authorization,content-type,prefer,x-client-info",
          "access-control-max-age": "86400"
        }
      });
    }

    const headers = new Headers(req.headers);
    headers.delete("host");          /* Host 由 fetch 按目标地址自己设 */
    headers.delete("cf-connecting-ip");

    const init = { method: req.method, headers, redirect: "manual" };
    if (req.method !== "GET" && req.method !== "HEAD") init.body = req.body;

    let r;
    try {
      r = await fetch(ORIGIN + url.pathname + url.search, init);
    } catch (e) {
      return new Response(JSON.stringify({ error: "relay 连不上源站：" + (e && e.message || e) }), {
        status: 502,
        headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": ALLOW_ORIGIN }
      });
    }

    const out = new Headers(r.headers);
    out.set("access-control-allow-origin", ALLOW_ORIGIN);
    /* 分身是流式返回的，别让中间层攒着 —— 原样把流交给浏览器 */
    out.delete("content-length");
    out.delete("content-encoding");
    return new Response(r.body, { status: r.status, statusText: r.statusText, headers: out });
  }
};
