import { policies } from "../../lib/policies.js";
import { renderCard, cardForPolicy, cardForSite } from "../../lib/og.js";

export function getStaticPaths() {
  return [{ params: { id: "site" }, props: { card: cardForSite() } }, ...policies.map((p) => ({ params: { id: p.id }, props: { card: cardForPolicy(p) } }))];
}

export async function GET({ props }) {
  return new Response(await renderCard(props.card), { headers: { "Content-Type": "image/png" } });
}
