/* ============================================================
   立绘 · 表情差分切换
   九张图同画布 780x1112、像素级对位，交叉淡入无位移
   挂在 body 上、贴底偏左 = 人物站在场景里，压在对话框之下
   VNAvatar.set("smile") —— 未知 / 重复的情绪自动忽略
   ============================================================ */
(function () {
  "use strict";

  var DIR = "assets/cyc/";
  var MOODS = ["calm", "smile", "happy", "laugh", "surprise", "think", "shy", "serious", "sad"];
  var at = 0, cur = null, layers = null;
  var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  function build(mood) {
    var box = document.createElement("div");
    box.className = "vn-avatar";
    box.setAttribute("aria-hidden", "true");
    layers = [];
    for (var i = 0; i < 2; i++) {
      var im = document.createElement("img");
      im.alt = "";
      im.decoding = "async";
      box.appendChild(im);
      layers.push(im);
    }
    layers[0].src = DIR + mood + ".webp";
    layers[0].className = "on";
    layers[1].src = layers[0].src;
    document.body.insertBefore(box, document.body.firstChild);
    window.requestAnimationFrame(function () { box.classList.add("on"); });
    at = 0;
    return true;
  }

  function set(mood, instant) {
    if (MOODS.indexOf(mood) < 0) return;
    if (!layers) { if (build(mood)) cur = mood; return; }
    if (mood === cur && !instant) return;
    cur = mood;
    var show = layers[1 - at], hide = layers[at];
    show.src = DIR + mood + ".webp";
    show.className = "on";
    hide.className = "";
    at = 1 - at;
    if (reduce || instant) {
      show.style.transition = "none";
      hide.style.transition = "none";
    }
  }

  function preload() {
    for (var i = 0; i < MOODS.length; i++) {
      if (MOODS[i] === cur) continue;
      var im = new Image();
      im.src = DIR + MOODS[i] + ".webp";
    }
  }

  window.VNAvatar = { set: set, moods: MOODS, now: function () { return cur; } };

  function start() {
    /* 只在没人定过情绪时才用 body 上的默认值 —— vn.js 的 DOMContentLoaded
       比这里先注册（脚本在前），所以「第一句台词」的表情往往已经 set 过了；
       这里再无条件 set 一次会把那一句的表情盖掉（首句表情就白写了）。 */
    if (cur === null) set(document.body.getAttribute("data-avatar") || "calm");
    window.setTimeout(preload, 900);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();