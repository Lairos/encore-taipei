// DOM overlay: opening counter and captions, timeline, time curtain, pins and the policy card.
import * as THREE from "three";
import { STAGE, STOPS, DATES, formatDate, dateToStop } from "./shared.js";
import { POLICIES } from "./policies.js";

const $ = (s) => document.querySelector(s);
const cssc = (st) => `var(--${st.key})`; // stage colour follows the active theme
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function stageAt(p, d) {
  if (d < p.event) return p.status === "planned" ? STAGE.planned : STAGE.start;
  return STAGE[p.status];
}
export function stopLabel(d) {
  if (d <= DATES.inauguration + 0.01) return "上任那天";
  if (Math.abs(d - DATES.today) < 0.02) return "今天";
  if (d < DATES.today) return "做到了";
  return d >= DATES.plan2027 + 0.3 ? "願景" : "接下來";
}

export function createUI({ onScrub, onCurtain, onSplit, onPin, onSkip, onCta, onStyle }) {
  const body = document.body;

  // ---------- opening ----------
  const counterDate = $("#counter-date"),
    counterStage = $("#counter-stage");
  const captions = $("#captions");
  $("#skip").addEventListener("click", onSkip);
  $("#cta-curtain").addEventListener("click", () => onCta("curtain"));
  $("#cta-explore").addEventListener("click", () => onCta("explore"));
  $("#cta-me").addEventListener("click", () => onCta("me"));

  function caption(p, ev, label = p.name) {
    const st = STAGE[p.status];
    const li = document.createElement("li");
    li.style.setProperty("--c", cssc(st));
    li.innerHTML = `<i></i><time>${esc(formatDate(ev).slice(0, 7))}</time><span>${esc(label)}</span>`;
    captions.prepend(li);
    while (captions.children.length > 3) captions.lastElementChild.remove();
    setTimeout(() => li.classList.add("out"), 2600);
    setTimeout(() => li.remove(), 3200);
  }

  // ---------- timeline ----------
  const timeline = $("#timeline"),
    thumb = $("#thumb"),
    fill = $("#track-fill"),
    stops = $("#stops");
  const STOP_TEXT = [
    ["上任那天", "2022.12", cssc(STAGE.start)],
    ["今天", "2026.10", cssc(STAGE.done)],
    ["2027", "規劃", cssc(STAGE.planned)],
    ["願景", "2030+", cssc(STAGE.planned)],
  ];
  STOP_TEXT.forEach(([a, b, c], i) => {
    const btn = document.createElement("button");
    btn.className = "stop";
    btn.style.left = `${(i / 3) * 100}%`;
    btn.style.setProperty("--c", c);
    btn.innerHTML = `<span>${a} <small>${b}</small></span>`;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onScrub(i, { animate: true });
    });
    stops.appendChild(btn);
  });
  let dragging = false;
  const sFromEvent = (e) => {
    const r = timeline.getBoundingClientRect();
    return Math.min(3, Math.max(0, ((e.clientX - r.left) / r.width) * 3));
  };
  timeline.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".stop")) return;
    dragging = true;
    timeline.setPointerCapture(e.pointerId);
    onScrub(sFromEvent(e), { animate: false });
  });
  timeline.addEventListener("pointermove", (e) => dragging && onScrub(sFromEvent(e), { animate: false }));
  timeline.addEventListener("pointerup", () => (dragging = false));
  thumb.addEventListener("keydown", (e) => {
    const s = dateToStop(currentDate);
    if (e.key === "ArrowRight") onScrub(Math.min(3, Math.round(s) + 1), { animate: true });
    if (e.key === "ArrowLeft") onScrub(Math.max(0, Math.round(s) - 1), { animate: true });
  });

  // ---------- curtain ----------
  const curtain = $("#curtain"),
    handle = $("#curtain-handle"),
    toggle = $("#curtain-toggle");
  toggle.addEventListener("click", () => onCurtain(toggle.getAttribute("aria-pressed") !== "true"));
  let dragC = false;
  handle.addEventListener("pointerdown", (e) => {
    dragC = true;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener("pointermove", (e) => dragC && onSplit(Math.min(0.97, Math.max(0.03, e.clientX / innerWidth))));
  handle.addEventListener("pointerup", () => (dragC = false));

  // ---------- style toggle & game status bar ----------
  const styleBtn = $("#style-toggle");
  let isGame = false;
  styleBtn.addEventListener("click", () => onStyle(!isGame));
  const statusEls = { done: $("#st-done"), ongoing: $("#st-ongoing"), planned: $("#st-planned") };
  function setStatus(d) {
    const n = (st) => POLICIES.filter((p) => p.status === st && p.event <= d).length;
    statusEls.done.textContent = n("done");
    statusEls.ongoing.textContent = n("ongoing");
    statusEls.planned.textContent = POLICIES.filter((p) => p.status === "planned").length;
  }

  // ---------- pins ----------
  const pinsEl = $("#pins");
  const pins = new Map();
  function addPin(id, anchor, policy) {
    const el = document.createElement("button");
    el.className = "pin";
    el.innerHTML = `<i></i><span>${esc(policy.pinLabel || policy.name)}</span><small></small>`;
    el.addEventListener("click", () => onPin(id));
    pinsEl.appendChild(el);
    pins.set(id, { el, anchor, policy, small: el.querySelector("small") });
  }
  const v = new THREE.Vector3();
  const pinRects = [];
  function updatePins(camera, dateRight, curtainOn, split) {
    const w = innerWidth,
      h = innerHeight;
    pinRects.length = 0;
    // pins in policy order; one that would overlap a pin already placed waits until the view zooms in
    for (const pin of pins.values()) {
      v.copy(pin.anchor).project(camera);
      let visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      const x = (v.x * 0.5 + 0.5) * w,
        y = (-v.y * 0.5 + 0.5) * h;
      if (visible) {
        pin.el.style.display = "";
        // size measured once per theme (fonts differ), so pins and map labels can keep clear of each other
        if (!pin.w) [pin.w, pin.h] = [pin.el.offsetWidth, pin.el.offsetHeight];
        const r = [x - pin.w / 2, y - 14 - pin.h, x + pin.w / 2, y];
        const active = pin.el.classList.contains("active");
        if (!active && pinRects.some((t) => r[0] < t[2] + 2 && r[2] > t[0] - 2 && r[1] < t[3] && r[3] > t[1])) visible = false;
        else pinRects.push(r);
      }
      pin.el.style.display = visible ? "" : "none";
      if (!visible) continue;
      pin.el.style.transform = `translate(${x}px, ${y - 14}px) translate(-50%, -100%)`;
      const d = curtainOn && x / w < split ? DATES.inauguration : dateRight;
      const st = stageAt(pin.policy, d);
      pin.el.style.setProperty("--c", cssc(st));
      pin.el.classList.toggle("planned-future", pin.policy.status === "planned" && d < pin.policy.event);
      pin.small.textContent = pin.policy.status === "planned" && d < pin.policy.event ? "規劃" : st.zh;
    }
  }

  // ---------- card ----------
  const card = $("#card"),
    cardBody = $("#card-body");
  $("#card-close").addEventListener("click", () => hideCard());
  function showPolicy(p, d) {
    const st = stageAt(p, Math.max(d, p.event));
    for (const pin of pins.values()) pin.el.classList.toggle("active", pin.policy === p);
    card.style.setProperty("--c", cssc(st));
    cardBody.innerHTML = `
      <span class="chip" style="--c:${cssc(st)}">${esc(st.zh)}</span>${p.approx ? `<span class="chip approx">${esc(p.approxLabel || "位置示意")}</span>` : ""}
      <h2>${esc(p.name)}</h2>
      <p class="when">${esc(p.when)}</p>
      <div class="ba" style="--c:${cssc(st)}">
        <div><b>${p.status === "planned" ? "現況" : "上任那天"}</b>${esc(p.before)}</div>
        <div class="now"><b>${p.status === "planned" ? "接下來" : "現在"}</b>${esc(p.after)}</div>
      </div>
      ${p.numbers ? `<p class="numbers">${esc(p.numbers)}</p>` : ""}
      <p class="caveat"><b>怎麼讀：</b>${esc(p.caveat)}</p>
      <ul class="sources">${p.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)} ↗</a></li>`).join("")}</ul>
      <p class="card-more"><a href="/policy/${esc(p.id)}/">完整說明與分享 →</a></p>`;
    card.hidden = false;
  }
  function showCustom(html, mount) {
    for (const pin of pins.values()) pin.el.classList.remove("active");
    cardBody.innerHTML = html;
    mount?.(cardBody);
    card.hidden = false;
  }
  function showList(d) {
    for (const pin of pins.values()) pin.el.classList.remove("active");
    const groups = [
      ["做到了", POLICIES.filter((p) => p.status === "done")],
      ["正在做", POLICIES.filter((p) => p.status === "ongoing")],
      ["接下來", POLICIES.filter((p) => p.status === "planned")],
    ];
    cardBody.innerHTML = `<h2>全部政策</h2><p class="when">依報告標示狀態；點選查看上任前後與來源</p>${groups
      .map(
        ([title, list]) =>
          `<p class="list-head">${title} ${list.length}</p><ul class="policy-list">${list
            .map((p) => `<li><button data-id="${p.id}" style="--c:${cssc(STAGE[p.status])}"><i></i><span>${esc(p.name)}<small>${esc(p.when)}</small></span></button></li>`)
            .join("")}</ul>`,
      )
      .join("")}`;
    cardBody.querySelectorAll("[data-id]").forEach((b) => b.addEventListener("click", () => onPin(b.dataset.id)));
    card.hidden = false;
  }
  function hideCard() {
    card.hidden = true;
    for (const pin of pins.values()) pin.el.classList.remove("active");
  }
  $("#list-count").textContent = POLICIES.length;
  $("#list-toggle").addEventListener("click", () => (card.hidden ? showList(currentDate) : hideCard()));

  let currentDate = DATES.today;
  return {
    caption,
    addPin,
    updatePins,
    pinRects: () => pinRects,
    showPolicy,
    showCustom,
    hideCard,
    setCounter(d) {
      counterDate.textContent = formatDate(d);
      counterStage.textContent = stopLabel(d);
    },
    setTheme(game) {
      if (game === isGame) return;
      isGame = game;
      body.classList.toggle("is-game", game);
      for (const pin of pins.values()) pin.w = 0;
      styleBtn.textContent = game ? "☾ 寫實夜景" : "▦ 模擬城市";
      styleBtn.setAttribute("aria-label", game ? "切換成寫實夜景" : "切換成模擬城市風格");
    },
    setTimeline(d) {
      currentDate = d;
      setStatus(d);
      const s = dateToStop(d);
      thumb.style.left = `${(s / 3) * 100}%`;
      fill.style.width = `${(s / 3) * 100}%`;
      fill.style.setProperty("--split", `${Math.min(100, (1 / Math.max(s, 0.001)) * 100)}%`);
      thumb.setAttribute("aria-valuenow", s.toFixed(2));
      $("#readout-stage").textContent = stopLabel(d);
      $("#future-note").hidden = d <= DATES.today + 0.02;
      $("#readout-date").textContent = formatDate(d);
      $("#curtain-right-title").textContent = stopLabel(d);
      $("#curtain-right-date").textContent = formatDate(d);
      stops.querySelectorAll(".stop").forEach((b, i) => b.classList.toggle("active", Math.abs(STOPS[i] - d) < 0.02));
    },
    setCurtain(on, split) {
      curtain.hidden = !on;
      toggle.setAttribute("aria-pressed", String(on));
      curtain.style.setProperty("--x", `${split * 100}%`);
    },
    setMode(mode) {
      body.classList.toggle("is-opening", mode === "opening");
    },
    showOutro(show) {
      $("#outro").hidden = !show;
      body.classList.toggle("is-outro", show);
      if (show) captions.replaceChildren();
    },
    loaded() {
      $("#loading").classList.add("gone");
    },
  };
}
