// Downloads the raw geodata the prototype is built from into data-raw/.
// Sources: AWS Terrain Tiles (terrarium), OpenStreetMap via Overpass, Taipei YouBike open data.
import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BBOX, TERRAIN_ZOOM, tileRange } from "../src/scene/geo.js";

const RAW = fileURLToPath(new URL("../data-raw/", import.meta.url));
const UA = "taipei-progressive-prototype/0.1 (data prep)";
const force = process.argv.includes("--force");

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function download(url, file, init = {}) {
  const out = join(RAW, file);
  if (!force && (await exists(out))) return console.log("skip", file);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { ...init, headers: { "User-Agent": UA, ...(init.headers || {}) } });
    if (res.ok) {
      await writeFile(out, Buffer.from(await res.arrayBuffer()));
      return console.log("ok  ", file);
    }
    console.warn(`${res.status} ${file} (attempt ${attempt})`);
    await new Promise((r) => setTimeout(r, 4000 * attempt));
  }
  throw Error(`failed: ${file}`);
}

const overpass = (query, file) =>
  download("https://overpass-api.de/api/interpreter", file, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(`[out:json][timeout:180];${query}`),
  });

await mkdir(join(RAW, "terrain"), { recursive: true });

const { x0, x1, y0, y1 } = tileRange(TERRAIN_ZOOM);
for (let x = x0; x <= x1; x++)
  for (let y = y0; y <= y1; y++)
    await download(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${TERRAIN_ZOOM}/${x}/${y}.png`, `terrain/${TERRAIN_ZOOM}-${x}-${y}.png`);

const bb = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
await overpass(`relation["boundary"="administrative"]["name"="臺北市"];out geom;`, "boundary.json");
await overpass(
  `(way["natural"="water"](${bb});relation["natural"="water"](${bb});way["waterway"="riverbank"](${bb});relation["waterway"="riverbank"](${bb}););out geom;`,
  "water.json",
);
await overpass(`way["highway"~"^(motorway|trunk|primary|secondary)$"](${bb});out geom;`, "roads.json");
await overpass(`area["name"="臺北市"]["boundary"="administrative"]->.a;nwr["amenity"="school"](area.a);out center tags;`, "schools.json");
await overpass(`way["aeroway"~"^(runway|taxiway|apron)$"](25.055,121.52,25.085,121.58);out geom;`, "airport.json");
await download("https://tcgbusfs.blob.core.windows.net/dotapp/youbike/v2/youbike_immediate.json", "youbike.json");


// Named anchors for the policy landmarks (centres only; the scene draws its own symbolic models)
await overpass(
  `(nwr["name"~"臺北大巨蛋|台北大巨蛋|臺北101|台北101|臺北市政府|臺北市立動物園|北投士林科技園區|國父紀念館|松山機場|臺北松山機場"](${bb});way["junction"="roundabout"](25.008,121.526,25.021,121.542););out center tags;`,
  "places.json",
);
// real building footprints around the key landmarks (信義, 公館, 北士科, 松山機場)
for (const [name, lat, lon, r] of [
  ["xinyi", 25.0385, 121.5615, 1300],
  ["gongguan", 25.0136, 121.5345, 600],
  ["beishike", 25.1005, 121.5115, 1000],
  ["airport", 25.0669, 121.552, 1400],
])
  await overpass(`(way["building"](around:${r},${lat},${lon});relation["building"](around:${r},${lat},${lon}););out geom tags;`, `buildings-${name}.json`);
// 東環段 station anchors: named roads and parks that the MRT bureau uses to describe each station
await overpass(
  `(way["highway"]["name"~"^(樂群二路|敬業四路|瑞光路|陽光街321巷|舊宗路一段|舊宗路二段|民權東路六段|新湖一路|松山路|松隆路|忠孝東路五段|松仁路|信義路五段|吳興街|新光路二段|南港路一段|成美橋)$"](25.0,121.53,25.09,121.6);way["leisure"="park"]["name"~"洲子二號|大港墘|瑞光公園"](25.06,121.56,25.09,121.6);nwr["railway"="station"]["name"~"^(劍南路|動物園|松山|永春|象山)$"](24.99,121.53,25.09,121.6););out geom tags;`,
  "eastring.json",
);
// landmark outlines: NVIDIA Constellation site (T17/T18), 金仁寶 T16, 臺北大巨蛋, 市政府, 國父紀念館, 臺北101
await overpass(`way(id:1309916527,1309916528,442195153,142113976,189788192,1159328965);out geom tags;`, "landmark-ways.json");
// the 12 districts, for 我的臺北
await overpass(`area["name"="臺北市"]["admin_level"="4"]->.a;rel(area.a)["boundary"="administrative"]["admin_level"="7"];out geom;`, "districts.json");
// 都更: self-initiated renewal-unit cases (都更處 GIS API) and Taipei land-section boundaries (地政局)
await download("https://gis.uro.taipei/UpdateAreaWebAPI/api/Case", "renewal-cases.json");
await download("https://data.taipei/api/dataset/4f3d2280-1ebc-4bba-8ebf-66953403732b/resource/86430589-4e8b-4e21-9d5f-08b0e5c2ce3f/download", "landsect.zip");
console.log("done");
