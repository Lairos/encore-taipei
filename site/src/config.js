// Site-wide settings. Anything marked 待填 must be confirmed by the campaign before launch.
export const SITE = {
  url: "https://taipei-encore.pages.dev", // replace with the campaign domain once it is pointed at Cloudflare Pages
  name: "臺北進行式｜台北安可",
  short: "臺北進行式",
  campaign: "台北安可",
  campaignEn: "Taipei Encore",
  candidate: "蔣萬安",
  tagline: "每一個願景，都蓋在做到的事上。",
  description: "從 2022.12.25 上任那天，到下一個臺北：用一座 3D 城市看見任內做到的事、正在做的事，和接下來的願景。每一項都附官方來源。",
  sponsor: "（待填：出資者）",
  adLabel: "競選廣告",
  dataDate: "2026-10-23",
};

// Colours sampled from the 「台北安可」 main visual in press photos (2026-09-29); confirm against the official CI file.
export const BRAND = {
  blue: "#2e6be6",
  sky: "#7cc8f4",
  yellow: "#ffdd33",
  navy: "#1e2a78",
  ink: "#141a24",
  party: "#0b3d91", // 中國國民黨 blue, for the endorsement mark only
};
