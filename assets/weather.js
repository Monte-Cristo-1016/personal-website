/* ============================================================
 * 天气小条 · 前端
 * 数据来路有两条，形状一样：{ ok, city, data: { desc, temp, feels, hum, wind, lo, hi, pop, at } }
 *   ① 服务端同一个函数：GET ?wx=1 —— 城市/坐标由函数里的 Secrets 决定，优先走这条；
 *      最多等 3.5s，超时/404/断网都算没通（本机到 *.supabase.co 偶尔很慢，不让页面干等）
 *   ② 直连 Open-Meteo 兜底 —— 函数还没部署 / 临时挂了也能显示（下面 CITY/LAT/LON）
 *      函数没通会在这次会话里记 10 分钟，这期间先走 ②，不用每次都等 ①
 * 两条路都拿不到（离线、被墙、接口变了）就保持隐藏，不留空框、不报错。
 *
 * 页面要做的只有两件事：
 *   1) 放一个空的容器：<div class="wx" id="vn-wx" hidden></div>
 *   2) 引这个脚本（defer）：<script src="assets/weather.js" defer></script>
 * 文案与小条样式都在页面 CSS 里，脚本只负责填字。
 *
 * 换了城市要改两处：函数里的 Secrets（WEATHER_CITY / WEATHER_LAT / WEATHER_LON）+ 下面的
 * CITY / LAT / LON（兜底用；两边不一致时，函数部署了就以函数为准）。
 *
 * 想看效果但不想等接口：控制台跑
 *   sessionStorage.setItem("vn_wx", JSON.stringify({ at: Date.now(), city: "深圳",
 *     d: { desc:"晴", temp:23, feels:25, hum:84, wind:8, lo:20, hi:28, pop:0, at:"2026-10-07 23:15" } }))
 * 然后刷新。
 * ============================================================ */
