// 我的臺北: choose who you are and where you live → a short camera tour of the policies that touch you,
// a result card with your district's numbers, and a share image (1080×1350) made from the current view.
import { PERSONAS, policiesFor } from "./persona-data.js";
import { POLICIES } from "./policies.js";
import { STAGE } from "./shared.js";
import DISTRICTS from "../data/districts.json";
import { SITE } from "../config.js";

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAGE_HEX = { done: "#e0a800", ongoing: "#f2711c", planned: "#2e6be6" };

export function createPersona({ ui, world, focusPolicy, hasPin, showToday, flyToDistrict, snapshot }) {
  const modal = $("#me"),
    go = $("#me-go");
  const chosen = new Set();
  let district = null;
  let tour = 0; // bumps to cancel a running tour
  let last = null;

  // ---------- picker ----------
  modal.querySelectorAll("[data-persona]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.persona;
      chosen.has(id) ? chosen.delete(id) : chosen.add(id);
      b.setAttribute("aria-pressed", String(chosen.has(id)));
      go.disabled = chosen.size === 0;
    }),
  );
  modal.querySelectorAll("[data-district]").forEach((b) =>
    b.addEventListener("click", () => {
      district = district === b.dataset.district ? null : b.dataset.district;
      modal.querySelectorAll("[data-district]").forEach((o) => o.setAttribute("aria-pressed", String(o.dataset.district === district)));
    }),
  );
  go.addEventListener("click", () => run([...chosen], district));
  $("#me-close").addEventListener("click", () => (modal.hidden = true));
  $("#me-toggle").addEventListener("click", open);
  $("#share-close").addEventListener("click", () => ($("#share").hidden = true));

  function open() {
    ui.showOutro(false);
    modal.hidden = false;
  }

  // ---------- tour + result ----------
  async function run(ids, districtName) {
    ids = ids.filter((id) => PERSONAS.some((p) => p.id === id));
    if (!ids.length) return open();
    const d = DISTRICTS.find((x) => x.name === districtName) || null;
    modal.hidden = true;
    const query = `?me=${ids.join(",")}${d ? `&d=${encodeURIComponent(d.name)}` : ""}`;
    history.replaceState(null, "", query);
    last = { ids, d, policies: policiesFor(ids) };
    const run = ++tour;
    showToday();
    world.showDistrict(d?.outline || null);
    for (const id of last.policies.filter(hasPin).slice(0, 4)) {
      if (run !== tour) return;
      focusPolicy(id);
      await sleep(2600);
    }
    if (run !== tour) return;
    if (d) {
      flyToDistrict(d);
      await sleep(1300);
    }
    if (run === tour) showResult();
  }

  function districtLine(d) {
    return `${d.name}：上任後核准 ${d.stats.renewal} 個都更單元・地圖上 ${d.stats.schools} 所國中小（午餐全面免費）・${d.stats.youbike} 個 YouBike 站（前 30 分鐘免費）`;
  }

  function showResult() {
    const { ids, d, policies } = last;
    const items = policies.map((id) => POLICIES.find((p) => p.id === id)).filter(Boolean);
    const labels = PERSONAS.filter((p) => ids.includes(p.id));
    ui.showCustom(
      `<span class="chip" style="--c:var(--planned)">我的臺北</span>
      <h2>跟你有關的 ${items.length} 項政策</h2>
      <p class="when">${labels.map((p) => `${p.icon} ${esc(p.label)}`).join("　")}</p>
      ${d ? `<p class="me-district">${esc(districtLine(d))}</p>` : ""}
      <ul class="policy-list">${items
        .map(
          (p) =>
            `<li><button data-focus="${p.id}" style="--c:var(--${STAGE[p.status].key})"><i></i><span>${esc(p.name)}<small>${esc(STAGE[p.status].zh)}・${esc(p.when)}</small></span></button></li>`,
        )
        .join("")}</ul>
      <div class="me-actions">
        <button class="btn btn-primary" data-act="share">產生我的分享圖卡</button>
        <button class="btn" data-act="again">重新選擇</button>
      </div>`,
      (root) => {
        root.querySelectorAll("[data-focus]").forEach((b) => b.addEventListener("click", () => focusPolicy(b.dataset.focus)));
        root.querySelector('[data-act="share"]').addEventListener("click", share);
        root.querySelector('[data-act="again"]').addEventListener("click", open);
      },
    );
  }

  // ---------- share card ----------
  async function makeCard() {
    const { ids, d, policies } = last;
    const items = policies.map((id) => POLICIES.find((p) => p.id === id)).filter(Boolean);
    await Promise.all(['900 64px "Noto Sans TC"', '500 32px "Noto Sans TC"', '32px "Huninn"'].map((f) => document.fonts.load(f, "我的臺北做到了")));
    const W = 1080,
      H = 1350;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    // top: the city as it is on screen right now (cover-cropped)
    const shot = snapshot();
    const top = 560;
    const s = Math.max(W / shot.width, top / shot.height);
    g.drawImage(shot, (W - shot.width * s) / 2, (top - shot.height * s) / 2, shot.width * s, shot.height * s);
    // bottom panel with brand shapes
    g.fillStyle = "#ffffff";
    g.fillRect(0, top - 40, W, H - top + 40);
    g.fillStyle = "#ffdd33";
    g.beginPath();
    g.moveTo(W - 300, H);
    g.lineTo(W, H - 420);
    g.lineTo(W, H);
    g.fill();
    g.fillStyle = "#2e6be6";
    g.beginPath();
    g.arc(W - 40, H - 30, 150, 0, Math.PI * 2);
    g.fill();
    // brand plate over the photo
    g.fillStyle = "rgba(255,255,255,0.95)";
    roundRect(g, 40, 40, 360, 84, 22);
    g.fill();
    g.fillStyle = "#141a24";
    g.font = '900 40px "Noto Sans TC"';
    g.fillText(SITE.campaign, 70, 97);
    g.fillStyle = "#ffdd33";
    roundRect(g, 238, 64, 140, 38, 8);
    g.fill();
    g.fillStyle = "#141a24";
    g.font = '22px "Huninn"';
    g.fillText(SITE.campaignEn, 250, 91);
    // headline
    let y = top + 40;
    g.fillStyle = "#2e6be6";
    g.font = '30px "Huninn"';
    g.fillText(`我的臺北・${PERSONAS.filter((p) => ids.includes(p.id)).map((p) => p.icon).join(" ")}`, 60, y);
    y += 82;
    g.fillStyle = "#141a24";
    g.font = '900 66px "Noto Sans TC"';
    g.fillText(`跟我有關的 ${items.length} 項政策`, 60, y);
    y += 30;
    g.font = '500 34px "Noto Sans TC"';
    const shown = d ? 5 : 7; // leave room for the district line
    for (const p of items.slice(0, shown)) {
      y += 58;
      g.fillStyle = STAGE_HEX[p.status];
      g.beginPath();
      g.arc(76, y - 12, 12, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#141a24";
      g.fillText(p.name, 104, y);
      const nameW = g.measureText(p.name).width;
      g.fillStyle = STAGE_HEX[p.status];
      g.font = '28px "Huninn"';
      g.fillText(STAGE[p.status].zh, 104 + nameW + 18, y);
      g.font = '500 34px "Noto Sans TC"';
    }
    if (items.length > shown) {
      y += 50;
      g.fillStyle = "#5b6577";
      g.fillText(`…還有 ${items.length - shown} 項`, 104, y);
    }
    if (d) {
      y += 64;
      g.fillStyle = "#1e2a78";
      g.font = '500 28px "Noto Sans TC"';
      wrap(g, districtLine(d), 60, y, W - 360, 40);
    }
    g.fillStyle = "#141a24";
    g.font = '28px "Huninn"';
    g.fillText(`${SITE.short}・${new URL(SITE.url).host}`, 60, H - 74);
    g.fillStyle = "#6b7280";
    g.font = '500 20px "Noto Sans TC"';
    g.fillText(`出資者：${SITE.sponsor}・${SITE.adLabel}`, 60, H - 40);
    return c;
  }

  async function share() {
    const canvas = await makeCard();
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    const url = location.origin + location.pathname + location.search;
    const file = new File([blob], "my-taipei.png", { type: "image/png" });
    const text = `我的臺北：跟我有關的 ${last.policies.length} 項政策`;
    if (navigator.canShare?.({ files: [file] })) {
      try {
        return await navigator.share({ files: [file], title: text, text: `${text} ${url}` });
      } catch {
        /* closed the share sheet: fall through to the preview */
      }
    }
    const img = $("#share-img"),
      save = $("#share-save");
    URL.revokeObjectURL(save.href);
    img.src = save.href = URL.createObjectURL(blob);
    $("#share-go").hidden = !navigator.share;
    $("#share-go").onclick = () => navigator.share({ title: text, text, url }).catch(() => {});
    $("#share-link").onclick = async () => {
      await navigator.clipboard.writeText(url);
      $("#share-link").textContent = "已複製連結";
    };
    $("#share").hidden = false;
  }

  return {
    open,
    run,
    interrupt: () => tour++,
  };
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function wrap(g, text, x, y, maxW, lh) {
  let line = "";
  for (const ch of text) {
    if (g.measureText(line + ch).width > maxW) {
      g.fillText(line, x, y);
      line = ch;
      y += lh;
    } else line += ch;
  }
  g.fillText(line, x, y);
}
