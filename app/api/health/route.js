import { getLlamaGenClient } from "@/lib/llamagen";

export async function GET() {
  const client = getLlamaGenClient();
  return Response.json({
    status: "ok",
    sdk_ready: !!client,
    message: client ? "LlamaGen SDK ready" : "LLAMAGEN_API_KEY not set",
  });
}
