// Real urban-renewal cases for the 都更 layer → public/data/renewal.json
//   cases:    臺北市都市更新處「自行劃定更新單元查詢」API (gis.uro.taipei, listed on data.taipei)
//   location: 臺北市地政局「臺北市數值地籍地段圖」— each case is placed inside the land section (小段) named in its title
// Kept: self-initiated renewal units (自行劃定) approved between 上任那天 and the data date, not later rejected / withdrawn / lapsed.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { project } from "../src/scene/geo.js";

const raw = (f) => fileURLToPath(new URL(`../data-raw/${f}`, import.meta.url));
const out = fileURLToPath(new URL("../public/data/renewal.json", import.meta.url));
const FROM = "2022-12-25",
  TO = "2026-10-23";
const DROP = new Set(["已駁回", "已撤回", "已失效", "編輯中"]);

// ---------- case list: the API returns one JSON string whose values are not always escaped, so parse field by field ----------
function parseCases(text) {
  let s = JSON.parse(text);
  if (Array.isArray(s)) s = s[0];
  s = s.trim().replace(/^\[?\{?/, "").replace(/\}?\]?$/, "");
  const keys = ["ID", "Dist", "Define", "Name", "Status", "CaseMode", "Seat", "Area", "ApprovedDate", "ApprovedNum"];
  return s.split(/\},\{(?="ID")/).map((rec) => {
    const c = {};
    keys.forEach((k, i) => {
      const next = keys[i + 1];
      const m = rec.match(new RegExp(`"${k}":(.*?)${next ? `,"${next}":` : "$"}`, "s"));
      let v = m ? m[1].trim() : null;
      if (v === "null") v = null;
      else if (v && v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      c[k] = v;
    });
    return c;
  });
}

// ---------- minimal zip reader: sizes come from the central directory (local headers may defer them) ----------
function unzip(buf) {
  let eocd = buf.length - 22;
  while (eocd > 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10),
      size = buf.readUInt32LE(p + 20),
      nameLen = buf.readUInt16LE(p + 28),
      extraLen = buf.readUInt16LE(p + 30),
      commentLen = buf.readUInt16LE(p + 32),
      local = buf.readUInt32LE(p + 42);
    const name = buf.toString("latin1", p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    files[name.toUpperCase()] = method === 8 ? inflateRawSync(data) : data;
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// ---------- TWD97 / TM2 (EPSG:3826) → WGS84 ----------
function tm2ToLatLon(x, y) {
  const a = 6378137,
    f = 1 / 298.257222101,
    k0 = 0.9999,
    lon0 = (121 * Math.PI) / 180,
    dx = 250000;
  const e2 = f * (2 - f),
    ep2 = e2 / (1 - e2);
  const M = y / k0,
    mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 = mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) + ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu);
  const C1 = ep2 * Math.cos(phi1) ** 2,
    T1 = Math.tan(phi1) ** 2,
    N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2),
    R1 = (a * (1 - e2)) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5,
    D = (x - dx) / (N1 * k0);
  const lat = phi1 - ((N1 * Math.tan(phi1)) / R1) * ((D * D) / 2 - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24 + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720);
  const lon = lon0 + (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) / Math.cos(phi1);
  return [(lat * 180) / Math.PI, (lon * 180) / Math.PI];
}

