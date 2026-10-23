// 我的臺北: who you are → the policies that touch your life. Shared by the page markup and the 3D app.
export const PERSONAS = [
  { id: "baby", icon: "👶", label: "新手爸媽／準爸媽", policies: ["birth", "childcare", "worktime"] },
  { id: "school", icon: "🎒", label: "家有國中小學生", policies: ["lunch", "aiedu"] },
  { id: "elder", icon: "👵", label: "長輩／家有長輩", policies: ["elder", "youbike"] },
  { id: "commute", icon: "🚲", label: "每天通勤", policies: ["youbike", "eastring", "gongguan", "sidewalk", "autobus"] },
  { id: "home", icon: "🏠", label: "住老舊公寓", policies: ["renewal", "urban5099"] },
  { id: "career", icon: "💼", label: "在臺北工作打拼", policies: ["nvidia", "songshan", "aiedu"] },
  { id: "fun", icon: "⚾", label: "愛看球賽、表演", policies: ["dome"] },
];

// policies for a set of personas, without repeats, in the order the personas list them
export function policiesFor(ids) {
  const out = [];
  for (const p of PERSONAS) if (ids.includes(p.id)) for (const id of p.policies) if (!out.includes(id)) out.push(id);
  return out;
}
