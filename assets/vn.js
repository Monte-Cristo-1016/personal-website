/* ============================================================
   VN 脚本 — 剧情转场 + 打字机对话框
   子页面共用；index.html 只用其中的转场部分
   ============================================================ */
(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var NAV_KEY = "vn-nav";
  var TYPING_MS = 55;      // 每字间隔（毫秒）

  /* ---------- 离场转场：黑幕合拢 + 章节名浮现 → 跳转 ---------- */
  window.VNgo = function (url, chapter, title) {
    if (reduce) { location.href = url; return; }
    try {
      sessionStorage.setItem(NAV_KEY, JSON.stringify({ c: chapter || "", t: title || "" }));
    } catch (e) {}
    var cur = document.querySelector(".vn-curtain");
    if (!cur) { location.href = url; return; }
    var ec = cur.querySelector(".ct-chapter");
    var et = cur.querySelector(".ct-title");
    if (ec && chapter) ec.textContent = chapter;
    if (et && title) et.textContent = title;
    cur.classList.add("closing");
    setTimeout(function () { location.href = url; }, 1500);
  };

  /* ---------- 入场转场：黑幕拉开 ---------- */
  function playEnter() {
    var mark = null;
    try { mark = JSON.parse(sessionStorage.getItem(NAV_KEY) || "null"); } catch (e) {}
    try { sessionStorage.removeItem(NAV_KEY); } catch (e) {}
    if (!mark || reduce) return;
    var cur = document.querySelector(".vn-curtain");
    if (!cur) return;
    var ec = cur.querySelector(".ct-chapter");
    var et = cur.querySelector(".ct-title");
    if (ec) ec.textContent = mark.c || "";
    if (et) et.textContent = mark.t || "";
    cur.classList.add("opening");
    setTimeout(function () { cur.classList.remove("opening"); }, 1300);
  }

  /* ---------- 外部改台词：贰换景后由 scenes.js 调用 ---------- */
  var stopTyping = function () {};

  window.VNsay = function (text, mood) {
    stopTyping();
    var box = document.querySelector(".vn-text");
    if (box && text) box.textContent = text;
    if (mood && window.VNAvatar) window.VNAvatar.set(mood);
  };

  /* ---------- 打字机对话框 ---------- */
  function initDialog() {
    var box = document.querySelector(".vn-text");
    if (!box) return;
    var lines = (box.getAttribute("data-lines") || box.textContent || "").split("|");
    var moods = (box.getAttribute("data-moods") || "").split("|");
    var li = 0, typing = false, timer = null;
    var next = document.querySelector(".vn-next");
    var reveals = document.querySelectorAll(".vn-reveal");
    var finished = false;

    function revealAll() {
      for (var i = 0; i < reveals.length; i++) reveals[i].classList.add("on");
      if (next) next.classList.remove("on");
    }
    function done() {
      finished = true;
      revealAll();
      document.removeEventListener("click", onAdvance);
      document.removeEventListener("keydown", onKey);
    }
    function typeLine(text) {
      typing = true;
      var i = 0;
      box.textContent = "";
      var caret = document.createElement("span");
      caret.className = "caret";
      caret.textContent = "\u258c";
      box.appendChild(caret);
      timer = setInterval(function () {
        if (i >= text.length) {
          clearInterval(timer); timer = null; typing = false;
          if (caret.parentNode) caret.parentNode.removeChild(caret);
          if (li < lines.length - 1) { if (next) next.classList.add("on"); }
          else { done(); }
          return;
        }
        caret.insertAdjacentText("beforebegin", text.charAt(i));
        i++;
      }, TYPING_MS);
    }
    function show(i) {
      li = i;
      if (next) next.classList.remove("on");
      if (moods[i] && window.VNAvatar) window.VNAvatar.set(moods[i]);
      typeLine(lines[i]);
    }
    function skip() {                       // 立即补全当前句
      clearInterval(timer); timer = null; typing = false;
      box.textContent = lines[li];
      if (li < lines.length - 1) { if (next) next.classList.add("on"); }
      else { done(); }
    }
    stopTyping = function () {
      clearInterval(timer); timer = null; typing = false;
      finished = true;
      if (next) next.classList.remove("on");
      document.removeEventListener("click", onAdvance);
      document.removeEventListener("keydown", onKey);
    };
    function onAdvance(e) {
      if (finished) return;
      if (e && e.target && e.target.closest &&
          e.target.closest("a, button, input, textarea, select, .vn-choice")) return;
      if (typing) { skip(); return; }
      if (li < lines.length - 1) show(li + 1);
    }
    function onKey(e) {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); onAdvance(null); }
    }

    if (reduce) {
      box.textContent = lines.join("\n");
      revealAll();
      return;
    }
    show(0);
    document.addEventListener("click", onAdvance);
    document.addEventListener("keydown", onKey);
  }

  playEnter();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDialog);
  } else {
    initDialog();
  }
})();

