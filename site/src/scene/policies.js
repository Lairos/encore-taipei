// Policy content for the prototype, taken from 「蔣萬安臺北市長任內施政與2026連任政策完整報告」(查核日 2026-10-23).
// status: done 已實施 / ongoing 推動中 / planned 已宣布規劃. `event` is the decimal-year moment the scene changes.
// `approx` marks positions or footprints drawn for illustration only.
import { ymd } from "./shared.js";

const S = {
  1: ["生育補助金額常見問答｜臺北市民政局", "https://ca.gov.taipei/News_Content.aspx?n=59F2E04A34FDA3E8&s=DF5CE67EA92183BC&sms=87415A8B9CE81B16"],
  2: ["115年7月新政全面啟動｜萬華區公所", "https://whdo.gov.taipei/News_Content.aspx?n=16B2CB1B675D53DF&s=1218C6E8D2DA266E&sms=EF042250E10B7F6C"],
  3: ["育兒減少工時上路半年｜臺北市勞動局", "https://www.gov.taipei/News_Content.aspx?n=F0DDAF49B89E9413&s=6538F37ECC8B665F"],
  5: ["鮮奶週報3.0及免費營養午餐同步上路｜臺北市政府", "https://www.gov.taipei/News_Content.aspx?n=2044902FC839D045&s=DDB72DE829B21EEE&sms=72544237BBE4C5F6"],
  6: ["鮮奶週報補助擴大至國中生｜臺北市教育局", "https://www.gov.taipei/News_Content.aspx?n=F0DDAF49B89E9413&s=7479719386316902"],
  8: ["發布AI教育政策白皮書｜臺北市教育局", "https://www.gov.taipei/News_Content.aspx?n=F0DDAF49B89E9413&s=B469C4B80810E020&sms=72544237BBE4C5F6"],
  9: ["YouBike前30分鐘免費適用範圍｜臺北市交通局", "https://dot.gov.taipei/News_Content.aspx?n=8AF5CCCCF7B8610A&s=CE10CA83FCA349C5"],
  10: ["YouBike收費方式｜YouBike營運商", "https://www.youbike.com.tw/region/taipei/rate/"],
  11: ["環狀線東環段規劃及辦理期程｜臺北市政府", "https://www.radio.gov.taipei/News_Content.aspx?n=EE6904C858BEB925&s=351EF92BA9E61337&sms=87415A8B9CE81B16"],
  12: ["公館圓環改造事故數據疑義回應｜交通管制工程處", "https://dot.gov.taipei/News_Content.aspx?n=D739A9F6B5C0AB95&s=BEDD9D580E1DE92A"],
  14: ["都更5099及大街廓都更新政｜臺北市政府", "https://www.gov.taipei/News_Content.aspx?n=F0DDAF49B89E9413&s=C628D074125A7699&sms=72544237BBE4C5F6"],
  16: ["都更審議及行政量能精進｜都市更新處", "https://www.gov.taipei/News_Content.aspx?n=F0DDAF49B89E9413&s=D1447611E6D11BEC&sms=72544237BBE4C5F6"],
  17: ["敬老卡600點及新增用途｜臺北市社會局", "https://dosw.gov.taipei/News_Content.aspx?n=6CA16D3397A7A302&s=EFF9CE431990FCDB"],
  19: ["北市府與輝達完成簽約｜臺北市政府", "https://www.gov.taipei/News_Content.aspx?n=F0DDAF49B89E9413&s=A777DD3DF2EFF93F&sms=72544237BBE4C5F6"],
  20: ["臺北大巨蛋大事記｜大巨蛋營運商", "https://www.taipeidome.com.tw/Web/Dome/Milestones_717297344231505920/"],
  21: ["松山機場遷移及臺北AI園區願景｜臺北市政府", "https://www.gov.taipei/News_Content.aspx?n=2044902FC839D045&s=8ED4D25BC664CF21&sms=72544237BBE4C5F6"],
  22: ["首都戰略與AI智慧城市專訪｜聯合報", "https://udn.com/news/story/124652/9579778"],
  23: ["AI教育與市府AI助理政策｜臺北市政府", "https://www.gov.taipei/News_Content.aspx?n=2044902FC839D045&s=2E95049A292B7EC8"],
  24: ["育兒減工時2027年擴大辦理｜中央社", "https://www.cna.com.tw/news/aloc/202609110097.aspx"],
  R1: ["蔣萬安報告都更成果（報核量）｜yam 新聞", "https://n.yam.com/Article/20251114690931"],
  U1: ["自行劃定更新單元查詢（案件資料）｜臺北市都市更新處", "https://data.gov.tw/dataset/145802"],
  U2: ["臺北市數值地籍地段圖｜臺北市地政局", "https://data.gov.tw/dataset/157685"],
};
const src = (...ids) => ids.map((id) => ({ title: S[id][0], url: S[id][1] }));

