/* ============================================================
 * VN AI 分身 · 前端
 * 只负责收发消息；人格与模型 key 全在服务端（supabase/functions/vn-clone）
 * 走流式纯文本：边收边显示，像真的在打字
 *
 * 两个页面会加载它：
 *   · chat.html    —— 叁「对话」：整页一个聊天窗，正常自动开场；
 *                     顶部还会画一排「同好话题」按钮，点一下就在这个窗口里聊那个方向。
 *   · friends.html —— 贰「同好」：点某个方向后展开的话题对话窗。
 *                     这一页的 script 标签写了 data-boot="manual"，
 *                     表示「先别自动开场」，由页面自己决定开哪个话题。
 * ============================================================ */
(function () {
  "use strict";

  var SCR = document.currentScript;   /* 只有 manual 模式才拦着不自动开场 */

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
  var EP = "/functions/v1/vn_clone";  /* 注意：Dashboard 里建的名字是下划线 vn_clone */
  var AUTH = VNB.headers(false);
  var JSON_H = VNB.headers(true);

  /* 连不上时的应急联系方式（与 contact.html 公开的一致，写死以免依赖页面结构） */
  var MAIL = "3484991466@qq.com";
  var WECHAT = "cyc20080310";

  /* 「复制我那句」按钮的样式（自包含，chat.html / friends.html 都通用） */
  (function () {
    var s = document.createElement("style");
    s.textContent =
      ".vn-msg .vn-copy{margin-top:.5em;display:block;padding:.34em .9em;font:inherit;font-size:12px;" +
      "letter-spacing:.14em;cursor:pointer;color:rgba(255,236,214,.95);background-color:rgba(12,20,44,.6);" +
      "border:1px solid rgba(246,214,170,.42);border-radius:999px;transition:color .24s,border-color .24s}" +
      ".vn-msg .vn-copy:hover{color:#fff;border-color:rgba(246,214,170,.8)}";
    if (document.head) document.head.appendChild(s);
  })();

  /* ---------- 同好话题：四个方向 ----------
     想改话题文案，只改这一块：
       label   按钮上显示的字
       mood    一进这个话题时的表情（calm/smile/happy/laugh/surprise/think/shy/serious/sad）
       opening 进来之后他先说的那一句（也就是聊天记录里的第一条）
       asks    三个快捷提问
       prime   偷偷塞给模型的「我们现在在聊什么」—— 访客看不到，也不写进记录
     （第一 / 三 / 四幕的正文台词不在这里，见各页 HTML 的 data-lines） */
  var TOPICS = {
    game: {
      label: "游戏", mood: "calm",
      opening: "我喜欢玩mc。入坑已经七年了，比较喜欢自己创造的成就感和沙盒的温馨吧。还有fgo、和平精英、型月的其他游戏也都玩过。有你喜欢的吗？",
      asks: ["你最近在捣鼓什么？", "平时都玩什么类型的游戏？", "那个小东西做到哪一步了？"],
      prime: "【话题背景】访客是从我主页的「同好 · 游戏」点进来的，想聊游戏、数码、自己动手做的东西。" +
             "接下来几轮请一直围着这条线聊，别跑去聊运动或别的。"
    },
    sport: {
      label: "运动", mood: "calm",
      opening: "运动吗……？我从五岁就开始踢球了。网球打得也还过得去，乒乓球也会打，就是没有踢球喜欢。不喜欢就动不起来吧？",
      asks: ["你平时做什么运动？", "运动的时候你会想什么？", "有没有一起运动的朋友？"],
      prime: "【话题背景】访客是从我主页的「同好 · 运动」点进来的，想聊运动、身体状态、和人一起动起来。" +
             "接下来几轮请一直围着这条线聊，别跑去聊别的。"
    },
    daily: {
      label: "日常", mood: "calm",
      opening: "日常？喜欢听歌看番，喝点咖啡自己一个人在耳机里消磨。当然我也不介意有一个关系好的人陪我，只是讲话会有点累。",
      asks: ["你一天大概怎么过？", "一个人待着的时候在做什么？", "喜欢什么歌？"],
      prime: "【话题背景】访客是从我主页的「同好 · 日常」点进来的，想聊平时的生活节奏、一个人待着的时候、小事和小确幸。" +
             "接下来几轮请一直围着这条线聊，别跑去聊别的。"
    },
    study: {
      label: "学习", mood: "think",
      opening: "呃……这个以前的我或许会滔滔不绝吧……但现在我会务实很多哦。",
      asks: ["你学的是什么方向？", "遇到卡住的时候怎么办？", "有什么一直在坚持的方法？"],
      prime: "【话题背景】访客是从我主页的「同好 · 学习」点进来的，想聊学习方法、踩过的坑、计算机这个专业。" +
             "接下来几轮请一直围着这条线聊，别跑去聊别的。"
    }
  };
  var TOPIC_ORDER = ["game", "sport", "daily", "study"];

  /* 函数没部署 / 网络不通时的兜底（保证页面不是空的） */
  var FB_OPENING = "……哦？有人来了。真的假的……想问的可以问我。什么都可以，回不回答就是我的事了哦？";
  var FB_ASKS = ["你最近在做什么？", "你的项目里最难的是什么？", "你平时在想什么？"];

  /* 会话标识：同一个访客的一次连续对话（存 localStorage，刷新不变） */
  var SESSION = (function () {
    try {
      var v = localStorage.getItem("vn_session");
      if (!v) {
        v = "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        localStorage.setItem("vn_session", v);
      }
      return v;
    } catch (e) { return "s-nostore"; }
  })();

  /* ---------- 回复 → 立绘表情（本地关键词判断，不额外请求） ----------
     2026-10 用户要求「减少大笑和眯眼笑的含量，尽量停在冷一点的微笑」。
     于是把原来三档高能量表情全部并进 calm（睁眼、淡淡抿嘴）：
         laugh（张嘴大笑）· happy（眯眼抿嘴）· smile（眯眼笑）
     关键词一个没删，只是不再换脸 —— 以后要恢复层次，把下面三行的
     "calm" 依次改回 laugh / happy / smile 即可。
     注意：**顺序仍然要紧**（先匹配到的先赢），所以这三行留在原位，
     别挪到 surprise/sad/shy/... 后面，否则会改变命中优先级。 */
  var MOOD_HINTS = [
    ["calm",     ["哈哈", "笑死", "笑出声", "hhh", "233", "lol","难绷", "绷不住了","诗人"]],
    ["calm",     ["太好了", "开心", "高兴", "喜欢", "欢迎", "不错", "很棒", "点赞"]],
    ["surprise", ["居然", "竟然", "没想到", "意外",  "诶", "真假？","猎奇"]],
    ["sad",      ["抱歉", "可惜", "遗憾", "对不起", "没办法", "不太行", "做不到"]],
    ["shy",      ["不好意思", "害羞", "见笑", "过奖", "别夸"]],
    ["serious",  ["必须", "注意", "风险", "警告", "不要", "务必"]],
    ["think",    ["我想想", "大概", "也许", "可能", "取决于", "不太确定"]],
    ["calm",     ["谢谢", "感谢", "嗯嗯", "可以呀", "好啊"]]
  ];
  function moodOf(text) {
    var t = text || "";
    for (var i = 0; i < MOOD_HINTS.length; i++) {
      var ks = MOOD_HINTS[i][1];
      for (var j = 0; j < ks.length; j++) {
        if (t.indexOf(ks[j]) >= 0) return MOOD_HINTS[i][0];
      }
    }
    return "calm";
  }
  function mood(m) { if (window.VNAvatar) window.VNAvatar.set(m); }

  var log = document.getElementById("vn-log");
  var asks = document.getElementById("vn-asks");
  var form = document.getElementById("vn-form");
  var input = document.getElementById("vn-q");
  var sendBtn = document.getElementById("vn-send");
  var st = document.getElementById("vn-st");
  var chips = document.getElementById("vn-topics");   /* 只有叁有 */
  if (!log || !asks || !form || !input || !sendBtn || !st) return;

  var history = [];
  var busy = false;
  var topic = "";                    /* 当前话题 key，"" = 不限方向 */

  function bubble(kind, text) {
    var d = document.createElement("div");
    d.className = "vn-msg " + kind;
    d.textContent = text || "";
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }

  /* 连不上后端时的退路：把访客那句话变成能直接粘进微信/邮件的文本。
     国内手机上到 *.supabase.co 常常整条 TCP 不通，纯前端绕不过去，
     所以这里不硬撑，给一条「照样能把话送到」的路。 */
  /* 复制到剪贴板：优先 Clipboard API，被拒就退回 textarea + execCommand。
     两个都不行才让访客手动长按 —— iPhone Safari 偶发会拒绝 Clipboard API。 */
  function legacyCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      if (ta.setSelectionRange) ta.setSelectionRange(0, ta.value.length);
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) { return false; }
  }

  function copyText(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); },
                                               function () { done(legacyCopy(text)); });
      return;
    }
    done(legacyCopy(text));
  }

  function bubbleFail(q) {
    var d = bubble("sys", "（连不上服务器。这句话可以复制了直接发我 —— 微信 " + WECHAT +
                          " · QQ邮箱 " + MAIL + "）");
    var b = document.createElement("button");
    b.type = "button";
    b.className = "vn-copy";
    b.textContent = "复制我那句";
    b.addEventListener("click", function () {
      var t = (q == null ? "" : String(q)).trim();
      if (!t) { b.textContent = "没有可复制的内容"; return; }
      copyText("【来自个人主页 · 分身对话】\n" + t, function (ok) {
        b.textContent = ok ? "已复制 ✓ 粘到微信/邮件即可" : "复制失败，请长按输入框手动复制";
      });
    });
    d.appendChild(b);
    log.scrollTop = log.scrollHeight;
    return d;
  }

  function setSt(text, kind) {
    st.textContent = text || "";
    st.setAttribute("data-kind", kind || "");
  }

  /* 2026-10：用户要求「对话界面里的推荐问题全部删掉」。
     #vn-asks 这个节点必须留在 DOM 里 —— 上面那条守卫少任何一个节点就整体
     return，整个分身会哑掉；所以这里只清空、不再画按钮。容器空着的时候
     chat.css 的 `.vn-compose .vn-asks:empty { display: none }` 会把它收掉，
     版面不会留空档。TOPICS[].asks / FB_ASKS 保留不删：以后要恢复，
     把下面这个函数改回原来的 forEach 版本即可。 */
  function drawAsks() {
    asks.textContent = "";
  }

  function lock(on) {
    busy = on;
    sendBtn.disabled = on;
    var i, bs = asks.querySelectorAll(".vn-ask");
    for (i = 0; i < bs.length; i++) bs[i].disabled = on;
    if (chips) {
      var cs = chips.querySelectorAll(".vn-topic");
      for (i = 0; i < cs.length; i++) cs[i].disabled = on;
    }
  }

  /* ---------- 开场白 ---------- */
  /* 只负责上屏：清空记录 + 说第一句 + 摆好快捷提问（不发任何请求） */
  function showOpening(text, list, m) {
    log.textContent = "";
    history.length = 0;
    if (m) mood(m);
    var d = bubble("clone", text);
    history.push({ role: "assistant", content: text });
    drawAsks(list);
    return d;
  }

  /* 向服务端要正式开场白 / 快捷提问（只在「不限方向」时用；失败就保持本地兜底） */
  function fromServer(first, retried) {
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, 12000);
    VNB.fetch(EP, { headers: AUTH, signal: ctl.signal })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (d) {
        clearTimeout(timer);
        if (topic) return;                       /* 这中间访客换话题了，就别再改 */
        if (d && d.opening) {
          first.textContent = d.opening;
          history[0] = { role: "assistant", content: d.opening };
        }
        if (d && d.suggestions && d.suggestions.length) drawAsks(d.suggestions);
        if (d && d.ready === false) {
          setSt("分身还没接上模型（服务端缺 LLM_API_KEY）—— 但「✎ 反馈」现在就能用。", "err");
        }
      })
      .catch(function () {
        clearTimeout(timer);
        if (topic) return;
        if (!retried) {   /* 打开页面那一下网络抖动：4 秒后自动再试一次，别一直停在兜底文案 */
          setTimeout(function () { fromServer(first, true); }, 4000);
          return;
        }
        setSt("分身暂时连不上（网络到 Supabase 不通）—— 你仍然可以点卡片上的「✎ 反馈」给我留言。", "err");
      });
  }

  /* 换话题：key 传空 = 回到「不限方向」。会重新开一段对话。 */
  function openTopic(key) {
    var t = (key && TOPICS[key]) || null;
    topic = t ? key : "";
    var first = showOpening(
      t ? t.opening : FB_OPENING,
      t ? t.asks : FB_ASKS,
      t ? t.mood : "calm"
    );
    setSt(t ? "正在聊「" + t.label + "」—— 换一个方向会重新开一段对话。" : "", "");
    syncTopics();
    if (!t) fromServer(first);                   /* 不限方向时才去问服务端 */
    return first;
  }

  /* ---------- 叁顶部的话题按钮（页面里有 #vn-topics 才画） ---------- */
  function syncTopics() {
    if (!chips) return;
    var bs = chips.querySelectorAll(".vn-topic");
    for (var i = 0; i < bs.length; i++) {
      var on = (bs[i].getAttribute("data-topic") || "") === topic;
      bs[i].classList.toggle("on", on);
      bs[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }
  function buildTopics() {
    if (!chips) return;
    chips.textContent = "";
    var k = document.createElement("span");
    k.className = "vn-topics-k";
    k.textContent = "同好";
    chips.appendChild(k);

    var list = [{ key: "", label: "不限" }];
    for (var i = 0; i < TOPIC_ORDER.length; i++) {
      var key = TOPIC_ORDER[i];
      if (TOPICS[key]) list.push({ key: key, label: TOPICS[key].label });
    }
    list.forEach(function (it) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "vn-ask vn-topic";
      b.setAttribute("data-topic", it.key);
      b.setAttribute("aria-pressed", "false");
      b.textContent = it.label;
      b.addEventListener("click", function () {
        if (busy) return;
        openTopic(it.key);
      });
      chips.appendChild(b);
    });
    syncTopics();
  }

  /* ---------- 发一句 ---------- */
  /* 要发出去的消息：开话题时在最前面塞一条「话题背景」（访客看不到），
     这样模型知道这会儿在聊哪个方向；它不会进聊天记录，也不会被写进库。 */
  function outbound() {
    var m = history.slice(-12);
    if (topic && TOPICS[topic]) {
      m = [{ role: "user", content: TOPICS[topic].prime }].concat(m.slice(-11));
    }
    return m;
  }

  async function submit() {
    var q = (input.value || "").trim();
    if (!q || busy) return;
    input.value = "";
    var mine = bubble("me", q);
    history.push({ role: "user", content: q });

    lock(true);
    setSt("分身正在想……", "busy");
    mood("think");

    var out = bubble("clone", "");
    var cur = document.createElement("span");
    cur.className = "cur";
    cur.textContent = "\u258c";
    out.appendChild(cur);

    var acc = "";
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, 30000);
    try {
      var res = await VNB.fetch(EP, {
        method: "POST",
        headers: JSON_H,
        body: JSON.stringify({ messages: outbound(), session: SESSION, page: location.pathname }),
        signal: ctl.signal
      });
      if (!res.ok) {
        var j = null;
        try { j = await res.json(); } catch (e) {}
        throw new Error((j && j.error) || ("HTTP " + res.status));
      }
      if (res.body && res.body.getReader) {
        var reader = res.body.getReader();
        var dec = new TextDecoder();
        for (;;) {
          var r = await reader.read();
          if (r.done) break;
          acc += dec.decode(r.value, { stream: true });
          out.textContent = acc;
          out.appendChild(cur);
          log.scrollTop = log.scrollHeight;
        }
      } else {
        acc = await res.text();
        out.textContent = acc;
        out.appendChild(cur);
      }
      if (cur.parentNode) cur.parentNode.removeChild(cur);
      acc = (acc || "").trim();
      if (!acc) {
        out.textContent = "……（这次他什么也没说出口）";
      } else {
        out.textContent = acc;
        history.push({ role: "assistant", content: acc });
      }
      setSt("", "");
      mood(acc ? moodOf(acc) : "calm");
    } catch (err) {
      if (cur.parentNode) cur.parentNode.removeChild(cur);
      if (out.parentNode && !out.textContent) out.parentNode.removeChild(out);
      /* 没发出去：撤掉这轮的痕迹（气泡 + 历史），把话退回输入框，让访客一键重发，
         不然重试会把同一句问两遍、还会把半截记录写进库里。
         最常见的原因是本机到 *.supabase.co 的连接被断（浏览器打不开就换节点/代理或换网络，
         或先用「✎ 反馈」留言）。 */
      if (mine && mine.parentNode) mine.parentNode.removeChild(mine);
      if (history.length && history[history.length - 1].role === "user") history.pop();
      try { input.value = q; } catch (e) {}
      bubble("sys", "（分身没接上：" + ((err && err.message) || err) + "）");
      bubbleFail(q);
      setSt("发送失败 —— 连不上 Supabase 服务器（多半是你的网络到 *.supabase.co 不通）。" +
            "这句话已经退回输入框，点「发送」可重发；也可以点下面「复制我那句」直接发我微信/邮件。", "err");
      mood("calm");
    } finally {
      clearTimeout(timer);
      lock(false);
      log.scrollTop = log.scrollHeight;
      try { input.focus(); } catch (e) {}
    }
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    submit();
  });

  window.VNmoodOf = moodOf;
  window.VNclone = {
    ask: function (t) { input.value = t; return submit(); },
    history: history,
    openTopic: openTopic,          /* 贰点方向后由页面调它 */
    topics: TOPICS,                /* 话题文案都在这儿，页面也能读 */
    now: function () { return topic; }
  };

  buildTopics();
  if (!SCR || SCR.getAttribute("data-boot") !== "manual") openTopic("");
})();
