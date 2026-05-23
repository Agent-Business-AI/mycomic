"use client";

import { useState, useCallback, useRef, useEffect } from "react";

const PRESETS = [
  { id: "render", label: "3D Render Animation" },
  { id: "animeFrame", label: "Anime Frame" },
  { id: "comedyComicBook2", label: "Comedy Comic Book 2.0" },
  { id: "japanese_manga", label: "Japanese Manga" },
  { id: "comicBookStyle", label: "American Comic Style" },
  { id: "american_comic_90", label: "1990s American Comics Style" },
];

const SIZES = [
  { id: "1024x1024", label: "1:1 (1024²)", desc: "Square, covers" },
  { id: "512x768", label: "2:3 (512×768)", desc: "Portrait" },
  { id: "512x1024", label: "1:2 (512×1024)", desc: "Tall vertical" },
  { id: "576x1024", label: "9:16 (576×1024)", desc: "Reels, stories" },
  { id: "768x1024", label: "3:4 (768×1024)", desc: "Comic covers" },
  { id: "1024x768", label: "4:3 (1024×768)", desc: "Landscape" },
  { id: "768x512", label: "3:2 (768×512)", desc: "Cinematic" },
  { id: "1024x576", label: "16:9 (1024×576)", desc: "Widescreen" },
  { id: "1024x512", label: "2:1 (1024×512)", desc: "Ultra-wide" },
];

const LANGUAGES = [
  { id: "", label: "None (auto)" },
  { id: "English", label: "English" },
  { id: "Hochdeutsch", label: "Hochdeutsch" },
  { id: "Bayerisch", label: "Bayerisch" },
  { id: "Wienerisch", label: "Wienerisch" },
  { id: "Schweizerdeutsch", label: "Schweizerdeutsch" },
];

const GENDERS = ["male", "female"];

const USE_CASES = [
  { id: 1, label: "Single prompt", desc: "Default with one prompt" },
  { id: 2, label: "Custom options", desc: "Preset, size, panel count" },
  { id: 3, label: "Character consistency", desc: "Add characters (URL or file)" },
  { id: 4, label: "Per-panel prompts", desc: "Structured prompt with panel details" },
];

let _idC = 0;
const uid = (p = "id") => `${p}_${++_idC}_${Date.now()}`;

function buildStructuredPrompt(template, panelPrompts) {
  const parts = [];
  if (template.visualStyle) parts.push(`[Visual Style]\n${template.visualStyle}`);
  if (template.story) parts.push(`[Story]\n${template.story}`);
  if (template.characters) parts.push(`[Characters]\n${template.characters}`);
  if (panelPrompts?.length > 0) {
    const panelText = panelPrompts
      .map(
        (p, i) =>
          `${i + 1}) Panel objective: ${p.panelObjective || ""}\n   - Scene description: ${p.sceneDescription || ""}\n   - Character action: ${p.characterAction || ""}\n   - Dialogue / caption: ${p.dialogueCaption || ""}`,
      )
      .join("\n\n");
    parts.push(`[Panels]\n${panelText}`);
  }
  if (template.constraints) parts.push(`[Constraints]\n${template.constraints}`);
  return parts.join("\n\n");
}

const EXAMPLE_PROMPT = `Visual Style: cinematic anime, clean line-art, soft rim lighting, warm dusk palette.
Story: a quiet fox detective helps a lost child find home before nightfall.
Characters:
- Ren (fox detective): slim build, tan coat, calm eyes, carries a paper map.
- Mino (child): short bob hair, yellow raincoat, anxious but curious.
Panels:
1) Wide shot of rainy alley; Ren notices Mino alone near a lantern.
2) Medium shot; Ren kneels, offers map, Mino starts to trust him.
3) Tracking shot; both crossing old bridge with city lights in background.
4) Close shot; child reunited with family, Ren leaving silently.
Constraints: preserve character face consistency across all panels; no text watermark; high detail background.`;