export const POLICIES = [
  {
    id: "dome",
    name: "臺北大巨蛋",
    status: "done",
    event: ymd(2023, 12, 2),
    when: "2023.12 啟用",
    place: [25.04239, 121.55958],
    before: "主體已興建，但尚未取得使用執照、未開放使用",
    after: "2023 年 12 月啟用，首場正式賽事為亞洲棒球錦標賽",
    caveat: "工程規劃、興建及審查歷經多任市府；任內完成的是啟用里程碑。",
    sources: src(20),
  },
  {
    id: "youbike",
    name: "YouBike 前 30 分鐘免費",
    status: "done",
    event: ymd(2024, 2, 28),
    when: "2024.02.28 起",
    place: [25.0478, 121.517],
    pinLabel: "YouBike 30 分鐘免費",
    before: "依費率計費",
    after: "臺北市站點借車前 30 分鐘免費，臺北借、新北還也適用",
    numbers: "圖上青色光點為全市 1,822 個站點（臺北市資料大平台）",
    caveat: "免費使用增加，不直接代表汽機車旅次等量減少。",
    sources: src(9, 10),
  },
  {
    id: "lunch",
    name: "國中小營養午餐全面免費",
    status: "done",
    event: ymd(2026, 8, 31),
    when: "115 學年起（2026.08.31）",
    place: [25.0262, 121.5433],
    pinLabel: "午餐全面免費",
    before: "家長自付午餐費",
    after: "公私立國中小約 18.6 萬名學生受惠；鮮奶週報 3.0 同步擴大到國中，涵蓋約 28.9 萬名學幼生",
    numbers: "圖上金色光點為全市國中小（OpenStreetMap 資料，示意）",
    caveat: "免費與否不能直接推論餐食品質，食安需另看採購與抽驗。",
    sources: src(5, 6),
  },
  {
    id: "gongguan",
    name: "公館圓環改造",
    status: "done",
    event: ymd(2025, 9, 29),
    when: "2025.09 改造完成",
    place: [25.0136, 121.5345],
    approx: true,
    before: "圓環路口",
    after: "改為一般路口設計，持續觀察成效",
    numbers: "改造後月平均事故 12.0 件，改造前 3 年月平均 22.4 件",
    caveat: "換成「與去年同期比」，受傷人數為 46 對 42 人，結論不同；基準期會影響判讀。",
    sources: src(12),
  },
  {
    id: "eastring",
    name: "捷運環狀線東環段",
    status: "ongoing",
    event: ymd(2024, 12, 24),
    event2: ymd(2025, 10, 20),
    when: "2024.12 / 2025.10 兩標開工",
    place: [25.0553, 121.6176],
    approx: true,
    before: "規劃中",
    after: "CF763 優先施工標 2024.12.24 開工；CF760 區段標 2025.10.20 開工",
    caveat: "標案開工不等於全線完工通車；路線為示意。",
    sources: src(11),
  },
  {
    id: "nvidia",
    name: "輝達北士科總部",
    status: "ongoing",
    event: ymd(2026, 2, 11),
    when: "2026.02.11 簽約",
    place: [25.1005, 121.5115],
    approx: true,
    before: "北士科空地",
    after: "市府與輝達完成簽約，推進興建",
    numbers: "興建至營運總投資預計超過 400 億元、預估創造超過 1 萬個工作機會（規劃估計）",
    caveat: "簽約、開工、完工、營運是不同階段；建築外觀為示意。",
    sources: src(19),
  },
  {
    id: "renewal",
    name: "都市更新加速",
    status: "ongoing",
    event: ymd(2023, 1, 2),
    when: "2023 起",
    approx: true,
    approxLabel: "依地段定位",
    before: "老舊建物待更新",
    after: "近三年都更重建報核 353 案，年平均 117 案，為過去 8 年的 2.3 倍；審議導入 OCR 等數位工具",
    // pinLabel and numbers are filled in from the real case data (layers.js)
    caveat:
      "鷹架代表「更新單元劃定已核准」，是都更的第一步，之後還要事業計畫報核、審議、權利變換、拆除與興建，不代表已開工。位置依各案所在地段（小段）放置，誤差約數百公尺。報核 353 案與地圖上的案件是不同階段的統計。",
    sources: src(16, "R1", "U1", "U2"),
  },
  {
    id: "songshan",
    name: "松山機場遷移與臺北 AI 園區",
    status: "planned",
    event: 2029.6,
    when: "長期願景",
    place: [25.0669, 121.55335],
    before: "松山機場",
    after: "整合 300 公頃：AI 產業聚落 100 公頃、住宅與公共設施 90 公頃、公園綠地 110 公頃",
    numbers: "規劃情境估計：6.5 萬就業人口、3.5 萬居住人口；帶動周邊 570 公頃都更",
    caveat: "需中央協調（航空、國防等），尚非中央核定計畫；分區配置為示意。",
    sources: src(21),
  },
  {
    id: "autobus",
    name: "自駕公車",
    status: "planned",
    event: ymd(2027, 7, 1),
    when: "2027 下半年（規劃）",
    place: [25.0965, 121.5185],
    approx: true,
    before: "—",
    after: "先動物園場域試行、再北士科示範，2027 下半年規劃進入公車專用道",
    caveat: "由試行到常態載客，需驗證安全、設施與營運條件。",
    sources: src(22),
  },
  // policies without a single place: shown in the list and as opening captions
  { id: "birth", name: "生育補助加碼", status: "done", event: ymd(2023, 7, 1), when: "2023.07 修正", before: "—", after: "第 1 名 4 萬、第 2 名 4.5 萬、第 3 名起每名 5 萬元", caveat: "需符合資格，並非所有在臺北生產的家庭都可領。", sources: src(1) },
  { id: "childcare", name: "托育補助提高", status: "done", event: ymd(2026, 7, 1), when: "2026.07 起", before: "—", after: "準公共托育最高補助 8,000 元、家長月費 2,500 元；第二胎起送托公共／準公共月費零負擔", caveat: "依核定托育類型及月費項目，非所有私立托育一律免費。", sources: src(2) },
  { id: "elder", name: "敬老卡 600 點", status: "done", event: ymd(2026, 7, 1), when: "2026.07 起", before: "每月 480 點", after: "每月 600 點，新增醫院掛號費、YouBike 2.0E 前 30 分鐘免費等用途", caveat: "點數為指定用途補助，不等同現金。", sources: src(17) },
  { id: "worktime", name: "育兒減工時不減薪", status: "ongoing", event: ymd(2026, 3, 1), when: "2026.03 試辦", before: "—", after: "截至 6 月底 480 家事業單位、近 900 名員工受惠；2027 年擴大辦理", caveat: "需雇主參與並符合條件，並非所有家長都已取得。", sources: src(3, 24) },
  { id: "aiedu", name: "AI 教育白皮書", status: "ongoing", event: ymd(2026, 7, 3), when: "2026.07 發布，4 年計畫", before: "—", after: "4 年預計投入 92 億元：AI 電腦與載具、光纖到教室、高中 AI Lab、AI 教育中心", caveat: "92 億為預計投入，需按年度預算與驗收核對。", sources: src(8) },
  { id: "urban5099", name: "公辦都更 5099、大街廓都更", status: "planned", event: ymd(2026, 10, 16), when: "2026.10 宣布", before: "公辦都更第一階段意願門檻 75%；基準容積 225%", after: "門檻降為 50%；捷運場站或水岸周邊 3,000 ㎡ 以上基地，基準容積提高至 300%，回饋托育、長照等設施", caveat: "50% 是初期意願門檻，不等於法定同意比例。", sources: src(14) },
  { id: "civiclaw", name: "市府 AI 助理 CiviClaw", status: "planned", event: ymd(2027, 12, 1), when: "2027 年底前", before: "—", after: "全體市府同仁配置 AI Agent", caveat: "成效應以節省工時、正確率、可稽核性與個資保護衡量。", sources: src(23) },
];

// 都更: the map count and pin label come from the real case data (public/data/renewal.json)
export function describeRenewal(p, data) {
  const n = data.cases.length;
  const [from, to] = data.range.map((d) => d.replaceAll("-", "."));
  p.pinLabel = `都更啟動 ${n} 案`;
  p.numbers = `圖上 ${n} 個橘色鷹架：上任後核准的自行劃定更新單元（臺北市都市更新處開放資料，${from}–${to}），依各案所在地段放置`;
  return p;
}

// what appears in the opening montage, in date order
export const OPENING_CAPTIONS = ["dome", "youbike", "eastring", "gongguan", "nvidia", "lunch"];
