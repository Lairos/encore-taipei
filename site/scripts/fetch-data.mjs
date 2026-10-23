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
// 東環段 station anchors: named roads and parks that the MRT bureau uses to describe each station
await overpass(
  `(way["highway"]["name"~"^(樂群二路|敬業四路|瑞光路|陽光街321巷|舊宗路一段|舊宗路二段|民權東路六段|新湖一路|松山路|松隆路|忠孝東路五段|松仁路|信義路五段|吳興街|新光路二段|南港路一段|成美橋)$"](25.0,121.53,25.09,121.6);way["leisure"="park"]["name"~"洲子二號|大港墘|瑞光公園"](25.06,121.56,25.09,121.6);nwr["railway"="station"]["name"~"^(劍南路|動物園|松山|永春|象山)$"](24.99,121.53,25.09,121.6););out geom tags;`,
  "eastring.json",
);
// landmark outlines: NVIDIA Constellation site (T17/T18), 金仁寶 T16, 臺北大巨蛋, 市政府, 國父紀念館, 臺北101
await overpass(`way(id:1309916527,1309916528,442195153,142113976,189788192,1159328965);out geom tags;`, "landmark-ways.json");
// representative buildings, a few per district, drawn by hand-made models on their real footprints (see build-landmarks.mjs)
const ICON_WAYS = [
  1052759757, 1052759775, 1052759776, 23641610, 25202548, // 中正紀念堂, 國家音樂廳, 國家戲劇院, 臺北車站, 圓山大飯店
  142113976, 189788192, 155816458, 203799171, 222080307, 244001544, 256190307, 73567706, 558011740, // 市政府 … 南港展覽館二館
  1004055337, 560811571, 62149553, // 彩虹橋, 關渡大橋, 錦帶橋
  198401472, 198401478, 198401479, // 艋舺龍山寺
  281746873, 281746874, 281746876, 281746878, 281746880, 281746881, 281746882, 281746884, 461776386, 461776387, 461776388, // 臺北孔廟
  1463082589, 1462829501, // 大龍峒保安宮
  442195152, 442195154, 442195155, 520269899, 1147855436, // 大巨蛋園區: Garden City 商場棟・影城棟, 洲際酒店, 遠雄巨蛋大樓, east block
];
// 206817 總統府, 3067837 松山菸廠製菸工廠, 5121602758 美麗華摩天輪
await overpass(`(way(id:${ICON_WAYS.join(",")});relation(id:206817,3067837);node(id:5121602758););out geom;`, "icons.json");
// 貓空纜車: the cable line (its vertices are the towers) and its stations
await overpass(`(way(id:71266575);node["aerialway"="station"](24.96,121.56,25.0,121.6););out geom;`, "gondola.json");
// parks, the 故宮 grounds and 艋舺公園: open ground in the city (no blocks there; lawns and trees in the game city)
await overpass(`area["name"="臺北市"]["admin_level"="4"]->.a;(way["leisure"="park"](area.a);relation["leisure"="park"](area.a);way(id:827791918,237121375););out geom;`, "parks.json");
// policy sites for the citywide policies: 聯合醫院 branches + 萬芳 + 關渡 (敬老卡), 婦幼院址 (生育補助),
// the former 第一殯儀館 lot and 南港高工 (大街廓都更 demonstration sites), and 大安路一段 with its end streets (人行道拓寬)
await overpass(
  `(way(id:197316116,1004862600,201280863,258418789,708675111,396909006,252752821,136053052);relation(id:10279460,4793812);node(id:660878357);way["name"~"^(大安路一段|仁愛路四段|市民大道四段)$"](25.035,121.54,25.05,121.55););out geom;`,
  "policy-sites.json",
);
// the 12 districts, for 我的臺北
await overpass(`area["name"="臺北市"]["admin_level"="4"]->.a;rel(area.a)["boundary"="administrative"]["admin_level"="7"];out geom;`, "districts.json");
// 都更: self-initiated renewal-unit cases (都更處 GIS API) and Taipei land-section boundaries (地政局)
await download("https://gis.uro.taipei/UpdateAreaWebAPI/api/Case", "renewal-cases.json");
await download("https://data.taipei/api/dataset/4f3d2280-1ebc-4bba-8ebf-66953403732b/resource/86430589-4e8b-4e21-9d5f-08b0e5c2ce3f/download", "landsect.zip");
console.log("done");
