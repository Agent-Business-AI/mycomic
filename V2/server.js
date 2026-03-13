/**
 * Comic Pilot V2 — Node.js Backend
 * Uses LlamaGen Comic Public API via the official `comic` SDK.
 *
 * Endpoints:
 *   POST /api/upload          → Upload reference image (proxy to LlamaGen /comics/upload)
 *   POST /api/generate        → Create comic generation
 *   GET  /api/status/:id      → Get generation status
 *   GET  /api/usage           → Get API usage
 *   GET  /api/health          → Health check
 *
 * Env: LLAMAGEN_API_KEY (from https://llamagen.ai/settings?tab=api)
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { LlamaGenClient } from "comic";
const app = express();
const PORT = process.env.PORT || 8000;

const API_KEY = process.env.LLAMAGEN_API_KEY || process.env.LLAMAGEN_API_TOKEN;
if (!API_KEY) {
  console.warn("⚠️  LLAMAGEN_API_KEY not set. Set it in .env for comic generation.");
}

const llamagen = API_KEY
  ? new LlamaGenClient({ apiKey: API_KEY, timeoutMs: 120000 })
  : null;

// Multer for file uploads (memory storage)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const CORS_ORIGINS = (process.env.CORS_ORIGINS || "http://localhost:5555,http://localhost:3000").split(",").map((o) => o.trim());

app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
app.use(express.json({ limit: "1mb" }));

// =============================================================================
// Health
// =============================================================================

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    sdk_ready: !!llamagen,
    message: llamagen ? "LlamaGen SDK ready" : "LLAMAGEN_API_KEY not set",
  });
});

// =============================================================================
// Upload reference image (proxy to LlamaGen /comics/upload)
// =============================================================================

app.post("/api/upload", upload.single("file"), async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ detail: "LLAMAGEN_API_KEY not set" });
  }
  if (!req.file) {
    return res.status(400).json({ detail: "No file uploaded" });
  }

  const formData = new FormData();
  const blob = new Blob([req.file.buffer], { type: req.file.mimetype || "image/jpeg" });
  formData.append("file", blob, req.file.originalname || "image.png");

  try {
    const r = await fetch("https://api.llamagen.ai/v1/comics/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}` },
      body: formData,
    });
    const data = await r.json();
    if (r.status !== 200) {
      return res.status(r.status).json({ detail: data.message || data.error || "Upload failed" });
    }
    const fileUrl = data.fileUrl || data.url;
    if (!fileUrl) {
      return res.status(500).json({ detail: "No fileUrl in response" });
    }
    res.json({ fileUrl, fileName: req.file.originalname });
  } catch (e) {
    console.error("[Upload]", e);
    res.status(502).json({ detail: e.message || "Upload failed" });
  }
});

// =============================================================================
// Generate comic
// =============================================================================

app.post("/api/generate", async (req, res) => {
  if (!llamagen) {
    return res.status(500).json({ detail: "LLAMAGEN_API_KEY not set. Add it to .env" });
  }

  const {
    prompt,
    promptUrl,
    preset = "render",
    size = "1024x1024",
    fixPanelNum = 4,
    comicRoles = [],
  } = req.body;

  if (!prompt && !promptUrl) {
    return res.status(400).json({ detail: "Provide prompt or promptUrl" });
  }

  const params = {
    prompt: prompt || undefined,
    promptUrl: promptUrl || undefined,
    preset,
    size,
    fixPanelNum: Math.min(20, Math.max(1, parseInt(fixPanelNum, 10) || 4)),
  };

  if (comicRoles && comicRoles.length > 0) {
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
    res.json({
      comicId: created.id,
      status: created.status || "PENDING",
      message: "Generation started. Poll /api/status/:id for progress.",
    });
  } catch (e) {
    console.error("[Generate]", e);
    const status = e.status || e.statusCode || 500;
    const detail = e.message || e.data?.message || "Generation failed";
    res.status(status).json({ detail });
  }
});

// =============================================================================
// Get status / result
// =============================================================================

app.get("/api/status/:id", async (req, res) => {
  if (!llamagen) {
    return res.status(500).json({ detail: "LLAMAGEN_API_KEY not set" });
  }

  try {
    const result = await llamagen.comic.get(req.params.id);
    res.json({
      id: result.id,
      status: result.status,
      output: result.output,
      panels: result.comics?.[0]?.panels?.map((p) => ({ assetUrl: p.assetUrl })) || [],
      createdAt: result.createdAt,
    });
  } catch (e) {
    console.error("[Status]", e);
    res.status(e.status || 500).json({ detail: e.message || "Status check failed" });
  }
});

// =============================================================================
// Wait for completion (long-running)
// =============================================================================

app.post("/api/generate-and-wait", async (req, res) => {
  if (!llamagen) {
    return res.status(500).json({ detail: "LLAMAGEN_API_KEY not set" });
  }

  const {
    prompt,
    promptUrl,
    preset = "render",
    size = "1024x1024",
    fixPanelNum = 4,
    comicRoles = [],
  } = req.body;

  if (!prompt && !promptUrl) {
    return res.status(400).json({ detail: "Provide prompt or promptUrl" });
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
    const result = await llamagen.comic.waitForCompletion(created.id, {
      intervalMs: 5000,
      timeoutMs: 180000,
    });

    const panels = result.comics?.[0]?.panels?.map((p) => ({ assetUrl: p.assetUrl })) || [];
    const output = result.output;

    res.json({
      id: result.id,
      status: result.status,
      output,
      panels: panels.length > 0 ? panels : (output ? [{ assetUrl: output }] : []),
    });
  } catch (e) {
    console.error("[GenerateAndWait]", e);
    res.status(e.status || 500).json({ detail: e.message || "Generation failed" });
  }
});

// =============================================================================
// Usage
// =============================================================================

app.get("/api/usage", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ detail: "LLAMAGEN_API_KEY not set" });
  }
  try {
    const r = await fetch("https://api.llamagen.ai/v1/comics/usage", {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(502).json({ detail: e.message });
  }
});

// =============================================================================
// Start
// =============================================================================

app.listen(PORT, () => {
  console.log(`Comic Pilot V2 (SDK) backend at http://localhost:${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/api/health`);
  if (!API_KEY) console.log("  ⚠️  Set LLAMAGEN_API_KEY in .env");
});
