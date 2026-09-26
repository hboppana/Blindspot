import { API_BASE_URL } from "@/lib/api";

// Proxies the API's PDF so the browser never needs the API's address.
export async function GET(
  _req: Request,
  ctx: RouteContext<"/intersections/[id]/report">,
) {
  if (!API_BASE_URL) {
    return new Response("PDF reports need the live API (set API_BASE_URL)", {
      status: 503,
    });
  }
  const { id } = await ctx.params;
  const res = await fetch(
    `${API_BASE_URL}/intersections/${encodeURIComponent(id)}/report.pdf`,
    { cache: "no-store" },
  );
  return new Response(res.body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/pdf",
      "Content-Disposition":
        res.headers.get("Content-Disposition") ??
        `inline; filename="streetsmart-${id}.pdf"`,
    },
  });
}
