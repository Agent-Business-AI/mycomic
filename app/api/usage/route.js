import { getApiKey } from "@/lib/llamagen";

export async function GET() {
  const apiKey = getApiKey();
  if (!apiKey) {
    return Response.json({ detail: "LLAMAGEN_API_KEY not set" }, { status: 500 });
  }

  try {
    const res = await fetch("https://api.llamagen.ai/v1/comics/usage", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await res.json();
    return Response.json(data);
  } catch (e) {
    return Response.json({ detail: e.message }, { status: 502 });
  }
}