// ---------- land sections: dBase attributes + polygon rings in local units ----------
function readSections(files) {
  const dbf = files["LANDSECMAP.DBF"],
    shp = files["LANDSECMAP.SHP"];
  const n = dbf.readUInt32LE(4),
    hlen = dbf.readUInt16LE(8),
    rlen = dbf.readUInt16LE(10);
  const fields = [];
  for (let o = 32; dbf[o] !== 0x0d; o += 32) fields.push(dbf[o + 16]);
  const utf8 = new TextDecoder("utf-8"); // the .cpg says UTF-8, and it is
  const attrs = [];
  for (let i = 0; i < n; i++) {
    let o = hlen + i * rlen + 1;
    const vals = fields.map((len) => {
      const v = utf8.decode(dbf.subarray(o, o + len)).trim();
      o += len;
      return v;
    });
    attrs.push({ name: vals[4], district: vals[5] });
  }
  const sections = [];
  let p = 100,
    i = 0;
  while (p < shp.length) {
    const len = shp.readInt32BE(p + 4) * 2;
    const r = p + 8;
    if (shp.readInt32LE(r) === 5) {
      const parts = shp.readInt32LE(r + 36),
        pts = shp.readInt32LE(r + 40);
      const starts = [];
      for (let k = 0; k < parts; k++) starts.push(shp.readInt32LE(r + 44 + k * 4));
      starts.push(pts);
      const base = r + 44 + parts * 4;
      const rings = [];
      for (let k = 0; k < parts; k++) {
        const ring = [];
        for (let j = starts[k]; j < starts[k + 1]; j++) ring.push(project(...tm2ToLatLon(shp.readDoubleLE(base + j * 16), shp.readDoubleLE(base + j * 16 + 8))));
        rings.push(ring);
      }
      sections.push({ ...attrs[i], rings });
    }
    p += 8 + len;
    i++;
  }
  return sections;
}

const inside = (pt, rings) => {
  let c = false;
  for (const r of rings)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++)
      if (r[i][1] > pt[1] !== r[j][1] > pt[1] && pt[0] < ((r[j][0] - r[i][0]) * (pt[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
  return c;
};
function seeded(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
}
const decimalYear = (iso) => {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z"),
    y = d.getUTCFullYear();
  return y + (d - Date.UTC(y, 0, 1)) / (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1));
};

const cases = parseCases(await readFile(raw("renewal-cases.json"), "utf8"));
const sections = readSections(unzip(await readFile(raw("landsect.zip"))));
const byName = new Map();
for (const s of sections) byName.set(`${s.district}|${s.name}`, s), byName.set(s.name, byName.get(s.name) || s);

const SECT = /([一-鿿]{1,5}段(?:[一二三四五六七八九十]+小段)?)[\d-]+地號/;
const picked = cases.filter((c) => c.Define === "自行劃定" && c.ApprovedDate && c.ApprovedDate.slice(0, 10) >= FROM && c.ApprovedDate.slice(0, 10) <= TO && !DROP.has(c.Status));
const placed = [],
  unplaced = [];
for (const c of picked) {
  const m = (c.Name || "").replace(/^[^區]*區/, "").match(SECT);
  const sec = m && (byName.get(`${c.Dist}|${m[1]}`) || byName.get(m[1]));
  if (!sec) {
    unplaced.push(c.ID);
    continue;
  }
  // a reproducible point inside the section
  const rnd = seeded(c.ID);
  const xs = sec.rings.flat().map((p) => p[0]),
    zs = sec.rings.flat().map((p) => p[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  let pt = null;
  for (let k = 0; k < 200 && !pt; k++) {
    const q = [x0 + rnd() * (x1 - x0), z0 + rnd() * (z1 - z0)];
    if (inside(q, sec.rings)) pt = q;
  }
  pt ||= [(x0 + x1) / 2, (z0 + z1) / 2];
  const ha = Math.min(2, Math.max(0.05, parseFloat(c.Area) || 0.2));
  placed.push([+pt[0].toFixed(2), +pt[1].toFixed(2), +decimalYear(c.ApprovedDate).toFixed(4), +Math.sqrt(ha).toFixed(2), c.Status === "已核准" || c.Status === "已公告" ? 1 : 0, c.ID]);
}
placed.sort((a, b) => a[2] - b[2]);
await writeFile(
  out,
  JSON.stringify({
    source: "臺北市都市更新處 自行劃定更新單元查詢 API；臺北市地政局 數值地籍地段圖",
    range: [FROM, TO],
    total: picked.length,
    unplaced,
    // [x, z, approved (decimal year), sqrt(area in ha), 1 = 已核准/已公告 · 0 = 單元階段已審查完畢 等, case ID]
    cases: placed,
  }),
);
console.log(`renewal: ${picked.length} cases in range, ${placed.length} placed, ${unplaced.length} without a matching section`);
