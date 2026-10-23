// Share images (1200×630) rendered at build time: satori lays out the card, resvg rasterises it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { BRAND, SITE } from "../config.js";

const font = (f) => readFileSync(join(process.cwd(), "assets/fonts", f)); // from the project root (the module is bundled before it runs)
const FONTS = [
  { name: "Noto Sans TC", data: font("NotoSansTC-500.ttf"), weight: 500, style: "normal" },
  { name: "Noto Sans TC", data: font("NotoSansTC-900.ttf"), weight: 900, style: "normal" },
  { name: "Huninn", data: font("Huninn.ttf"), weight: 400, style: "normal" },
];

// tiny element helper so the layout reads like markup
const h = (type, style, ...children) => ({ type, props: { style: { display: "flex", ...style }, children: children.flat().filter((c) => c !== null && c !== false) } });
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function frame({ chip, chipColor, title, sub, body }) {
  const host = new URL(SITE.url).host;
  return h(
    "div",
    { width: 1200, height: 630, background: "#ffffff", position: "relative", fontFamily: "Noto Sans TC", color: BRAND.ink, overflow: "hidden" },
    // brand shapes, after the 台北安可 main visual: a yellow wedge, a blue disc and a sky-blue stick
    h("div", { position: "absolute", right: -160, top: -220, width: 620, height: 620, background: BRAND.yellow, transform: "rotate(28deg)" }),
    h("div", { position: "absolute", right: -120, bottom: -200, width: 520, height: 520, borderRadius: 520, background: BRAND.blue }),
    h("div", { position: "absolute", right: 120, bottom: 150, width: 300, height: 74, borderRadius: 74, background: BRAND.sky, transform: "rotate(-38deg)" }),
    h(
      "div",
      { position: "absolute", left: 64, top: 56, width: 780, height: 518, flexDirection: "column", justifyContent: "space-between" },
      h(
        "div",
        { flexDirection: "column" },
        h(
          "div",
          { alignItems: "center", gap: 14 },
          h("div", { fontWeight: 900, fontSize: 30, letterSpacing: 2 }, SITE.campaign),
          h("div", { fontFamily: "Huninn", fontSize: 18, background: BRAND.yellow, padding: "2px 10px", borderRadius: 6 }, SITE.campaignEn),
          chip && h("div", { fontFamily: "Huninn", fontSize: 22, color: "#fff", background: chipColor, padding: "4px 16px", borderRadius: 40, marginLeft: 8 }, chip),
        ),
        // title: a string, or an array of lines when the break matters
        h(
          "div",
          { flexDirection: "column", fontWeight: 900, fontSize: [].concat(title).join("").length > 12 ? 66 : 80, lineHeight: 1.18, marginTop: 34, maxWidth: 760 },
          [].concat(title).map((line) => h("div", {}, line)),
        ),
        sub && h("div", { fontSize: 30, color: "#4b5565", marginTop: 14 }, sub),
        body && h("div", { fontSize: 28, lineHeight: 1.5, marginTop: 22, maxWidth: 720, color: BRAND.ink }, body),
      ),
      h(
        "div",
        { flexDirection: "column", gap: 6 },
        h("div", { fontFamily: "Huninn", fontSize: 24, color: BRAND.navy }, `${SITE.short}・每一項都附官方來源・${host}`),
        h("div", { fontSize: 16, color: "#6b7280" }, `出資者：${SITE.sponsor}・${SITE.adLabel}`),
      ),
    ),
  );
}

export async function renderCard(opts) {
  const svg = await satori(frame(opts), { width: 1200, height: 630, fonts: FONTS });
  return new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
}

export const cardForPolicy = (p) => ({
  chip: `${p.stage.zh}・${p.stage.note}`,
  chipColor: p.stage.hex,
  title: p.name,
  sub: p.when,
  body: clip(p.after, 58),
});

export const cardForSite = () => ({
  title: ["每一個願景，", "都蓋在做到的事上。"],
  sub: "從 2022.12.25 上任那天，到下一個臺北",
  body: "走進一座 3D 臺北：看見做到的事、正在做的事，和接下來的願景。",
});
