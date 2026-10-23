# 臺北進行式｜台北安可（正式網站）

首頁是 3D 城市體驗（開場、時間簾幕、模擬城市風格、我的臺北），每項政策另有可被搜尋、可分享的獨立頁。全站是靜態網站，部署在 Cloudflare Pages。

## 開發

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # 輸出到 dist/
```

## 部署（Cloudflare Pages）

第一次先登入 Cloudflare（會開瀏覽器）：

```bash
npx wrangler login
```

之後每次上線：

```bash
npm run deploy
```

第一次部署會建立名為 `taipei-encore` 的 Pages 專案，網址是 `https://taipei-encore.pages.dev`。正式網域在 Cloudflare 後台的 Pages 專案 → Custom domains 設定，設好後把 `src/config.js` 的 `SITE.url` 和 `public/robots.txt` 改成正式網域再部署一次（分享預覽圖與 canonical 網址會跟著更新）。

## 上線前必須填的內容

| 位置 | 內容 |
|---|---|
| `src/config.js` → `SITE.sponsor` | 出資者名稱（頁尾與每張分享圖都會出現） |
| `src/config.js` → `SITE.url` | 正式網域 |
| `src/config.js` → `BRAND` | 目前色票取自新聞照片中的「台北安可」主視覺，請以競辦 CI 檔核對 |
| `src/layouts/Page.astro`、`src/pages/index.astro` 的 `.lockup` | 目前是文字版標誌，拿到官方 logo 檔後替換 |

## 改內容

- 政策文字、日期、來源：`src/scene/policies.js`（3D 城市、政策頁、分享圖共用同一份）
- 「我的臺北」身分與對應政策：`src/scene/persona-data.js`
- 分享預覽圖版面：`src/lib/og.js`
- 我的臺北分享圖卡：`src/scene/persona.js` 的 `makeCard()`

## 更新資料

```bash
npm run data
```

依序下載地形、OpenStreetMap、YouBike、都更處案件、地段圖與行政區界，並產生 `public/data/` 與 `src/data/districts.json`。原始檔放在 `data-raw/`（不進版本控管）。

`public/data/landmarks.json` 收錄六個區域（信義、中正、公館、圓山、北士科、松山機場）的 OpenStreetMap 真實建物輪廓與高度、地標外框（大巨蛋、101、輝達基地）、特色建築（中正紀念堂、總統府、臺北車站、國家戲劇院／音樂廳、圓山大飯店）與東環段站位；設定在 `scripts/build-landmarks.mjs`。

## 網址參數（QA 用）

| 參數 | 作用 |
|---|---|
| `?skip` | 跳過開場 |
| `?focus=dome` | 直接打開某項政策 |
| `?me=baby,school&d=大安區` | 重播「我的臺北」結果（分享連結就是這個格式） |
| `?no3d` | 預覽不支援 3D 時的文字版 |
| `?quality=medium` | 強制手機畫質 |

## 頁面

- `/`：3D 城市
- `/policy/<id>/`：各項政策（含 LINE、Facebook 分享與 1200×630 預覽圖 `/og/<id>.png`）
- `/policies/`：全部政策
- `/sources/`：資料來源
