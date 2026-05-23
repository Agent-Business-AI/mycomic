import { getApiKey } from "@/lib/llamagen";

export async function PATCH(request, { params }) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return Response.json({ detail: "LLAMAGEN_API_KEY not set" }, { status: 500 });
  }

  const { id } = await params;
  const body = await request.json();

  try {
    const res = await fetch(`https://api.llamagen.ai/v1/comics/generations/${id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) {
      return Response.json(
        { detail: data.message || data.error || data.detail || "Patch failed" },
        { status: res.status },
      );
    }

    return Response.json(data);
  } catch (e) {
    console.error("[Patch]", e);
    return Response.json({ detail: e.message || "Patch failed" }, { status: 502 });
  }
}