(function () {
  "use strict";

  /* 后端入口统一在 assets/backend.js（直连 / 中转 / 故障转移都在那儿）。
     下面留一份兜底，万一某页忘了引 backend.js，直连仍然照旧可用。 */
  var VNB = window.VNB || {
    KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpoa2xtbnh0ZHpoa291d2Z5Z2hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzNDQxODEsImV4cCI6MjEwNjkyMDE4MX0.9Iryd1HWZrPr8OkWclPpipi-PYlWzj9ORCInRSvjh20",
    headers: function (json) {
      var h = { apikey: this.KEY, Authorization: "Bearer " + this.KEY };
      if (json) h["Content-Type"] = "application/json";
      return h;
    },
    fetch: function (path, opts) {
      return fetch("https://zhklmnxtdzhkouwfyghr.supabase.co" + path, opts);
    }
  };
  var EP = "/functions/v1/vn_clone";
  var HDR = VNB.headers(false);

  var KEY = "vn_wx";          /* sessionStorage：同一标签页不重复打接口 */
  var TTL = 10 * 60 * 1000;   /* 与服务端缓存对齐（10 分钟） */
  var NFF = "vn_wx_fn_fail";  /* 「函数刚没通」的记性：一段时间内先走兜底，别每次干等超时 */
  var NFF_MS = 10 * 60 * 1000;
  var FN_WAIT = 3500;         /* 函数最多等 3.5s（本机到 *.supabase.co 偶尔很慢） */

  /* 兜底那条路用的城市与坐标，默认跟函数里一致：深圳 */
  var CITY = "深圳";
  var LAT = "22.5431";
  var LON = "114.0579";
  /* Open-Meteo 免 key；带 Origin 时会回 access-control-allow-origin:*，浏览器可直连 */
  var OM = "https://api.open-meteo.com/v1/forecast" +
    "?latitude=" + LAT + "&longitude=" + LON +
    "&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    "&timezone=Asia%2FShanghai&forecast_days=1";

  /* WMO 天气代码 → 中文说法（与函数里那张表保持同一套说法） */
  var WMO = {
    0: "晴", 1: "大致晴朗", 2: "多云", 3: "阴",
    45: "有雾", 48: "冻雾",
    51: "小毛毛雨", 53: "毛毛雨", 55: "大毛毛雨", 56: "冻毛毛雨", 57: "强冻毛毛雨",
    61: "小雨", 63: "中雨", 65: "大雨", 66: "冻雨", 67: "强冻雨",
    71: "小雪", 73: "中雪", 75: "大雪", 77: "雪粒",
    80: "阵雨", 81: "强阵雨", 82: "暴阵雨", 85: "小阵雪", 86: "大阵雪",
    95: "雷阵雨", 96: "雷阵雨伴小冰雹", 99: "雷阵雨伴冰雹"
  };

  var box = document.getElementById("vn-wx");
  if (!box) return;

  function txt(node, s) { node.textContent = s == null ? "" : String(s); }

  function render(city, d) {
    var line = box.querySelector(".wx-line");
    var sub = box.querySelector(".wx-sub");
    if (!line || !sub) return;
    var cityEl = line.querySelector(".wx-city");
    var nowEl = line.querySelector(".wx-now");
    var t = d.temp == null ? "" : " " + d.temp + "°";
    txt(cityEl, city || "这里");
    txt(nowEl, (d.desc || "") + t);

    var bits = [];
    if (d.feels != null) bits.push("体感 " + d.feels + "°");
    if (d.hum != null) bits.push("湿度 " + d.hum + "%");
    if (d.wind != null) bits.push("风 " + d.wind + "km/h");
    if (d.lo != null && d.hi != null) bits.push("今天 " + d.lo + "~" + d.hi + "°");
    if (d.pop != null && d.pop > 0) bits.push("降水 " + d.pop + "%");
    if (d.at) bits.push(String(d.at).slice(11, 16) + " 更新");
    txt(sub, bits.join(" · "));

    box.hidden = false;
    box.setAttribute("data-wx", "on");
  }

  function cached() {
    try {
      var r = JSON.parse(sessionStorage.getItem(KEY) || "null");
      if (r && r.d && Date.now() - r.at < TTL) return r;
    } catch (e) { /* 隐私模式下 sessionStorage 可能不可用 */ }
    return null;
  }

  function save(city, d) {
    try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), city: city, d: d })); } catch (e) {}
    render(city, d);
  }

  function fnDown() {
    try {
      var at = Number(sessionStorage.getItem(NFF) || 0);
      if (!at) return false;
      if (Date.now() - at < NFF_MS) return true;
      sessionStorage.removeItem(NFF);
    } catch (e) { /* 隐私模式：当作没记住 */ }
    return false;
  }

  function markFn(down) {
    try {
      if (down) sessionStorage.setItem(NFF, String(Date.now()));
      else sessionStorage.removeItem(NFF);
    } catch (e) {}
  }

  /* ① 问自家函数（它内部带 10 分钟缓存，还能被 Secrets 换城市）——最多等 FN_WAIT */
  function fromFunction() {
    var ctl = window.AbortController ? new window.AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, FN_WAIT) : null;
    return VNB.fetch(EP + "?wx=1", { headers: HDR, signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })          /* 超时 / 断网 / 404 都当没通 */
      .then(function (j) { if (timer) clearTimeout(timer); return j; });
  }

  /* ② 函数没部署 / 没查到时的兜底：直连 Open-Meteo */
  function direct() {
    return fetch(OM)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var cur = j && j.current, day = j && j.daily;
        if (!cur || typeof cur.temperature_2m !== "number") return null;
        var n = function (v) { return typeof v === "number" && isFinite(v) ? Math.round(v) : null; };
        var pick = function (a) { return Array.isArray(a) ? a[0] : null; };
        var d = {
          desc: WMO[cur.weather_code] || "说不太清",
          temp: n(cur.temperature_2m),
          feels: n(cur.apparent_temperature),
          hum: n(cur.relative_humidity_2m),
          wind: n(cur.wind_speed_10m),
          lo: n(pick(day && day.temperature_2m_min)),
          hi: n(pick(day && day.temperature_2m_max)),
          pop: n(pick(day && day.precipitation_probability_max)),
          at: String(cur.time || "").replace("T", " ").slice(0, 16)   /* 已是北京时间 */
        };
        return { ok: true, city: CITY, data: d };
      })
      .catch(function () { return null; });
  }

  var c = cached();
  if (c) { render(c.city, c.d); return; }

  if (!window.fetch) return;

  function fallback() {
    return direct().then(function (d) {
      if (d && d.ok && d.data) save(d.city, d.data);
    });
  }

  if (fnDown()) {           /* 刚试过函数、没通：这十分钟直接走兜底，页面不等 */
    markFn(true);
    fallback();
    return;
  }

  fromFunction().then(function (j) {
    if (j && j.ok && j.data) { markFn(false); save(j.city, j.data); return; }
    markFn(true);
    return fallback();
  });
  /* 全程不抛：天气是装饰，坏了不打扰访客 */
})();
