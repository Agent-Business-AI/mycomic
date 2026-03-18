import { getApiKey } from "@/lib/llamagen";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(request) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return Response.json({ detail: "LLAMAGEN_API_KEY not set" }, { status: 500 });
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ detail: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return Response.json({ detail: "No file uploaded" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ detail: "File too large (max 10 MB)" }, { status: 400 });
  }

  const uploadForm = new FormData();
  uploadForm.append("file", file, file.name || "image.png");

  try {
    const res = await fetch("https://api.llamagen.ai/v1/comics/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: uploadForm,
    });

    const data = await res.json();
    if (res.status !== 200) {
      return Response.json(
        { detail: data.message || data.error || "Upload failed" },
        { status: res.status },
      );
    }

    const fileUrl = data.fileUrl || data.url;
    if (!fileUrl) {
      return Response.json({ detail: "No fileUrl in response" }, { status: 500 });
    }

    return Response.json({ fileUrl, fileName: file.name });
  } catch (e) {
    console.error("[Upload]", e);
    return Response.json({ detail: e.message || "Upload failed" }, { status: 502 });
  }
}
