/* ============================================================
 * VN 反馈组件（自包含）
 * 用法：<script src="assets/feedback.js" data-source="序章"></script>
 *   data-source  写进数据库的 source 字段（1-40 字）
 *   子页（含 .vn-dialog）自动停靠到对话框卡片上沿右侧；序章页固定在右下角
 *   data-button="off"  不自动生成右下角按钮（改用 [data-vn-feedback] 元素触发）
 * 安全：前端只用公开的 anon key；表已开 RLS —— 只能 INSERT，读不到任何反馈
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

  /* 连不上时（国内网络到 *.supabase.co 常见 TCP 不通）的应急联系方式。
     与 contact.html 上公开的那套一致，写死在这里是为了不依赖页面结构。 */
  var MAIL = "3484991466@qq.com";
  var WECHAT = "cyc20080310";

  var tag = document.currentScript;
  var SOURCE = (tag && tag.getAttribute("data-source")) || "序章";
  var SHOW_BTN = !(tag && tag.getAttribute("data-button") === "off");

  var CSS = [
    ".vnf-btn{position:fixed;z-index:9998;right:clamp(12px,2vw,22px);bottom:clamp(12px,2vh,20px);",
    "display:inline-flex;align-items:center;padding:.5em 1.02em;cursor:pointer;",
    "font-family:'Yu Mincho','YuMincho','MS PMincho','SimSun',serif;font-size:12.5px;",
    "letter-spacing:.22em;text-indent:.22em;color:rgba(246,214,170,.9);",
    "border-color:transparent;background:transparent;backdrop-filter:none;",
    "text-shadow:0 2px 10px rgba(4,6,18,.92);transition:color .24s,text-shadow .24s}",
    ".vnf-btn:hover,.vnf-btn:focus-visible{color:#fff3dd;",
    "text-shadow:0 0 14px rgba(246,214,170,.5),0 2px 10px rgba(4,6,18,.95)}",
    ".vnf-btn:focus-visible{outline:none}",
    ".vnf-btn.vnf-dock{position:absolute;right:clamp(20px,3vw,34px);bottom:calc(100% + 18px);top:auto;left:auto}",
    ".vnf-mask{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;",
    "padding:clamp(14px,4vw,40px);background-color:rgba(3,7,18,.7);backdrop-filter:blur(6px)}",
    ".vnf-mask.on{display:flex;animation:vnf-in .28s ease-out both}",
    ".vnf-panel{width:min(520px,100%);max-height:88vh;overflow:auto;padding:clamp(18px,3.2vw,30px);",
    "border-radius:22px;border:1px solid transparent;",
    "background-image:linear-gradient(168deg,rgba(22,36,78,.96) 0%,rgba(9,16,40,.96) 62%,rgba(15,24,56,.96) 100%),",
    "linear-gradient(148deg,rgba(255,240,214,.74) 0%,rgba(246,214,170,.22) 26%,rgba(132,170,220,.22) 58%,rgba(246,214,170,.46) 100%);",
    "background-origin:padding-box,border-box;background-clip:padding-box,border-box;",
    "box-shadow:0 22px 60px rgba(0,0,0,.55),0 0 30px rgba(246,214,170,.16),",
    "inset 0 1px 0 rgba(255,246,228,.10);animation:vnf-panel .34s cubic-bezier(.2,.7,.3,1) both}",
    ".vnf-head{margin:0 0 5px;font-family:'Yu Mincho','YuMincho','Hiragino Mincho ProN','MS PMincho','SimSun',serif;",
    "font-size:clamp(19px,2.6vw,23px);font-weight:700;letter-spacing:.18em;text-indent:.18em;color:#fdf6ec}",
    ".vnf-sub{margin:0 0 14px;font-size:11.5px;letter-spacing:.14em;color:rgba(246,214,170,.68)}",
    ".vnf-field{display:grid;gap:5px;margin-top:11px}",
    ".vnf-field>span{font-family:'Yu Mincho','YuMincho','MS PMincho','SimSun',serif;font-size:12.5px;",
    "letter-spacing:.18em;color:rgba(246,214,170,.82)}",
    ".vnf-field input,.vnf-field textarea{width:100%;box-sizing:border-box;padding:9px 14px;font:inherit;font-size:14px;",
    "color:#f5eee4;background-color:rgba(6,12,30,.6);border:1px solid rgba(246,214,170,.3);border-radius:12px;outline:none;resize:vertical;",
    "transition:border-color .24s,box-shadow .24s}",
    ".vnf-field input:focus,.vnf-field textarea:focus{border-color:rgba(246,214,170,.72);box-shadow:0 0 0 3px rgba(246,214,170,.13)}",
    ".vnf-acts{display:flex;align-items:center;gap:10px;margin-top:16px;flex-wrap:wrap}",
    ".vnf-send{padding:9px 26px;cursor:pointer;font-family:'Yu Mincho','YuMincho','MS PMincho','SimSun',serif;",
    "font-size:14px;letter-spacing:.2em;text-indent:.2em;color:#2a1c10;border:1px solid transparent;border-radius:999px;",
    "background-image:linear-gradient(174deg,#fdf3dd 0%,#f8e0b4 38%,#eac68c 70%,#f6dfb6 100%);",
    "box-shadow:0 6px 18px rgba(4,6,18,.42),0 0 18px rgba(246,214,170,.24),inset 0 1px 0 rgba(255,255,255,.7)}",
    ".vnf-send:hover{filter:brightness(1.05)}",
    ".vnf-send[disabled]{opacity:.6;cursor:progress}",
    ".vnf-close{margin-left:auto;padding:8px 16px;cursor:pointer;font:inherit;font-size:12.5px;letter-spacing:.16em;",
    "color:rgba(246,214,170,.78);background:transparent;border:1px solid rgba(246,214,170,.28);border-radius:999px;",
    "transition:color .24s,border-color .24s,background-color .24s}",
    ".vnf-close:hover{color:#fff3dd;border-color:rgba(246,214,170,.6);background-color:rgba(12,20,44,.5)}",
    ".vnf-status{margin:11px 0 0;min-height:1.15em;font-size:12.5px;letter-spacing:.08em;color:rgba(246,214,170,.7)}",
    ".vnf-status[data-kind='ok']{color:#ffe6b8}",
    ".vnf-status[data-kind='err']{color:#ffb39c}",
    ".vnf-status[data-kind='busy']{color:rgba(246,214,170,.55)}",
    /* 寄不出去时的兜底块 */
    ".vnf-fail{display:none;margin:12px 0 0;padding:12px 14px;border-radius:14px;",
    "border:1px solid rgba(255,179,156,.4);background-color:rgba(58,20,20,.32)}",
    ".vnf-fail.on{display:block;animation:vnf-in .24s ease-out both}",
    ".vnf-fail p{margin:0 0 10px;font-size:12.5px;line-height:1.8;letter-spacing:.05em;color:rgba(255,220,204,.94)}",
    ".vnf-fail p:last-child{margin:10px 0 0}",
    ".vnf-fail code{font-size:12px;color:#ffe6b8;word-break:break-all}",
    ".vnf-fail-btns{display:flex;gap:9px;flex-wrap:wrap}",
    ".vnf-alt{display:inline-flex;align-items:center;padding:8px 16px;cursor:pointer;font:inherit;font-size:12.5px;",
    "letter-spacing:.14em;text-decoration:none;color:rgba(255,236,214,.96);background-color:rgba(12,20,44,.6);",
    "border:1px solid rgba(246,214,170,.42);border-radius:999px;transition:color .24s,border-color .24s,background-color .24s}",
    ".vnf-alt:hover{color:#fff;border-color:rgba(246,214,170,.8);background-color:rgba(20,32,64,.72)}",
    ".vnf-fail-tip{font-size:11.5px;letter-spacing:.1em;color:rgba(246,214,170,.7)}",
    "body.vnf-lock{overflow:hidden}",
    "@keyframes vnf-in{from{opacity:0}to{opacity:1}}",
    "@keyframes vnf-panel{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}}",
    "@media (prefers-reduced-motion: reduce){.vnf-mask.on,.vnf-panel{animation:none}}"
  ].join("");

  var HTML = [
    "<style>" + CSS + "</style>",
    '<div class="vnf-mask" id="vnf-mask" aria-hidden="true">',
    '  <div class="vnf-panel" role="dialog" aria-modal="true" aria-labelledby="vnf-head">',
    '    <h2 class="vnf-head" id="vnf-head">留言</h2>',
    '    <p class="vnf-sub">FEEDBACK · 直接进我的收件箱，不用登录</p>',
    '    <form class="vnf-form">',
    '      <label class="vnf-field"><span>你的称呼</span>',
    '        <input type="text" name="who" maxlength="60" placeholder="怎么称呼你？（可留空）" autocomplete="off"></label>',
    '      <label class="vnf-field"><span>想说的话</span>',
    '        <textarea name="msg" rows="4" maxlength="2000" placeholder="哪里看不懂、哪里很喜欢、哪里想一起做点什么……都算数。" required></textarea></label>',
    '      <div class="vnf-acts">',
    '        <button class="vnf-send" type="submit">寄出</button>',
    '        <button class="vnf-close" type="button" data-vnf-close>关闭</button>',
    '      </div>',
    '      <p class="vnf-status" role="status" aria-live="polite"></p>',
    '      <div class="vnf-fail" data-vnf-fail>',
    '        <p>没寄出去 —— 多半是你的网络到 <code>*.supabase.co</code> 不通（国内手机上很常见，不是你的问题）。<br>这段话别白写，换下面任意一种方式发我，一样能看到：</p>',
    '        <div class="vnf-fail-btns">',
    '          <button class="vnf-alt" type="button" data-vnf-copy>复制这段话</button>',
    '          <a class="vnf-alt" data-vnf-mail href="mailto:' + MAIL + '">发邮件给我</a>',
    '        </div>',
    '        <p class="vnf-fail-tip">QQ邮箱 ' + MAIL + ' · 微信 ' + WECHAT + '</p>',
    '      </div>',
    '    </form>',
    '  </div>',
    '</div>'
  ].join("\n");

  if (SHOW_BTN) {
    HTML = '<button class="vnf-btn" type="button" data-vnf-open aria-haspopup="dialog">\u270e \u53cd\u9988</button>\n' + HTML;
  }
  document.body.insertAdjacentHTML("beforeend", HTML);

  /* 子页：把按钮停靠到对话框卡片上沿右侧，避开 ▼ 继续 与选项卡 */
  if (SHOW_BTN) {
    var btnEl = document.querySelector(".vnf-btn");
    var cardEl = document.querySelector(".vn-dialog");
    if (btnEl && cardEl) { cardEl.appendChild(btnEl); btnEl.classList.add("vnf-dock"); }
  }

  var mask = document.getElementById("vnf-mask");
  var form = mask.querySelector(".vnf-form");
  var status = mask.querySelector(".vnf-status");
  var sendBtn = mask.querySelector(".vnf-send");
  var failBox = mask.querySelector("[data-vnf-fail]");
  var copyBtn = mask.querySelector("[data-vnf-copy]");
  var mailA = mask.querySelector("[data-vnf-mail]");
  var lastFocus = null;

  function setStatus(text, kind) {
    status.textContent = text;
    status.setAttribute("data-kind", kind || "");
  }

  /* 把留言整理成一段可以直接粘贴/发信的文本 */
  function draft() {
    var who = (form.elements.who.value || "").trim();
    var msg = (form.elements.msg.value || "").trim();
    return "【来自个人主页 · " + SOURCE + "】\n" +
      (who ? "称呼：" + who + "\n" : "") +
      "内容：" + msg;
  }

  function hideFail() {
    failBox.classList.remove("on");
    copyBtn.textContent = "复制这段话";
  }

  function showFail() {
    failBox.classList.add("on");
    copyBtn.textContent = "复制这段话";
    try {
      mailA.href = "mailto:" + MAIL +
        "?subject=" + encodeURIComponent("主页留言（" + SOURCE + "）") +
        "&body=" + encodeURIComponent(draft());
    } catch (e) { /* 个别浏览器不给拼 mailto，忽略 */ }
  }

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

  copyBtn.addEventListener("click", function () {
    copyText(draft(), function (ok) {
      copyBtn.textContent = ok ? "已复制 ✓" : "复制失败，请长按上面的文字";
    });
  });

  function open() {
    lastFocus = document.activeElement;
    hideFail();
    mask.classList.add("on");
    mask.setAttribute("aria-hidden", "false");
    document.body.classList.add("vnf-lock");
    setTimeout(function () {
      try { form.elements.msg.focus(); } catch (e) {}
    }, 60);
  }

  function close() {
    mask.classList.remove("on");
    mask.setAttribute("aria-hidden", "true");
    document.body.classList.remove("vnf-lock");
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }

  function closest(el, sel) {
    while (el && el.nodeType === 1) {
      if (el.matches && el.matches(sel)) return el;
      el = el.parentElement;
    }
    return null;
  }

  document.addEventListener("click", function (ev) {
    if (closest(ev.target, "[data-vnf-open],[data-vn-feedback]") && !closest(ev.target, "[data-vnf-close]")) {
      ev.preventDefault();
      open();
      return;
    }
    if (closest(ev.target, "[data-vnf-close]")) { close(); return; }
    if (ev.target === mask) close();
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && mask.classList.contains("on")) close();
  });

  form.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var who = (form.elements.who.value || "").trim();
    var msg = (form.elements.msg.value || "").trim();

    if (msg.length < 1) { setStatus("至少写点什么吧。", "err"); form.elements.msg.focus(); return; }
    if (msg.length > 2000) { setStatus("有点太长了，限 2000 字。", "err"); return; }
    if (sendBtn.disabled) return;

    var old = sendBtn.textContent;
    sendBtn.disabled = true;
    sendBtn.textContent = "寄出中…";
    setStatus("正在把这句话送出去…", "busy");

    try {
      var res = await VNB.fetch("/rest/v1/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          name: who || null,
          message: msg,
          source: SOURCE,
          user_agent: (navigator.userAgent || "").slice(0, 400)
        })
      });
      if (!res.ok) {
        var detail = await res.text();
        throw new Error("HTTP " + res.status + " " + detail.slice(0, 160));
      }
      hideFail();
      setStatus("\u2713 已寄达。谢谢你，我一定会看到。", "ok");
      form.reset();
    } catch (err) {
      setStatus("没寄出去：" + ((err && err.message) || err), "err");
      showFail();
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = old;
    }
  });

  window.VNFeedback = { open: open, close: close, source: SOURCE };
})();