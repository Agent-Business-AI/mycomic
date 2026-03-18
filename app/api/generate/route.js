import { getLlamaGenClient } from "@/lib/llamagen";

export async function POST(request) {
  const llamagen = getLlamaGenClient();
  if (!llamagen) {
    return Response.json(
      { detail: "LLAMAGEN_API_KEY not set. Add it to .env.local" },
      { status: 500 },
    );
  }

  const body = await request.json();
  const {
    prompt,
    promptUrl,
    preset = "render",
    size = "1024x1024",
    fixPanelNum = 4,
    comicRoles = [],
  } = body;

  if (!prompt && !promptUrl) {
    return Response.json({ detail: "Provide prompt or promptUrl" }, { status: 400 });
  }

  const params = {
    prompt: prompt || undefined,
    promptUrl: promptUrl || undefined,
    preset,
    size,
    fixPanelNum: Math.min(20, Math.max(1, parseInt(fixPanelNum, 10) || 4)),
  };

  if (comicRoles?.length > 0) {
    params.comicRoles = comicRoles.map((r) => ({
      name: r.name,
      age: parseInt(r.age, 10) || 25,
      gender: r.gender || "female",
      dress: r.dress || undefined,
      image: r.image || undefined,
    }));
  }

  try {
    const created = await llamagen.comic.create(params);
    return Response.json({
      comicId: created.id,
      status: created.status || "PENDING",
      message: "Generation started. Poll /api/status/:id for progress.",
    });
  } catch (e) {
    const apiData = e.data || e.body || {};
    console.error("[Generate]", e.message, JSON.stringify(apiData, null, 2));
    const status = e.status || e.statusCode || 500;
    const detail =
      apiData?.message || apiData?.error?.message || apiData?.detail || e.message || "Generation failed";
    return Response.json({ detail }, { status });
  }
}
