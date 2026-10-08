/* ============================================================
 * 后端入口 · 唯一事实来源（anon key / 直连地址 / 中转地址 / 故障转移）
 * ------------------------------------------------------------
 * 背景（2026-10 用户反馈「很多苹果手机的用户登不上去，显示 Supabase 无法连接」）：
 *   页面本身由 GitHub Pages 提供、一直能打开；死的只有对 `*.supabase.co` 的请求。
 *   该域名当前解析到 Cloudflare 任播 IP（172.64.149.246 / 104.18.38.10），
 *   国内移动网络对这些 IP 常是「TCP 连不上」，而手机上多半不挂代理 —— 于是最先倒下。
 *   这是网络层的封锁，前端代码无法绕过，只能换一个「国内可达的入口」。
 *
 * 这个文件把「入口」收敛到一处：
 *   · KEY     公开的 anon key（本来就在前端，集中放这里，改一处即可）
 *   · DIRECT  直连 Supabase（默认，行为与以前完全一致）
 *   · RELAY   ★中转地址：留空 = 只走直连；填了就「优先中转、失败回落直连」
 *
 * 部署中转（见 docs/relay.md，Cloudflare Worker 或 VPS 反向代理都行）之后，
 * 只改下面 RELAY 一行即可全站生效；页面里的其它脚本都不用动。
 *
 * 故障转移策略：按 [上次成功的入口 → RELAY → DIRECT] 依次尝试，
 *   单个入口最多等 ATTEMPT_MS，超时/网络错误就换下一个，成功即记住。
 *   失败都是「连接阶段」（TCP 都没建起来），所以重试不会造成重复写入。
 * ============================================================ */
(function () {
  "use strict";

  var KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpoa2xtbnh0ZHpoa291d2Z5Z2hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzNDQxODEsImV4cCI6MjEwNjkyMDE4MX0.9Iryd1HWZrPr8OkWclPpipi-PYlWzj9ORCInRSvjh20";

  var DIRECT = "https://zhklmnxtdzhkouwfyghr.supabase.co";

  /* ★ 中转地址：部署好后把地址填在这儿（不要带结尾斜杠）。
       例：var RELAY = "https://vn-api.your-domain.com";
       留空 = 只走直连（与部署前完全一样）。 */
  var RELAY = "";

  var LS = "vn_api_base";     /* sessionStorage：记住这次会话里通了哪个入口 */
  var ATTEMPT_MS = 6000;      /* 单个入口最多等 6s，超了就换下一个 */

  function remembered() {
    try { return sessionStorage.getItem(LS) || ""; } catch (e) { return ""; }
  }
  function remember(base) {
    try { sessionStorage.setItem(LS, base); } catch (e) {}
  }
  function forget() {
    try { sessionStorage.removeItem(LS); } catch (e) {}
  }

  /* 依次尝试的入口列表：上次成功的放最前，然后中转，最后直连 */
  function bases() {
    var out = [], seen = {};
    function push(b) { if (b && !seen[b]) { seen[b] = 1; out.push(b); } }
    push(remembered());
    push(RELAY);
    push(DIRECT);
    return out;
  }

  /* 同步取「当前首选入口」——给需要拼绝对地址的地方用（如 admin.html） */
  function base() {
    return remembered() || RELAY || DIRECT;
  }

  function headers(json) {
    var h = { apikey: KEY, Authorization: "Bearer " + KEY };
    if (json) h["Content-Type"] = "application/json";
    return h;
  }

  /* 带故障转移的 fetch：
       path  以 / 开头的路径，例 "/functions/v1/vn_clone"
       opts  与原生 fetch 相同（headers/signal/method/body...），会原样透传
     返回 Response（流式也能用）；全部入口都失败才 reject，报最后一个错。
     注意：调用方自己的 signal（AbortController）被中止时不再换入口。 */
  function vfetch(path, opts) {
    opts = opts || {};
    var list = bases(), idx = 0, lastErr = null;

    function attempt() {
      if (idx >= list.length) return Promise.reject(lastErr || new Error("no endpoint"));
      var b = list[idx++];
      var ctl = new AbortController();
      var ext = opts.signal;
      var onExt = function () { ctl.abort(); };
      var timer = setTimeout(function () { ctl.abort(); }, ATTEMPT_MS);

      var o = {}, k;
      for (k in opts) { if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k]; }
      o.signal = ctl.signal;

      if (ext) {
        if (ext.aborted) ctl.abort();
        else if (ext.addEventListener) ext.addEventListener("abort", onExt);
      }

      function cleanup() {
        clearTimeout(timer);
        if (ext && ext.removeEventListener) ext.removeEventListener("abort", onExt);
      }

      return fetch(b + path, o).then(function (r) {
        cleanup();
        remember(b);
        return r;
      }, function (err) {
        cleanup();
        lastErr = err;
        if (ext && ext.aborted) throw err;   /* 访客/页面主动取消 → 不重试 */
        return attempt();                    /* 超时 / 连不上 → 换下一个入口 */
      });
    }
    return attempt();
  }

  /* 探活：按入口顺序各打一枪，返回第一个通的入口（给「诊断」用，正常流程不需要） */
  function probe(ms) {
    var list = bases();
    return Promise.all(list.map(function (b) {
      var ctl = new AbortController();
      var t = setTimeout(function () { ctl.abort(); }, ms || 4000);
      return fetch(b + "/rest/v1/", { headers: headers(false), signal: ctl.signal })
        .then(function (r) { clearTimeout(t); return { base: b, status: r.status, ok: true }; },
              function (e) { clearTimeout(t); return { base: b, ok: false, error: String(e && e.message || e) }; });
    })).then(function (rows) {
      var good = rows.filter(function (r) { return r.ok; })[0];
      if (good) remember(good.base);
      return { results: rows, first: good ? good.base : "" };
    });
  }

  window.VNB = {
    KEY: KEY,
    DIRECT: DIRECT,
    relay: function () { return RELAY; },
    setRelay: function (u) { RELAY = u || ""; forget(); },
    base: base,
    bases: bases,
    headers: headers,
    fetch: vfetch,
    probe: probe,
    remember: remember,
    forget: forget
  };
})();