/* ============================================================
   聊天窗「不挡脸」+ 高度可拖
   ------------------------------------------------------------
   问题：聊天窗是固定高度（62vh），屏幕一矮它的上沿就盖住立绘的脸。
   做法：
     1) 量立绘的实际位置，算出「下巴」那条线，再往下留 16px，得到窗子上沿
        最多能到哪儿，换算成 --vn-chat-cap（chat.css 里 .vn-chat 的
        max-height 用它）—— 屏幕够高时这个上限比默认高度还大，等于没生效；
        屏幕矮时才真的把窗子压低。
     2) 窗子顶缘正中小抓手：上下拖可以自己改高度（记在 localStorage），
        双击复位回到自动。
     3) 输入框 / 快捷问 / 话题芯片搬到了页面顶部的 .vn-compose 里
        （底下只剩「单纯的对话框」）：这样窗子的高度不用再被那几行固定内容
        从里面吃掉，records 区能实打实吃满「下巴 - 20px」这条线。
        代价是立绘的头顶要躲开顶部那条 —— 见 topEdge()。
   立绘比例出自 _work/make_moods3.py（B_HEAD=244，画布高 1112）。
   ============================================================ */
(function () {
  "use strict";

  var FACE = 338 / 1112;   // 立绘「下巴」在整张图高度上的位置
                           // 实测：780x1112 的画布，下巴在 y≈338（_work/_chin_lines.png、
                           // _work/_moods_chin.png，九个差分同画布对齐，按 calm 取）。
                           // 旧值 244/1112 是上一版画布的数字，落在**眼睛**上，所以窗子顶边
                           // 一直压着脸 —— 这是「挡脸」的真正原因。
  var HEAD = 41 / 1112;    // 头顶（alpha 第一行内容在 y=41），用来保证不顶到章节标题
  var GAP = 20;            // 下巴和窗子上沿之间留的空白
  var MIN_H = 236;         // 没立绘的页面（读稿）用的期望高度
  var LOG_MIN = 88;        // 记录区至少留这么多，不然「对话」只剩一条缝
  var FLOOR_H = 190;       // 实在挤不下时的硬地板（宁可少量压下巴，也别把聊天区压没）
  var RESERVE = 92;        // 顶部还有章节标题，别让立绘头顶越线
  var KEY = "vn_chat_h";

  var boxes = [].slice.call(document.querySelectorAll(".vn-dialog.vn-chat"));
  if (!boxes.length) return;

  var saved = 0;
  try { saved = Math.round(parseFloat(localStorage.getItem(KEY)) || 0); } catch (e) {}
  if (saved < FLOOR_H) saved = 0;

  var avH = 0;                             /* solve() 定下来的立绘高度 */

  function avBox(h) {                      /* 给立绘一个高度 h，算它在视口里的位置 */
    var av = document.querySelector(".vn-avatar");
    if (!av) return null;
    var ext = -parseFloat(window.getComputedStyle(av).bottom) || 0;   // 探出下沿多少
    return { ext: ext, h: h, top: window.innerHeight + ext - h };
  }

  function chinY(h) {                      /* 立绘「下巴」在视口里的 y */
    var g = avBox(h || avH);
    return g ? g.top + g.h * FACE : -1;
  }

  function headTop(h) {                    /* 立绘「头顶」在视口里的 y */
    var g = avBox(h);
    return g ? g.top + g.h * HEAD : 0;
  }

  function rawCap(box, h) {                /* 窗子上沿能到哪儿（下巴往下 GAP） */
    var y = chinY(h);
    if (y < 0) return -1;
    var bottom = parseFloat(window.getComputedStyle(box).bottom) || 24;
    return Math.round(window.innerHeight - bottom - y - GAP);
  }

  function capOf(box, h) {
    var c = rawCap(box, h);
    if (c < 0) return 0;
    return Math.round(Math.max(FLOOR_H, Math.min(c, window.innerHeight - RESERVE)));
  }

  /* 卡片里除了记录区之外，剩下的行占多高。现在输入区搬到页面顶上了，
     卡片里只剩「章节链接」一行（贰还多一个话题条）——
     但这段还是按通用写法算：以后谁往卡片里加东西，高度自动跟着走。 */
  function needH(box) {
    var i, sum = 0, cs = window.getComputedStyle(box);
    sum += (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    for (i = 0; i < box.children.length; i++) {
      var c = box.children[i], s = window.getComputedStyle(c);
      if (s.position === "absolute" || c.classList.contains("vn-log")) continue;
      sum += c.getBoundingClientRect().height +
             (parseFloat(s.marginTop) || 0) + (parseFloat(s.marginBottom) || 0);
    }
    return Math.round(sum) + (box.querySelector(".vn-log") ? LOG_MIN : 0);
  }

  /* ---------- 顶部输入区（.vn-compose）----------
     聊天页的输入框 / 快捷问 / 话题芯片都在顶上这一条里（标题让了位）。
     它有两件事归 vn.js 管：
       ① 位置：它贴在 header 下面（header 的高度跟 vh 走，CSS 里写死会错位）；
       ② 让位：它多高，立绘的头顶就得从它下沿再往下 10px 开始 —— 
          输入区要是压着立绘的头，比压着卡片还难看。 */
  var compose = document.querySelector(".vn-compose");

  /* 注意：这里全部用 offsetTop / offsetHeight，不用 getBoundingClientRect()。
     顶上这两块（header、输入区）都有入场动画（transform: translateY），
     动画没跑完时 rect 量到的位置偏上十几像素 —— 立绘就会照着错的位置让位，
     等动画结束就顶到输入区底下了（实测差 4px）。offset* 不带 transform，稳。 */
  function placeCompose() {
    if (!compose || compose.hasAttribute("hidden")) return;
    var head = document.querySelector(".vn-top");
    if (!head) return;
    var y = head.offsetTop + head.offsetHeight;
    if (y > 0) compose.style.top = Math.round(y + 6) + "px";
  }

  function topEdge() {                       /* 立绘头顶最低只能到这儿 */
    if (compose && !compose.hasAttribute("hidden") && compose.offsetHeight > 4) {
      return compose.offsetTop + compose.offsetHeight + 10;
    }
    var head = document.querySelector(".vn-top");
    if (head) return head.offsetTop + head.offsetHeight + 10;
    return RESERVE;
  }

  /* 立绘该多大：先按 CSS 设计尺寸，然后
     ① 头顶越线就缩；② 窗子放不下内容就放大立绘
        （人往上长 → 下巴上移 → 窗子才有地方）——反正不许盖脸。 */
  function solve() {
    var av = document.querySelector(".vn-avatar");
    if (!av) return 0;
    av.style.height = "";
    var h = av.getBoundingClientRect().height;
    var need = Math.min(needH(boxes[0]), window.innerHeight - RESERVE);
    var topMin = Math.max(topEdge(), Math.round(window.innerHeight * 0.12));
    var i;
    for (i = 0; i < 90 && h > 150 && headTop(h) < topMin; i++) h -= 6;
    for (i = 0; i < 90 && rawCap(boxes[0], h) < need && headTop(h + 8) >= topMin; i++) h += 8;
    h = Math.round(h);
    if (Math.abs(h - av.getBoundingClientRect().height) > 1) av.style.height = h + "px";
    avH = h;
    return h;
  }

  function fit() {
    solve();
    var i, c = 0;
    for (i = 0; i < boxes.length; i++) c = Math.max(c, capOf(boxes[i], avH));
    if (c) document.documentElement.style.setProperty("--vn-chat-cap", c + "px");
  }

  function ceilOf(box) {                   /* 拖动范围的上限 = 不盖脸那条线 */
    var c = capOf(box, avH);
    return c || Math.max(MIN_H, window.innerHeight - RESERVE);
  }

  /* 高度定案：想要的（手拖过的）和内容需要的，取大；再夹在 [内容需求, 不盖脸上限]。
     没手拖过就直接吃满上限 —— 记录区尽量大，脸照样不挡。 */
  function applySaved() {
    for (var i = 0; i < boxes.length; i++) {
      var c = ceilOf(boxes[i]);
      var need = Math.min(needH(boxes[i]), c);
      var want = saved > 0 ? Math.max(saved, need) : c;
      boxes[i].style.height = Math.round(Math.max(need, Math.min(want, c))) + "px";
    }
  }

  function grip(box) {
    var g = document.createElement("span");
    g.className = "vn-grip";
    g.setAttribute("role", "separator");
    g.setAttribute("aria-label", "拖动调整聊天窗高度，双击复位");
    g.title = "拖动调整高度 · 双击复位";
    box.appendChild(g);

    var y0 = 0, h0 = 0, on = false;

    function down(e) {
      on = true;
      y0 = e.clientY;
      h0 = box.getBoundingClientRect().height;
      box.classList.add("vn-chat-drag");
      try { g.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    }
    function move(e) {
      if (!on) return;
      var h = Math.round(h0 + (y0 - e.clientY));       // 往上拖 = 变高
      h = Math.max(FLOOR_H, Math.min(h, ceilOf(box))); // 上限就是「下巴 + GAP」
      box.style.height = h + "px";
      e.preventDefault();
    }
    function up(e) {
      if (!on) return;
      on = false;
      box.classList.remove("vn-chat-drag");
      try { g.releasePointerCapture(e.pointerId); } catch (err) {}
      saved = Math.round(box.getBoundingClientRect().height);
      try { localStorage.setItem(KEY, String(saved)); } catch (err) {}
    }
    function reset() {
      saved = 0;
      try { localStorage.removeItem(KEY); } catch (e) {}
      box.style.height = "";
      box.style.maxHeight = "";
      /* 复位要回到「自动」那一档，不是回到 CSS 里写死的默认高：
         自动 = 吃满「下巴 + GAP」那条上限，所以得按 applySaved 再算一次 */
      fit(); applySaved(); fitReads();
    }

    g.addEventListener("pointerdown", down);
    g.addEventListener("pointermove", move);
    g.addEventListener("pointerup", up);
    g.addEventListener("pointercancel", up);
    g.addEventListener("dblclick", reset);
  }

  /* ---------- 正经的正文窗（没聊天的那种）也一起兜底 ----------
     它是内容自适应高度：只有在「自然高度已经超过上限」时才收起，
     收起来时由正文块自己滚（见 vn.css 的 .vn-fit），名字牌不会被裁掉。 */
  var reads = [];

  function fitReads() {
    for (var i = 0; i < reads.length; i++) {
      var b = reads[i];
      if (b.hasAttribute("hidden")) continue;
      b.classList.remove("vn-fit");            // 先还原，量到的才是自然高度
      b.style.maxHeight = "";
      var c = capOf(b, avH);
      if (!c) continue;
      if (b.getBoundingClientRect().height > c + 1) {
        b.style.maxHeight = c + "px";
        b.classList.add("vn-fit");
      }
    }
  }

  var wt = null;
  function watchText() {                       /* 打字机每 55ms 写一次，合并一下 */
    if (!window.MutationObserver) return;
    var texts = document.querySelectorAll(".vn-dialog .vn-text");
    for (var i = 0; i < texts.length; i++) {
      new MutationObserver(function () {
        if (wt) clearTimeout(wt);
        wt = setTimeout(function () { wt = null; fitReads(); }, 180);
      }).observe(texts[i], { childList: true, characterData: true, subtree: true });
    }
  }

  var rt = null;
  function relayout(delay) {                 /* 位置 + 让位一起重算（防抖） */
    if (rt) clearTimeout(rt);
    rt = setTimeout(function () {
      rt = null;
      placeCompose();
      fit(); applySaved(); fitReads();
    }, delay || 140);
  }

  function init() {
    var i;
    for (i = 0; i < boxes.length; i++) grip(boxes[i]);
    reads = [].slice.call(document.querySelectorAll(".vn-dialog")).filter(function (b) {
      return !b.classList.contains("vn-chat");
    });
    placeCompose();
    fit();
    applySaved();
    fitReads();
    watchText();
    var t = null;
    window.addEventListener("resize", function () {
      if (t) clearTimeout(t);
      t = setTimeout(function () { t = null; placeCompose(); fit(); applySaved(); fitReads(); }, 140);
    });
    window.addEventListener("orientationchange", function () {
      setTimeout(function () { placeCompose(); fit(); applySaved(); fitReads(); }, 260);
    });
    /* 输入区自己会变高：快捷问是开局之后才生成的、芯片窄屏会换行。
       （贰点开话题时由页面脚本派发 resize，这里兜住其余情况） */
    if (compose && window.ResizeObserver) {
      new ResizeObserver(function () { relayout(120); }).observe(compose);
    }
    /* 入场动画跑完再定一次案：动画期间元素的 rect / 排版尺寸都可能还不是最终值
       （header 的淡入位移、输入区的滑入），等它落地再让立绘对一次位 */
    if (document.getAnimations) {
      try {
        document.getAnimations().forEach(function (a) {
          if (a.finished && a.finished.then) a.finished.then(function () { relayout(60); }, function () {});
        });
      } catch (e) {}
    }
    setTimeout(function () { relayout(60); }, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  window.addEventListener("load", function () { placeCompose(); fit(); applySaved(); fitReads(); });
})();