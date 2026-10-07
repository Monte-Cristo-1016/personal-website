/* ============================================================
   贰 · 场景切换 —— 黑屏快闪换景 + 打开那个方向的对话窗
   默认「日常」= 卧室；运动 = 球场；游戏 / 学习 = 书房
   每个方向的一句台词、三个快捷提问、表情，都写在 clone.js 的 TOPICS 里
   ============================================================ */
(function () {
  "use strict";

  var SCENES = {
    daily: { img: "assets/room.webp",  pos: "50% 58%", filter: "saturate(1.06) brightness(1.03)", alt: "午后的卧室，阳光落在木地板上" },
    sport: { img: "assets/field.webp", pos: "50% 56%", filter: "saturate(1.10) brightness(1.05)", alt: "阳光下的学校足球场，蓝天白云" },
    game:  { img: "assets/study.webp", pos: "50% 54%", filter: "saturate(1.06) brightness(1.06)", alt: "摆着电脑的书房，屏幕亮着" },
    study: { img: "assets/study.webp", pos: "50% 46%", filter: "saturate(.94) brightness(1.02)", alt: "摆着电脑的书房，桌灯照着书本" }
  };
  var FLASH_MID = 210;                       /* 全黑那一刻（毫秒） */
  var FLASH_END = 620;                       /* 快闪结束 */
  var bg = document.querySelector(".vn-bg");
  var curtain = document.querySelector(".vn-curtain");
  var btns = document.querySelectorAll(".vn-scene-btn");
  var cur = "daily";
  var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  function paint(el, key) {
    var s = SCENES[key];
    if (!el || !s) return;
    el.style.backgroundImage = 'url("' + s.img + '")';
    el.style.setProperty("--vn-bg-pos", s.pos);
    el.style.setProperty("--vn-bg-filter", s.filter);
  }

  function sync(key) {
    var i, on;
    for (i = 0; i < btns.length; i++) {
      on = btns[i].getAttribute("data-scene") === key;
      btns[i].classList.toggle("on", on);
      btns[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
    if (bg && SCENES[key]) bg.setAttribute("aria-label", SCENES[key].alt);
  }
  function go(key) {
    var s = SCENES[key];
    if (!s) return;
    cur = key;
    sync(key);
    var apply = function () {                 /* 全黑那一瞬才换，不会看到画面抽动 */
      if (bg) paint(bg, key);
      /* 换好景就把这个方向的对话窗打开：开场白、快捷提问、表情都在 clone.js 里 */
      if (window.VNopenTopic) window.VNopenTopic(key);
    };
    if (reduce || !curtain) { apply(); return; }
    curtain.classList.add("flash");
    window.setTimeout(apply, FLASH_MID);
    window.setTimeout(function () { curtain.classList.remove("flash"); }, FLASH_END);
  }

  var i;
  for (i = 0; i < btns.length; i++) {
    btns[i].addEventListener("click", function (e) {
      e.preventDefault();
      go(this.getAttribute("data-scene"));
    });
  }

  (function preload() {                        /* 预热，切换时不闪 */
    var seen = {}, k, im;
    for (k in SCENES) {
      if (seen[SCENES[k].img]) continue;
      seen[SCENES[k].img] = 1;
      im = new Image();
      im.src = SCENES[k].img;
    }
  })();

  paint(bg, cur);
  sync(cur);
})();