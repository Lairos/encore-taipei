// Policies for the static pages: the same records the 3D city uses, with data-driven notes filled in at build time.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { POLICIES, describeRenewal } from "../scene/policies.js";

const STATUS = {
  done: { zh: "做到了", note: "已實施", color: "var(--st-done)", hex: "#e0a800" },
  ongoing: { zh: "正在做", note: "推動中", color: "var(--st-ongoing)", hex: "#f2711c" },
  planned: { zh: "接下來", note: "已宣布規劃", color: "var(--st-planned)", hex: "#2e6be6" },
};

// paths from the project root: this module is bundled before it runs, so import.meta.url is not stable
const renewal = JSON.parse(readFileSync(join(process.cwd(), "public/data/renewal.json"), "utf8"));

export const policies = POLICIES.map((p) => {
  const copy = { ...p };
  if (p.id === "renewal") describeRenewal(copy, renewal);
  return { ...copy, stage: STATUS[p.status], url: `/policy/${p.id}/`, og: `/og/${p.id}.png` };
});

export const groups = [
  ["做到了", policies.filter((p) => p.status === "done")],
  ["正在做", policies.filter((p) => p.status === "ongoing")],
  ["接下來", policies.filter((p) => p.status === "planned")],
];

export const STATUS_INFO = STATUS;
