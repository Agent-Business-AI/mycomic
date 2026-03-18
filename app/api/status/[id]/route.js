import { getLlamaGenClient } from "@/lib/llamagen";

export async function GET(_request, { params }) {
  const llamagen = getLlamaGenClient();
  if (!llamagen) {
    return Response.json({ detail: "LLAMAGEN_API_KEY not set" }, { status: 500 });
  }

  const { id } = await params;

  try {
    const result = await llamagen.comic.get(id);
    return Response.json({
      id: result.id,
      status: result.status,
      output: result.output,
      panels:
        result.comics?.[0]?.panels?.map((p) => ({ assetUrl: p.assetUrl })) || [],
      createdAt: result.createdAt,
    });
  } catch (e) {
    console.error("[Status]", e);
    return Response.json(
      { detail: e.message || "Status check failed" },
      { status: e.status || 500 },
    );
  }
}