const api = {
  async health() {
    const r = await fetch("/api/health");
    return r.json();
  },
  async upload(file) {
    const form = new FormData();
    form.append("file", file);
    const r = await fetch("/api/upload", { method: "POST", body: form });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || `Upload failed: ${r.status}`);
    }
    const data = await r.json();
    return data.fileUrl;
  },
  async generate(payload) {
    const r = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || `Generation failed: ${r.status}`);
    }
    return r.json();
  },
  async getStatus(id) {
    const r = await fetch(`/api/status/${id}`);
    if (!r.ok) return null;
    return r.json();
  },
  async patch(id, payload) {
    const r = await fetch(`/api/patch/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || `Patch failed: ${r.status}`);
    }
    return r.json();
  },
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function CharacterCard({ character: c, onUpdate, onRemove, isExpanded, onToggle, isUploading }) {
  const update = (f, v) => onUpdate({ ...c, [f]: v });
  return (
    <div className="overflow-hidden rounded-xl border border-gray-700 bg-gray-800/80">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-gray-700/50"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-sm font-bold text-white">
          {c.imagePreview ? (
            <img src={c.imagePreview} alt="" className="h-full w-full object-cover" />
          ) : (
            c.name?.charAt(0)?.toUpperCase() || "?"
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-white">{c.name || "New Character"}</div>
          <div className="truncate text-xs text-gray-400">
            {c.gender} · {c.age}y · {c.dress || "no dress"}
            {c.imageUrl ? " · ✓ image" : c.imageFile ? " · 📸 pending" : ""}
          </div>
        </div>
        {isUploading && (
          <span className="animate-pulse text-xs text-amber-400">Uploading...</span>
        )}
        <span className="text-sm text-gray-500">{isExpanded ? "▲" : "▼"}</span>
      </button>
      {isExpanded && (
        <div className="space-y-3 border-t border-gray-700 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Name *</label>
              <input
                type="text"
                value={c.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="e.g. Ren, Mino"
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Gender</label>
              <select
                value={c.gender}
                onChange={(e) => update("gender", e.target.value)}
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
              >
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Age</label>
              <input
                type="number"
                min="0"
                max="150"
                value={c.age}
                onChange={(e) => update("age", parseInt(e.target.value) || 25)}
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">
                Dress / Clothing
              </label>
              <input
                type="text"
                value={c.dress || ""}
                onChange={(e) => update("dress", e.target.value)}
                placeholder="e.g. red cape, hoodie"
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">
              Reference Image URL
            </label>
            <input
              type="url"
              value={c.imageUrl || ""}
              onChange={(e) => update("imageUrl", e.target.value)}
              placeholder="https:// or upload file below"
              className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Or upload file</label>
            <div className="flex items-start gap-3">
              {c.imagePreview ? (
                <div className="group relative">
                  <img
                    src={c.imagePreview}
                    alt=""
                    className="h-20 w-20 rounded-lg border border-gray-600 object-cover"
                  />
                  <button
                    onClick={() =>
                      onUpdate({ ...c, imagePreview: null, imageFile: null, imageUrl: "" })
                    }
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    ✕
                  </button>
                  {c.imageUrl && (
                    <div className="absolute bottom-0 left-0 right-0 rounded-b-lg bg-green-600/80 py-0.5 text-center text-[9px] text-white">
                      ✓
                    </div>
                  )}
                </div>
              ) : (
                <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-600 text-gray-500 transition-colors hover:border-amber-500 hover:text-amber-500">
                  <span className="text-xl">📷</span>
                  <span className="mt-0.5 text-[10px]">Upload</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f)
                        onUpdate({
                          ...c,
                          imageFile: f,
                          imagePreview: URL.createObjectURL(f),
                          imageUrl: "",
                        });
                    }}
                  />
                </label>
              )}
              <p className="mt-1 text-xs text-gray-500">
                Public API comicRoles: name, age, gender, dress, image (URL or file upload)
              </p>
            </div>
          </div>
          <button
            onClick={onRemove}
            className="mt-2 text-xs text-red-400 transition-colors hover:text-red-300"
          >
            Remove Character
          </button>
        </div>
      )}
    </div>
  );
}

function PanelPromptCard({ panel, index, onUpdate, onRemove }) {
  const update = (f, v) => onUpdate({ ...panel, [f]: v });
  return (
    <div className="overflow-hidden rounded-xl border border-gray-700 bg-gray-800/80">
      <div className="flex items-center justify-between p-3">
        <span className="font-medium text-white">Panel {index + 1}</span>
        <button onClick={onRemove} className="text-xs text-red-400 hover:text-red-300">
          Remove
        </button>
      </div>
      <div className="space-y-3 border-t border-gray-700 p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">Panel objective</label>
          <input
            type="text"
            value={panel.panelObjective || ""}
            onChange={(e) => update("panelObjective", e.target.value)}
            placeholder="e.g. Wide shot of rainy alley"
            className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">Scene description</label>
          <input
            type="text"
            value={panel.sceneDescription || ""}
            onChange={(e) => update("sceneDescription", e.target.value)}
            placeholder="e.g. Ren notices Mino alone near a lantern"
            className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">Character action</label>
          <input
            type="text"
            value={panel.characterAction || ""}
            onChange={(e) => update("characterAction", e.target.value)}
            placeholder="e.g. Ren kneels, offers map"
            className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">
            Dialogue / caption
          </label>
          <input
            type="text"
            value={panel.dialogueCaption || ""}
            onChange={(e) => update("dialogueCaption", e.target.value)}
            placeholder='"Hello there"'
            className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}

function LocationCard({ location: loc, onUpdate, onRemove, isUploading }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-gray-700 bg-gray-800/80 p-3">
      {loc.imagePreview ? (
        <div className="group relative shrink-0">
          <img
            src={loc.imagePreview}
            alt=""
            className="h-16 w-16 rounded-lg border border-gray-600 object-cover"
          />
          <button
            onClick={() =>
              onUpdate({ ...loc, imagePreview: null, imageFile: null, imageUrl: "" })
            }
            className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] text-white opacity-0 transition-opacity group-hover:opacity-100"
          >
            ✕
          </button>
          {loc.imageUrl && (
            <div className="absolute bottom-0 left-0 right-0 rounded-b-lg bg-green-600/80 py-0.5 text-center text-[9px] text-white">
              ✓
            </div>
          )}
        </div>
      ) : (
        <label className="flex h-16 w-16 shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-600 text-gray-500 transition-colors hover:border-amber-500 hover:text-amber-500">
          <span className="text-lg">🗺️</span>
          <span className="mt-0.5 text-[9px]">Upload</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f)
                onUpdate({
                  ...loc,
                  imageFile: f,
                  imagePreview: URL.createObjectURL(f),
                  imageUrl: "",
                });
            }}
          />
        </label>
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <input
          type="text"
          value={loc.name}
          onChange={(e) => onUpdate({ ...loc, name: e.target.value })}
          placeholder="Location name, e.g. Rainy Alley"
          className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
        />
        {isUploading && (
          <span className="animate-pulse text-xs text-amber-400">Uploading...</span>
        )}
      </div>
      <button
        onClick={onRemove}
        className="mt-1 shrink-0 text-xs text-red-400 hover:text-red-300"
      >
        ✕
      </button>
    </div>
  );
}

function AttachmentItem({ attachment: att, onUpdate, onRemove, isUploading }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-gray-700 bg-gray-800/80 p-3">
      <div className="min-w-0 flex-1 space-y-2">
        <input
          type="text"
          value={att.title}
          onChange={(e) => onUpdate({ ...att, title: e.target.value })}
          placeholder="Title, e.g. Style Reference"
          className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
        />
        {att.file ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-xs text-gray-400">{att.file.name}</span>
            {att.url && <span className="text-xs text-green-400">✓ uploaded</span>}
            {isUploading && (
              <span className="animate-pulse text-xs text-amber-400">Uploading...</span>
            )}
            <button
              onClick={() => onUpdate({ ...att, file: null, url: "" })}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Remove
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-500 hover:text-amber-400">
            <span>📎</span>
            <span>Choose file</span>
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpdate({ ...att, file: f, url: "" });
              }}
            />
          </label>
        )}
      </div>
      <button onClick={onRemove} className="shrink-0 text-xs text-red-400 hover:text-red-300">
        ✕
      </button>
    </div>
  );
}

function ImageUploadList({ images, onChange, disabled }) {
  const addFiles = (files) => {
    const next = [
      ...images,
      ...Array.from(files).map((f) => ({
        id: uid("img"),
        file: f,
        preview: URL.createObjectURL(f),
        url: "",
      })),
    ];
    onChange(next);
  };
  const remove = (id) => onChange(images.filter((i) => i.id !== id));

  return (
    <div className="flex flex-wrap gap-2">
      {images.map((img) => (
        <div key={img.id} className="group relative">
          <img
            src={img.preview}
            alt=""
            className="h-16 w-16 rounded-lg border border-gray-600 object-cover"
          />
          {img.url && (
            <div className="absolute bottom-0 left-0 right-0 rounded-b-lg bg-green-600/80 py-0.5 text-center text-[9px] text-white">
              ✓
            </div>
          )}
          <button
            onClick={() => remove(img.id)}
            disabled={disabled}
            className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-50"
          >
            ✕
          </button>
        </div>
      ))}
      <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-600 text-gray-500 hover:border-amber-500 hover:text-amber-500">
        <span className="text-xl">+</span>
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}

// ─── Regen Dialog ──────────────────────────────────────────────────────────────

function RegenerateDialog({ comicId, pageIdx, panelIdx, onClose, onDone }) {
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState([]);
  const [caption, setCaption] = useState("");
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleSubmit = async () => {
    try {
      setPhase("uploading");
      setError("");

      const uploadedImages = [...images];
      for (let i = 0; i < uploadedImages.length; i++) {
        if (!uploadedImages[i].url && uploadedImages[i].file) {
          const url = await api.upload(uploadedImages[i].file);
          uploadedImages[i] = { ...uploadedImages[i], url };
        }
      }
      setImages(uploadedImages);
      const imageUrls = uploadedImages.map((i) => i.url).filter(Boolean);

      setPhase("patching");
      const patchPayload = {
        page: pageIdx,
        panel: panelIdx,
        ...(prompt ? { prompt } : {}),
        ...(imageUrls.length ? { images: imageUrls } : {}),
        ...(caption ? { caption } : {}),
      };
      await api.patch(comicId, patchPayload);

      setPhase("polling");
      pollRef.current = setInterval(async () => {
        try {
          const status = await api.getStatus(comicId);
          if (["SUCCEEDED", "PROCESSED", "COMPLETED"].includes(status?.status)) {
            clearInterval(pollRef.current);
            setPhase("done");
            onDone(status);
          } else if (status?.status === "FAILED") {
            clearInterval(pollRef.current);
            setError("Regeneration failed");
            setPhase("error");
          }
        } catch (e) {
          console.error("Regen poll:", e);
        }
      }, 5000);
    } catch (e) {
      setError(e.message || "Failed");
      setPhase("error");
    }
  };

  const busy = ["uploading", "patching", "polling"].includes(phase);
  const canSubmit = !busy && (!!prompt || images.length > 0 || !!caption);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-white">
            Regenerate Panel {panelIdx + 1}
            {pageIdx > 0 ? ` · Page ${pageIdx + 1}` : ""}
          </h3>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-gray-500 hover:text-white disabled:opacity-30"
          >
            ✕
          </button>
        </div>

        {phase === "done" ? (
          <div className="py-8 text-center">
            <div className="mb-2 text-4xl">✅</div>
            <p className="text-green-400">Panel regenerated!</p>
            <button
              onClick={onClose}
              className="mt-4 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-amber-400"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">
                New prompt (optional)
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe what to change in this panel"
                rows={3}
                disabled={busy}
                className="w-full resize-none rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none disabled:opacity-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">
                Reference images (optional, multiple)
              </label>
              <ImageUploadList images={images} onChange={setImages} disabled={busy} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">
                Caption (optional)
              </label>
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder='"Come on, we have to hurry!"'
                disabled={busy}
                className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none disabled:opacity-50"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={onClose}
                disabled={busy}
                className="flex-1 rounded-lg border border-gray-700 py-2 text-sm text-gray-300 hover:bg-gray-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex-1 rounded-lg bg-amber-500 py-2 text-sm font-medium text-gray-900 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-900 border-t-transparent" />
                    {phase === "uploading"
                      ? "Uploading..."
                      : phase === "patching"
                        ? "Sending..."
                        : "Waiting..."}
                  </span>
                ) : (
                  "Regenerate"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Continue Write Dialog ─────────────────────────────────────────────────────

function ContinueWriteDialog({ comicId, onClose, onDone }) {
  const [prompt, setCPrompt] = useState("");
  const [paginationMode, setPaginationMode] = useState(false);
  const [pagination, setPagination] = useState({ totalPages: 1, panelsPerPage: 4 });
  const [fixPanelNum, setFixPanelNum] = useState(4);
  const [attachments, setAttachments] = useState([]);
  const [uploadingAtts, setUploadingAtts] = useState(new Set());
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      setError("Enter a prompt for the next part");
      return;
    }
    try {
      setPhase("uploading");
      setError("");

      const updatedAtts = [...attachments];
      for (let i = 0; i < updatedAtts.length; i++) {
        const att = updatedAtts[i];
        if (att.file && !att.url) {
          setUploadingAtts((p) => new Set([...p, att.id]));
          const url = await api.upload(att.file);
          updatedAtts[i] = { ...att, url };
          setUploadingAtts((p) => {
            const n = new Set(p);
            n.delete(att.id);
            return n;
          });
        }
      }
      setAttachments(updatedAtts);
      const attPayload = updatedAtts
        .filter((a) => a.url && a.title)
        .map((a) => ({ url: a.url, title: a.title }));

      setPhase("patching");
      const patchPayload = {
        action: "continueWrite",
        prompt,
        ...(paginationMode ? { pagination } : { fixPanelNum }),
        ...(attPayload.length ? { attachments: attPayload } : {}),
      };
      await api.patch(comicId, patchPayload);

      setPhase("polling");
      pollRef.current = setInterval(async () => {
        try {
          const status = await api.getStatus(comicId);
          if (["SUCCEEDED", "PROCESSED", "COMPLETED"].includes(status?.status)) {
            clearInterval(pollRef.current);
            setPhase("done");
            onDone(status);
          } else if (status?.status === "FAILED") {
            clearInterval(pollRef.current);
            setError("Generation failed");
            setPhase("error");
          }
        } catch (e) {
          console.error("Continue poll:", e);
        }
      }, 5000);
    } catch (e) {
      setError(e.message || "Failed");
      setPhase("error");
    }
  };

  const busy = ["uploading", "patching", "polling"].includes(phase);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl" style={{ maxHeight: "90vh" }}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-white">Generate Next Part</h3>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-gray-500 hover:text-white disabled:opacity-30"
          >
            ✕
          </button>
        </div>

        {phase === "done" ? (
          <div className="py-8 text-center">
            <div className="mb-2 text-4xl">✅</div>
            <p className="text-green-400">Next part generated!</p>
            <button
              onClick={onClose}
              className="mt-4 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-amber-400"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {error && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">
                Continuation prompt *
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setCPrompt(e.target.value)}
                placeholder="What happens next in the story?"
                rows={4}
                disabled={busy}
                className="w-full resize-none rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none disabled:opacity-50"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center gap-3">
                <span className="text-xs font-medium text-gray-400">Panel count mode</span>
                <div className="flex overflow-hidden rounded-lg border border-gray-700 text-xs">
                  <button
                    onClick={() => setPaginationMode(false)}
                    disabled={busy}
                    className={`px-3 py-1.5 transition-colors ${
                      !paginationMode
                        ? "bg-amber-500/20 text-amber-400"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    Fixed
                  </button>
                  <button
                    onClick={() => setPaginationMode(true)}
                    disabled={busy}
                    className={`px-3 py-1.5 transition-colors ${
                      paginationMode
                        ? "bg-amber-500/20 text-amber-400"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    Pagination
                  </button>
                </div>
              </div>
              {paginationMode ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Total pages</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={pagination.totalPages}
                      onChange={(e) =>
                        setPagination((p) => ({
                          ...p,
                          totalPages: Math.max(1, parseInt(e.target.value) || 1),
                        }))
                      }
                      disabled={busy}
                      className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Panels per page</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={pagination.panelsPerPage}
                      onChange={(e) =>
                        setPagination((p) => ({
                          ...p,
                          panelsPerPage: Math.min(20, Math.max(1, parseInt(e.target.value) || 4)),
                        }))
                      }
                      disabled={busy}
                      className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none disabled:opacity-50"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Panels (1–20)</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={fixPanelNum}
                    onChange={(e) =>
                      setFixPanelNum(Math.min(20, Math.max(1, parseInt(e.target.value) || 4)))
                    }
                    disabled={busy}
                    className="w-24 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none disabled:opacity-50"
                  />
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-medium text-gray-400">
                  Attachments (optional)
                </label>
                <button
                  onClick={() =>
                    setAttachments((p) => [
                      ...p,
                      { id: uid("att"), title: "", file: null, url: "" },
                    ])
                  }
                  disabled={busy}
                  className="text-xs text-amber-400 hover:text-amber-300 disabled:opacity-50"
                >
                  + Add
                </button>
              </div>
              {attachments.length > 0 && (
                <div className="space-y-2">
                  {attachments.map((att) => (
                    <AttachmentItem
                      key={att.id}
                      attachment={att}
                      isUploading={uploadingAtts.has(att.id)}
                      onUpdate={(u) =>
                        setAttachments((p) => p.map((x) => (x.id === u.id ? u : x)))
                      }
                      onRemove={() =>
                        setAttachments((p) => p.filter((x) => x.id !== att.id))
                      }
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={onClose}
                disabled={busy}
                className="flex-1 rounded-lg border border-gray-700 py-2 text-sm text-gray-300 hover:bg-gray-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={busy || !prompt.trim()}
                className="flex-1 rounded-lg bg-amber-500 py-2 text-sm font-medium text-gray-900 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-900 border-t-transparent" />
                    {phase === "uploading"
                      ? "Uploading..."
                      : phase === "patching"
                        ? "Sending..."
                        : "Generating..."}
                  </span>
                ) : (
                  "Generate Next Part"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Panel Card ────────────────────────────────────────────────────────────────

function PanelCard({ url, pageIdx, panelIdx, onRegen }) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-gray-700 bg-gray-800">
      {url ? (
        <img
          src={url}
          alt={`Page ${pageIdx + 1} Panel ${panelIdx + 1}`}
          className="aspect-square w-full object-cover"
        />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-gray-900 text-gray-600">
          No image
        </div>
      )}
      <button
        onClick={() => onRegen(pageIdx, panelIdx)}
        title="Regenerate panel"
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-sm text-white opacity-0 shadow-lg transition-opacity hover:bg-black/80 group-hover:opacity-100"
      >
        🔄
      </button>
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent py-1.5 text-center text-[10px] text-gray-300 opacity-0 transition-opacity group-hover:opacity-100">
        Panel {panelIdx + 1}
      </div>
    </div>
  );
}

// ─── Generation View ───────────────────────────────────────────────────────────

function GenerationView({ comicId, phase, error, allPages, elapsed, onReset, onRegenDone, onContinueDone }) {
  const [regenTarget, setRegenTarget] = useState(null);
  const [showContinue, setShowContinue] = useState(false);

  if (phase === "done" && allPages.length > 0) {
    const totalPanels = allPages.reduce((s, p) => s + p.panels.length, 0);
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-green-400">Comic Generated!</h2>
            <p className="text-xs text-gray-500">
              {allPages.length} page(s) · {totalPanels} panels · {elapsed}s · ID:{" "}
              <code className="text-amber-400">{comicId}</code>
            </p>
          </div>
          <button
            onClick={onReset}
            className="rounded-lg bg-gray-800 px-4 py-2 text-sm transition-colors hover:bg-gray-700"
          >
            ← New Comic
          </button>
        </div>

        <div className="space-y-8">
          {allPages.map((page) => (
            <div key={page.pageIndex}>
              {allPages.length > 1 && (
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-300">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-xs text-amber-400">
                    {page.pageIndex + 1}
                  </span>
                  Page {page.pageIndex + 1}
                </h3>
              )}
              <div
                className="grid gap-4"
                style={{
                  gridTemplateColumns:
                    page.panels.length <= 4 ? "repeat(2,1fr)" : "repeat(3,1fr)",
                }}
              >
                {page.panels.map((panel) => (
                  <PanelCard
                    key={panel.panelIdx}
                    url={panel.assetUrl}
                    pageIdx={page.pageIndex}
                    panelIdx={panel.panelIdx}
                    onRegen={(pi, pni) => setRegenTarget({ pageIdx: pi, panelIdx: pni })}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-center pt-2">
          <button
            onClick={() => setShowContinue(true)}
            className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3 text-sm font-bold text-gray-900 shadow-lg shadow-amber-500/20 transition-all hover:from-amber-400 hover:to-orange-400"
          >
            ✨ Generate Next Part
          </button>
        </div>

        {regenTarget && (
          <RegenerateDialog
            comicId={comicId}
            pageIdx={regenTarget.pageIdx}
            panelIdx={regenTarget.panelIdx}
            onClose={() => setRegenTarget(null)}
            onDone={(status) => {
              setRegenTarget(null);
              onRegenDone(status);
            }}
          />
        )}

        {showContinue && (
          <ContinueWriteDialog
            comicId={comicId}
            onClose={() => setShowContinue(false)}
            onDone={(status) => {
              setShowContinue(false);
              onContinueDone(status);
            }}
          />
        )}
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="space-y-4 py-16 text-center">
        <div className="text-5xl">❌</div>
        <h2 className="text-lg font-bold text-red-400">Generation Failed</h2>
        <p className="mx-auto max-w-md text-sm text-gray-400">{error || "Unknown error"}</p>
        <button
          onClick={onReset}
          className="rounded-lg bg-gray-800 px-4 py-2 text-sm transition-colors hover:bg-gray-700"
        >
          ← Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-16 text-center">
      <div className="relative inline-block">
        <div className="h-24 w-24 rounded-full border-4 border-gray-700" />
        <div className="absolute inset-0 h-24 w-24 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
        <div className="absolute inset-0 flex items-center justify-center text-lg font-bold text-amber-400">
          ...
        </div>
      </div>
      <div>
        <h2 className="text-lg font-bold">Generating comic...</h2>
        <p className="mt-1 text-xs text-gray-500">
          ID: <code className="text-amber-400">{comicId || "..."}</code> · {elapsed}s
        </p>
      </div>
      <p className="text-xs text-gray-500">Polling every 5s. Public API may take 30–120s.</p>
    </div>
  );
}

// ─── Pagination Mode Toggle ────────────────────────────────────────────────────

function PaginationToggle({ paginationMode, onToggle, disabled }) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-gray-700 text-xs">
      <button
        onClick={() => onToggle(false)}
        disabled={disabled}
        className={`px-3 py-1.5 transition-colors ${
          !paginationMode ? "bg-amber-500/20 text-amber-400" : "text-gray-400 hover:text-white"
        }`}
      >
        Fixed panels
      </button>
      <button
        onClick={() => onToggle(true)}
        disabled={disabled}
        className={`px-3 py-1.5 transition-colors ${
          paginationMode ? "bg-amber-500/20 text-amber-400" : "text-gray-400 hover:text-white"
        }`}
      >
        Pagination
      </button>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function ComicPilot() {
  const [useCase, setUseCase] = useState(1);
  const [prompt, setPrompt] = useState("");
  const [template, setTemplate] = useState({
    visualStyle: "",
    story: "",
    characters: "",
    constraints: "",
  });
  const [panelPrompts, setPanelPrompts] = useState([]);
  const [preset, setPreset] = useState("render");
  const [size, setSize] = useState("1024x1024");
  const [paginationMode, setPaginationMode] = useState(false);
  const [fixPanelNum, setFixPanelNum] = useState(4);
  const [pagination, setPagination] = useState({ totalPages: 2, panelsPerPage: 4 });
  const [language, setLanguage] = useState("English");
  const [upscale, setUpscale] = useState("");
  const [characters, setCharacters] = useState([]);
  const [expandedChar, setExpandedChar] = useState(null);
  const [locations, setLocations] = useState([]);
  const [uploadingLocs, setUploadingLocs] = useState(new Set());
  const [attachments, setAttachments] = useState([]);
  const [uploadingAtts, setUploadingAtts] = useState(new Set());
  const [activeTab, setActiveTab] = useState("prompt");
  const [genPhase, setGenPhase] = useState("idle");
  const [comicId, setComicId] = useState(null);
  const [result, setResult] = useState(null);
  const [genError, setGenError] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [uploadingChars, setUploadingChars] = useState(new Set());
  const [backendOk, setBackendOk] = useState(null);
  const [allPages, setAllPages] = useState([]);

  const pollRef = useRef(null);
  const startRef = useRef(null);

  useEffect(() => {
    api
      .health()
      .then((r) => setBackendOk(r.sdk_ready))
      .catch(() => setBackendOk(false));
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const statusToPages = (prog) => {
    if (prog?.pages?.length > 0) return prog.pages;
    if (prog?.panels?.length > 0) {
      return [
        {
          pageIndex: 0,
          panels: prog.panels.map((p, i) => ({ ...p, panelIdx: i })),
        },
      ];
    }
    return [];
  };

  const startPolling = useCallback((id) => {
    startRef.current = Date.now();
    setGenPhase("polling");
    pollRef.current = setInterval(async () => {
      try {
        setElapsed(Math.round((Date.now() - startRef.current) / 1000));
        const prog = await api.getStatus(id);
        if (["SUCCEEDED", "PROCESSED", "COMPLETED"].includes(prog?.status)) {
          clearInterval(pollRef.current);
          setResult(prog);
          setAllPages(statusToPages(prog));
          setGenPhase("done");
        } else if (prog?.status === "FAILED") {
          clearInterval(pollRef.current);
          setGenError(prog.detail || "Generation failed");
          setGenPhase("error");
        }
      } catch (e) {
        console.error("Poll error:", e);
      }
    }, 5000);
  }, []);

  const getFinalPrompt = () => {
    if (
      useCase === 4 &&
      (template.visualStyle ||
        template.story ||
        template.characters ||
        template.constraints ||
        panelPrompts.length > 0)
    ) {
      return buildStructuredPrompt(template, panelPrompts);
    }
    return prompt;
  };

  const handleGenerate = async () => {
    const finalPrompt = getFinalPrompt();
    if (!finalPrompt.trim()) {
      setGenError("Enter a prompt");
      setGenPhase("error");
      return;
    }

    try {
      setGenPhase("uploading");
      setActiveTab("result");
      setResult(null);
      setGenError(null);
      setElapsed(0);
      setAllPages([]);

      // Upload character images
      const comicRoles = [];
      const updatedChars = [...characters];
      for (let i = 0; i < updatedChars.length; i++) {
        const c = updatedChars[i];
        if (!c.name) continue;
        let imageUrl = c.imageUrl;
        if (c.imageFile && !c.imageUrl) {
          setUploadingChars((p) => new Set([...p, c.id]));
          try {
            imageUrl = await api.upload(c.imageFile);
            updatedChars[i] = { ...c, imageUrl };
          } catch (e) {
            console.warn(`Upload failed for ${c.name}:`, e);
          }
          setUploadingChars((p) => {
            const n = new Set(p);
            n.delete(c.id);
            return n;
          });
        }
        comicRoles.push({
          name: updatedChars[i].name,
          age: updatedChars[i].age || 25,
          gender: updatedChars[i].gender || "female",
          dress: updatedChars[i].dress || undefined,
          image: updatedChars[i].imageUrl || undefined,
        });
      }
      setCharacters(updatedChars);

      // Upload location images
      const updatedLocs = [...locations];
      for (let i = 0; i < updatedLocs.length; i++) {
        const loc = updatedLocs[i];
        if (!loc.name) continue;
        if (loc.imageFile && !loc.imageUrl) {
          setUploadingLocs((p) => new Set([...p, loc.id]));
          try {
            const url = await api.upload(loc.imageFile);
            updatedLocs[i] = { ...loc, imageUrl: url };
          } catch (e) {
            console.warn(`Upload failed for location ${loc.name}:`, e);
          }
          setUploadingLocs((p) => {
            const n = new Set(p);
            n.delete(loc.id);
            return n;
          });
        }
      }
      setLocations(updatedLocs);
      const comicLocations = updatedLocs
        .filter((l) => l.name)
        .map((l) => ({ name: l.name, image: l.imageUrl || undefined }));

      // Upload attachments
      const updatedAtts = [...attachments];
      for (let i = 0; i < updatedAtts.length; i++) {
        const att = updatedAtts[i];
        if (att.file && !att.url) {
          setUploadingAtts((p) => new Set([...p, att.id]));
          try {
            const url = await api.upload(att.file);
            updatedAtts[i] = { ...att, url };
          } catch (e) {
            console.warn(`Upload failed for attachment ${att.title}:`, e);
          }
          setUploadingAtts((p) => {
            const n = new Set(p);
            n.delete(att.id);
            return n;
          });
        }
      }
      setAttachments(updatedAtts);
      const attPayload = updatedAtts
        .filter((a) => a.url && a.title)
        .map((a) => ({ url: a.url, title: a.title }));

      setGenPhase("generating");
      const payload = {
        prompt: finalPrompt,
        preset: useCase >= 2 ? preset : "render",
        size: useCase >= 2 ? size : "1024x1024",
        comicRoles: useCase >= 3 ? comicRoles : [],
        comicLocations: comicLocations.length > 0 ? comicLocations : undefined,
        attachments: attPayload.length > 0 ? attPayload : undefined,
        language: language || undefined,
        upscale: upscale || undefined,
      };

      if (useCase >= 2 && paginationMode) {
        payload.pagination = pagination;
      } else {
        payload.fixPanelNum = useCase >= 2 ? fixPanelNum : 4;
      }

      const created = await api.generate(payload);
      if (!created.comicId) throw new Error("No comic ID returned");
      setComicId(created.comicId);
      startPolling(created.comicId);
    } catch (e) {
      setGenError(e.message || "Generation failed");
      setGenPhase("error");
    }
  };

  const handleReset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setGenPhase("idle");
    setComicId(null);
    setResult(null);
    setGenError(null);
    setElapsed(0);
    setAllPages([]);
    setActiveTab("prompt");
  };

  const addCharacter = () => {
    const c = {
      id: uid("ch"),
      name: "",
      gender: "female",
      age: 25,
      dress: "",
      imageUrl: "",
      imageFile: null,
      imagePreview: null,
    };
    setCharacters((p) => [...p, c]);
    setExpandedChar(c.id);
    setActiveTab("characters");
  };

  const addPanelPrompt = () => {
    setPanelPrompts((p) => [
      ...p,
      {
        id: uid("pn"),
        panelObjective: "",
        sceneDescription: "",
        characterAction: "",
        dialogueCaption: "",
      },
    ]);
    setActiveTab("panels");
  };

  const isReady =
    (useCase === 4
      ? template.visualStyle ||
        template.story ||
        template.characters ||
        template.constraints ||
        panelPrompts.length > 0
      : prompt.trim()) && genPhase === "idle";
  const isGenerating = ["uploading", "generating", "polling"].includes(genPhase);

  const tabs = [
    { id: "prompt", label: "Prompt", icon: "✏️" },
    ...(useCase >= 2 ? [{ id: "options", label: "Options", icon: "⚙️" }] : []),
    ...(useCase >= 3
      ? [{ id: "characters", label: "Characters", count: characters.length, icon: "👤" }]
      : []),
    ...(useCase >= 4
      ? [{ id: "panels", label: "Panels", count: panelPrompts.length, icon: "🎬" }]
      : []),
    ...(genPhase !== "idle"
      ? [
          {
            id: "result",
            label: isGenerating ? "Generating..." : genPhase === "done" ? "Result" : "Error",
            icon: genPhase === "done" ? "✅" : genPhase === "error" ? "❌" : "⏳",
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 text-sm font-bold text-white">
              C
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">Comic Pilot</h1>
              <p className="text-xs text-gray-500">LlamaGen API</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
                backendOk === true
                  ? "bg-green-500/15 text-green-400"
                  : backendOk === false
                    ? "bg-red-500/15 text-red-400"
                    : "bg-gray-700 text-gray-400"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  backendOk === true
                    ? "bg-green-400"
                    : backendOk === false
                      ? "bg-red-400"
                      : "bg-gray-500"
                }`}
              />
              {backendOk === true ? "SDK Ready" : backendOk === false ? "Offline" : "..."}
            </div>
            {!isGenerating && (
              <button
                onClick={handleGenerate}
                disabled={!isReady || backendOk !== true}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
                  isReady && backendOk === true
                    ? "bg-gradient-to-r from-amber-500 to-orange-500 text-gray-900 shadow-lg shadow-amber-500/20 hover:from-amber-400 hover:to-orange-400"
                    : "cursor-not-allowed bg-gray-800 text-gray-500"
                }`}
              >
                🚀 Generate
              </button>
            )}
          </div>
        </div>
      </header>

      {backendOk === false && (
        <div className="mx-auto max-w-4xl px-4 pt-3">
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <strong>API key not configured.</strong> Add{" "}
            <code className="text-red-400">LLAMAGEN_API_KEY</code> to your{" "}
            <code className="text-red-400">.env.local</code> file and restart the server.
          </div>
        </div>
      )}

      <nav className="border-b border-gray-800 bg-gray-900/50">
        <div className="mx-auto flex max-w-4xl gap-1 px-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === t.id ? "text-amber-400" : "text-gray-400 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <span>{t.icon}</span>
                <span>{t.label}</span>
                {t.count !== undefined && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-xs ${
                      activeTab === t.id ? "bg-amber-500/20" : "bg-gray-700"
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </span>
              {activeTab === t.id && (
                <div className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t bg-amber-500" />
              )}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-4 py-6">
        {/* ── Prompt tab ── */}
        {activeTab === "prompt" && (
          <div className="space-y-6">
            <div>
              <label className="mb-2 block text-xs font-medium text-gray-400">Use case</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {USE_CASES.map((uc) => (
                  <button
                    key={uc.id}
                    onClick={() => setUseCase(uc.id)}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      useCase === uc.id
                        ? "border-amber-500 bg-amber-500/10"
                        : "border-gray-700 bg-gray-800/50 hover:border-gray-500"
                    }`}
                  >
                    <div className="text-sm font-medium">{uc.label}</div>
                    <div className="mt-0.5 text-xs text-gray-500">{uc.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {useCase === 4 ? (
              <div className="space-y-4">
                <h2 className="text-lg font-bold">Structured Prompt (LlamaGen template)</h2>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-400">
                      [Visual Style] — Genre, art style, color palette, lighting
                    </label>
                    <textarea
                      value={template.visualStyle}
                      onChange={(e) =>
                        setTemplate((t) => ({ ...t, visualStyle: e.target.value }))
                      }
                      placeholder="Genre: cinematic anime. Art style: clean line-art. Color palette: warm dusk. Lighting: soft rim."
                      rows={3}
                      className="w-full resize-none rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-400">
                      [Story] — Premise, conflict, emotional tone
                    </label>
                    <textarea
                      value={template.story}
                      onChange={(e) => setTemplate((t) => ({ ...t, story: e.target.value }))}
                      placeholder="Premise: fox detective helps lost child. Conflict: nightfall approaching. Tone: warm, hopeful."
                      rows={3}
                      className="w-full resize-none rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-400">
                      [Characters] — Name, role, appearance, personality
                    </label>
                    <textarea
                      value={template.characters}
                      onChange={(e) =>
                        setTemplate((t) => ({ ...t, characters: e.target.value }))
                      }
                      placeholder="Ren (fox detective): slim build, tan coat, calm eyes. Mino (child): short bob hair, yellow raincoat."
                      rows={3}
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-400">
                      [Constraints] — Aspect ratio, forbidden elements
                    </label>
                    <textarea
                      value={template.constraints}
                      onChange={(e) =>
                        setTemplate((t) => ({ ...t, constraints: e.target.value }))
                      }
                      placeholder="Preserve character face consistency; no text watermark; high detail background."
                      rows={2}
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Panels are added in the Panels tab. Per-panel prompts are merged into the final
                  prompt.
                </p>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">
                  Story / Prompt
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={EXAMPLE_PROMPT}
                  rows={10}
                  className="w-full resize-none rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 font-mono text-xs text-white focus:border-amber-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Use the recommended template structure for best results. See docs for [Visual
                  Style], [Story], [Characters], [Panels], [Constraints].
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Options tab ── */}
        {activeTab === "options" && (
          <div className="space-y-8">
            <h2 className="text-lg font-bold">Generation options</h2>

            {/* Preset */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Preset</label>
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
              >
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Size */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Size</label>
              <div className="grid grid-cols-3 gap-2">
                {SIZES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSize(s.id)}
                    className={`rounded-lg border p-2 text-left text-xs transition-all ${
                      size === s.id
                        ? "border-amber-500 bg-amber-500/10"
                        : "border-gray-700 bg-gray-800/50"
                    }`}
                  >
                    <div className="font-medium">{s.label}</div>
                    <div className="text-gray-500">{s.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Panel count toggle */}
            <div>
              <div className="mb-2 flex items-center gap-3">
                <label className="text-xs font-medium text-gray-400">Panel count</label>
                <PaginationToggle
                  paginationMode={paginationMode}
                  onToggle={setPaginationMode}
                />
              </div>
              {paginationMode ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Total pages</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={pagination.totalPages}
                      onChange={(e) =>
                        setPagination((p) => ({
                          ...p,
                          totalPages: Math.max(1, parseInt(e.target.value) || 1),
                        }))
                      }
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Panels per page</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={pagination.panelsPerPage}
                      onChange={(e) =>
                        setPagination((p) => ({
                          ...p,
                          panelsPerPage: Math.min(20, Math.max(1, parseInt(e.target.value) || 4)),
                        }))
                      }
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-xs text-gray-500">
                    Panels per page (1–20)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={fixPanelNum}
                    onChange={(e) =>
                      setFixPanelNum(
                        Math.min(20, Math.max(1, parseInt(e.target.value, 10) || 4)),
                      )
                    }
                    className="w-24 rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* Language */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Upscale */}
            <div>
              <label className="mb-2 block text-xs font-medium text-gray-400">Upscale</label>
              <div className="flex gap-2">
                {[
                  { id: "", label: "None" },
                  { id: "2K", label: "2K" },
                  { id: "4K", label: "4K" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setUpscale(opt.id)}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                      upscale === opt.id
                        ? "border-amber-500 bg-amber-500/10 text-amber-400"
                        : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-500"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Locations */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Locations (comicLocations)
                  </h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Background reference images for consistent locations
                  </p>
                </div>
                <button
                  onClick={() =>
                    setLocations((p) => [
                      ...p,
                      {
                        id: uid("loc"),
                        name: "",
                        imageUrl: "",
                        imageFile: null,
                        imagePreview: null,
                      },
                    ])
                  }
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-gray-900 transition-colors hover:bg-amber-400"
                >
                  + Add Location
                </button>
              </div>
              {locations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-700 py-8 text-center">
                  <div className="mb-1 text-3xl">🗺️</div>
                  <p className="text-xs text-gray-500">No locations added</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {locations.map((loc) => (
                    <LocationCard
                      key={loc.id}
                      location={loc}
                      isUploading={uploadingLocs.has(loc.id)}
                      onUpdate={(u) =>
                        setLocations((p) => p.map((x) => (x.id === u.id ? u : x)))
                      }
                      onRemove={() =>
                        setLocations((p) => p.filter((x) => x.id !== loc.id))
                      }
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Attachments */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Attachments</h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Page-level reference files (style guides, scripts, etc.)
                  </p>
                </div>
                <button
                  onClick={() =>
                    setAttachments((p) => [
                      ...p,
                      { id: uid("att"), title: "", file: null, url: "" },
                    ])
                  }
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-gray-900 transition-colors hover:bg-amber-400"
                >
                  + Add Attachment
                </button>
              </div>
              {attachments.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-700 py-8 text-center">
                  <div className="mb-1 text-3xl">📎</div>
                  <p className="text-xs text-gray-500">No attachments added</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {attachments.map((att) => (
                    <AttachmentItem
                      key={att.id}
                      attachment={att}
                      isUploading={uploadingAtts.has(att.id)}
                      onUpdate={(u) =>
                        setAttachments((p) => p.map((x) => (x.id === u.id ? u : x)))
                      }
                      onRemove={() =>
                        setAttachments((p) => p.filter((x) => x.id !== att.id))
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Characters tab ── */}
        {activeTab === "characters" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Characters (comicRoles)</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  name, age, gender, dress, image (URL or file upload)
                </p>
              </div>
              <button
                onClick={addCharacter}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-amber-400"
              >
                + Add Character
              </button>
            </div>
            {characters.length === 0 ? (
              <div className="py-16 text-center">
                <div className="mb-3 text-5xl">👤</div>
                <p className="text-gray-400">No characters</p>
                <button
                  onClick={addCharacter}
                  className="mt-4 rounded-lg bg-gray-800 px-4 py-2 text-sm transition-colors hover:bg-gray-700"
                >
                  Add character
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {characters.map((c) => (
                  <CharacterCard
                    key={c.id}
                    character={c}
                    isUploading={uploadingChars.has(c.id)}
                    onUpdate={(u) =>
                      setCharacters((p) => p.map((x) => (x.id === u.id ? u : x)))
                    }
                    onRemove={() => {
                      setCharacters((p) => p.filter((x) => x.id !== c.id));
                      if (expandedChar === c.id) setExpandedChar(null);
                    }}
                    isExpanded={expandedChar === c.id}
                    onToggle={() => setExpandedChar(expandedChar === c.id ? null : c.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Panels tab ── */}
        {activeTab === "panels" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Per-panel prompts</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Each panel becomes a section in the [Panels] part of the prompt
                </p>
              </div>
              <button
                onClick={addPanelPrompt}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-amber-400"
              >
                + Add Panel
              </button>
            </div>
            {panelPrompts.length === 0 ? (
              <div className="py-16 text-center">
                <div className="mb-3 text-5xl">🎬</div>
                <p className="text-gray-400">No panels</p>
                <button
                  onClick={addPanelPrompt}
                  className="mt-4 rounded-lg bg-gray-800 px-4 py-2 text-sm transition-colors hover:bg-gray-700"
                >
                  Add panel
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {panelPrompts.map((p, idx) => (
                  <PanelPromptCard
                    key={p.id}
                    panel={p}
                    index={idx}
                    onUpdate={(u) =>
                      setPanelPrompts((prev) => prev.map((x) => (x.id === u.id ? u : x)))
                    }
                    onRemove={() =>
                      setPanelPrompts((prev) => prev.filter((x) => x.id !== p.id))
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Result tab ── */}
        {activeTab === "result" && (
          <GenerationView
            comicId={comicId}
            phase={genPhase}
            error={genError}
            allPages={allPages}
            elapsed={elapsed}
            onReset={handleReset}
            onRegenDone={(status) => setAllPages(statusToPages(status))}
            onContinueDone={(status) => setAllPages(statusToPages(status))}
          />
        )}
      </main>
    </div>
  );
}
