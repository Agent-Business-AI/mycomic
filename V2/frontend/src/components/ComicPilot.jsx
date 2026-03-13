import { useState, useCallback, useRef, useEffect } from "react";

const API_BASE = "http://localhost:8000";

const PRESETS = [
  { id: "render", label: "Render (default)", icon: "🎨" },
  { id: "neutral", label: "Neutral", icon: "📐" },
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

const GENDERS = ["male", "female"];

const USE_CASES = [
  { id: 1, label: "Single prompt", desc: "Default with one prompt" },
  { id: 2, label: "Custom options", desc: "Preset, size, panel count" },
  { id: 3, label: "Character consistency", desc: "Add characters (URL or file)" },
  { id: 4, label: "Per-panel prompts", desc: "Structured prompt with panel details" },
];

let _idC = 0;
const uid = (p = "id") => `${p}_${++_idC}_${Date.now()}`;

/**
 * Build full prompt from structured template (use case 4).
 * Matches LlamaGen docs format exactly:
 * [Panels]
 * 1) Panel objective:
 *    - Scene description:
 *    - Character action:
 *    - Dialogue / caption:
 */
function buildStructuredPrompt(template, panelPrompts) {
  const parts = [];
  if (template.visualStyle) parts.push(`[Visual Style]\n${template.visualStyle}`);
  if (template.story) parts.push(`[Story]\n${template.story}`);
  if (template.characters) parts.push(`[Characters]\n${template.characters}`);
  if (panelPrompts?.length > 0) {
    const panelText = panelPrompts
      .map(
        (p, i) =>
          `${i + 1}) Panel objective: ${p.panelObjective || ""}\n   - Scene description: ${p.sceneDescription || ""}\n   - Character action: ${p.characterAction || ""}\n   - Dialogue / caption: ${p.dialogueCaption || ""}`
      )
      .join("\n\n");
    parts.push(`[Panels]\n${panelText}`);
  }
  if (template.constraints) parts.push(`[Constraints]\n${template.constraints}`);
  return parts.join("\n\n");
}

/** Example prompt from LlamaGen docs */
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
    const r = await fetch(`${API_BASE}/api/health`);
    return r.json();
  },
  async upload(file) {
    const form = new FormData();
    form.append("file", file);
    const r = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: form });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || `Upload failed: ${r.status}`);
    }
    const data = await r.json();
    return data.fileUrl;
  },
  async generate(payload) {
    const r = await fetch(`${API_BASE}/api/generate`, {
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
    const r = await fetch(`${API_BASE}/api/status/${id}`);
    if (!r.ok) return null;
    return r.json();
  },
};

function CharacterCard({ character: c, onUpdate, onRemove, isExpanded, onToggle, isUploading }) {
  const update = (f, v) => onUpdate({ ...c, [f]: v });
  return (
    <div className="bg-gray-800/80 rounded-xl border border-gray-700 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-3 hover:bg-gray-700/50 transition-colors text-left">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden">
          {c.imagePreview ? <img src={c.imagePreview} alt="" className="w-full h-full object-cover" /> : c.name?.charAt(0)?.toUpperCase() || "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white font-medium truncate">{c.name || "New Character"}</div>
          <div className="text-xs text-gray-400 truncate">{c.gender} · {c.age}y · {c.dress || "no dress"}{c.imageUrl ? " · ✓ image" : c.imageFile ? " · 📸 pending" : ""}</div>
        </div>
        {isUploading && <span className="text-xs text-amber-400 animate-pulse">Uploading...</span>}
        <span className="text-gray-500 text-sm">{isExpanded ? "▲" : "▼"}</span>
      </button>
      {isExpanded && (
        <div className="border-t border-gray-700 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Name *</label>
              <input type="text" value={c.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Ren, Mino" className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Gender</label>
              <select value={c.gender} onChange={(e) => update("gender", e.target.value)} className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none">
                {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Age</label>
              <input type="number" min="0" max="150" value={c.age} onChange={(e) => update("age", parseInt(e.target.value) || 25)} className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Dress / Clothing</label>
              <input type="text" value={c.dress || ""} onChange={(e) => update("dress", e.target.value)} placeholder="e.g. red cape, hoodie" className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Reference Image URL</label>
            <input type="url" value={c.imageUrl || ""} onChange={(e) => update("imageUrl", e.target.value)} placeholder="https:// or upload file below" className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Or upload file</label>
            <div className="flex items-start gap-3">
              {c.imagePreview ? (
                <div className="relative group">
                  <img src={c.imagePreview} alt="" className="w-20 h-20 rounded-lg object-cover border border-gray-600" />
                  <button onClick={() => onUpdate({ ...c, imagePreview: null, imageFile: null, imageUrl: "" })} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                  {c.imageUrl && <div className="absolute bottom-0 left-0 right-0 bg-green-600/80 text-[9px] text-center text-white py-0.5 rounded-b-lg">✓</div>}
                </div>
              ) : (
                <label className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-600 hover:border-amber-500 cursor-pointer transition-colors flex flex-col items-center justify-center text-gray-500 hover:text-amber-500">
                  <span className="text-xl">📷</span><span className="text-[10px] mt-0.5">Upload</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpdate({ ...c, imageFile: f, imagePreview: URL.createObjectURL(f), imageUrl: "" }); }} />
                </label>
              )}
              <p className="text-xs text-gray-500 mt-1">Public API comicRoles: name, age, gender, dress, image (URL or file upload)</p>
            </div>
          </div>
          <button onClick={onRemove} className="text-xs text-red-400 hover:text-red-300 transition-colors mt-2">Remove Character</button>
        </div>
      )}
    </div>
  );
}

/**
 * Per-panel prompt card — matches LlamaGen docs format:
 * Panel objective, Scene description, Character action, Dialogue / caption
 */
function PanelPromptCard({ panel, index, onUpdate, onRemove }) {
  const update = (f, v) => onUpdate({ ...panel, [f]: v });
  return (
    <div className="bg-gray-800/80 rounded-xl border border-gray-700 overflow-hidden">
      <div className="p-3 flex items-center justify-between">
        <span className="text-white font-medium">Panel {index + 1}</span>
        <button onClick={onRemove} className="text-xs text-red-400 hover:text-red-300">Remove</button>
      </div>
      <div className="border-t border-gray-700 p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Panel objective</label>
          <input type="text" value={panel.panelObjective || ""} onChange={(e) => update("panelObjective", e.target.value)} placeholder="e.g. Wide shot of rainy alley" className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Scene description</label>
          <input type="text" value={panel.sceneDescription || ""} onChange={(e) => update("sceneDescription", e.target.value)} placeholder="e.g. Ren notices Mino alone near a lantern" className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Character action</label>
          <input type="text" value={panel.characterAction || ""} onChange={(e) => update("characterAction", e.target.value)} placeholder="e.g. Ren kneels, offers map" className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Dialogue / caption</label>
          <input type="text" value={panel.dialogueCaption || ""} onChange={(e) => update("dialogueCaption", e.target.value)} placeholder='"Hello there"' className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none" />
        </div>
      </div>
    </div>
  );
}

function GenerationView({ comicId, phase, progress, error, panels, elapsed, onReset }) {
  if (phase === "done" && (panels?.length > 0 || progress?.output)) {
    const urls = panels?.length > 0 ? panels.map((p) => p.assetUrl).filter(Boolean) : progress?.output ? [progress.output] : [];
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-green-400">Comic Generated!</h2>
            <p className="text-xs text-gray-500">{urls.length} panel(s) · {elapsed}s · ID: <code className="text-amber-400">{comicId}</code></p>
          </div>
          <button onClick={onReset} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors">← New Comic</button>
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: urls.length <= 2 ? "repeat(2,1fr)" : urls.length <= 4 ? "repeat(2,1fr)" : "repeat(3,1fr)" }}>
          {urls.map((url, i) => (
            <div key={i} className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700">
              {url ? <img src={url} alt={`Panel ${i + 1}`} className="w-full aspect-square object-cover" /> : <div className="w-full aspect-square bg-gray-900 flex items-center justify-center text-gray-600">No image</div>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="text-center py-16 space-y-4">
        <div className="text-5xl">❌</div>
        <h2 className="text-lg font-bold text-red-400">Generation Failed</h2>
        <p className="text-sm text-gray-400 max-w-md mx-auto">{error || "Unknown error"}</p>
        <button onClick={onReset} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors">← Try Again</button>
      </div>
    );
  }

  return (
    <div className="text-center py-16 space-y-6">
      <div className="relative inline-block">
        <div className="w-24 h-24 rounded-full border-4 border-gray-700" />
        <div className="absolute inset-0 w-24 h-24 rounded-full border-4 border-amber-500 border-t-transparent animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center text-amber-400 font-bold text-lg">...</div>
      </div>
      <div>
        <h2 className="text-lg font-bold">Generating comic...</h2>
        <p className="text-xs text-gray-500 mt-1">ID: <code className="text-amber-400">{comicId || "..."}</code> · {elapsed}s</p>
      </div>
      <p className="text-xs text-gray-500">Polling every 5s. Public API may take 30–120s.</p>
    </div>
  );
}

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
  const [fixPanelNum, setFixPanelNum] = useState(4);
  const [characters, setCharacters] = useState([]);
  const [expandedChar, setExpandedChar] = useState(null);
  const [activeTab, setActiveTab] = useState("prompt");
  const [genPhase, setGenPhase] = useState("idle");
  const [comicId, setComicId] = useState(null);
  const [result, setResult] = useState(null);
  const [genError, setGenError] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [uploadingChars, setUploadingChars] = useState(new Set());
  const [backendOk, setBackendOk] = useState(null);

  const pollRef = useRef(null);
  const startRef = useRef(null);

  useEffect(() => { api.health().then((r) => setBackendOk(r.sdk_ready)).catch(() => setBackendOk(false)); }, []);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const startPolling = useCallback((id) => {
    startRef.current = Date.now();
    setGenPhase("polling");
    pollRef.current = setInterval(async () => {
      try {
        setElapsed(Math.round((Date.now() - startRef.current) / 1000));
        const prog = await api.getStatus(id);
        if (prog?.status === "SUCCEEDED" || prog?.status === "PROCESSED" || prog?.status === "COMPLETED") {
          clearInterval(pollRef.current);
          setResult(prog);
          setGenPhase("done");
        } else if (prog?.status === "FAILED") {
          clearInterval(pollRef.current);
          setGenError(prog.detail || "Generation failed");
          setGenPhase("error");
        }
      } catch (e) { console.error("Poll error:", e); }
    }, 5000);
  }, []);

  const getFinalPrompt = () => {
    if (useCase === 4 && (template.visualStyle || template.story || template.characters || template.constraints || panelPrompts.length > 0)) {
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
          } catch (e) { console.warn(`Upload failed for ${c.name}:`, e); }
          setUploadingChars((p) => { const n = new Set(p); n.delete(c.id); return n; });
        }
        if (updatedChars[i].imageUrl) {
          comicRoles.push({
            name: updatedChars[i].name,
            age: updatedChars[i].age || 25,
            gender: updatedChars[i].gender || "female",
            dress: updatedChars[i].dress || undefined,
            image: updatedChars[i].imageUrl,
          });
        } else {
          comicRoles.push({
            name: updatedChars[i].name,
            age: updatedChars[i].age || 25,
            gender: updatedChars[i].gender || "female",
            dress: updatedChars[i].dress || undefined,
          });
        }
      }
      setCharacters(updatedChars);

      setGenPhase("generating");
      const payload = {
        prompt: finalPrompt,
        preset: useCase >= 2 ? preset : "render",
        size: useCase >= 2 ? size : "1024x1024",
        fixPanelNum: useCase >= 2 ? fixPanelNum : 4,
        comicRoles: useCase >= 3 ? comicRoles : [],
      };
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
    setActiveTab("prompt");
  };

  const addCharacter = () => {
    const c = { id: uid("ch"), name: "", gender: "female", age: 25, dress: "", imageUrl: "", imageFile: null, imagePreview: null };
    setCharacters((p) => [...p, c]);
    setExpandedChar(c.id);
    setActiveTab("characters");
  };

  const addPanelPrompt = () => {
    setPanelPrompts((p) => [
      ...p,
      { id: uid("pn"), panelObjective: "", sceneDescription: "", characterAction: "", dialogueCaption: "" },
    ]);
    setActiveTab("panels");
  };

  const isReady = (useCase === 4 ? (template.visualStyle || template.story || template.characters || template.constraints || panelPrompts.length > 0) : prompt.trim()) && genPhase === "idle";
  const isGenerating = ["uploading", "generating", "polling"].includes(genPhase);

  const tabs = [
    { id: "prompt", label: "Prompt", icon: "✏️" },
    ...(useCase >= 2 ? [{ id: "options", label: "Options", icon: "⚙️" }] : []),
    ...(useCase >= 3 ? [{ id: "characters", label: "Characters", count: characters.length, icon: "👤" }] : []),
    ...(useCase >= 4 ? [{ id: "panels", label: "Panels", count: panelPrompts.length, icon: "🎬" }] : []),
    ...(genPhase !== "idle" ? [{ id: "result", label: isGenerating ? "Generating..." : genPhase === "done" ? "Result" : "Error", icon: genPhase === "done" ? "✅" : genPhase === "error" ? "❌" : "⏳" }] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&display=swap" rel="stylesheet" />

      <header className="border-b border-gray-800 bg-gray-950/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center text-white font-bold text-sm">C</div>
            <div>
              <h1 className="text-base font-bold tracking-tight">Comic Pilot V2</h1>
              <p className="text-xs text-gray-500">LlamaGen Public API / SDK</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${backendOk === true ? "bg-green-500/15 text-green-400" : backendOk === false ? "bg-red-500/15 text-red-400" : "bg-gray-700 text-gray-400"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${backendOk === true ? "bg-green-400" : backendOk === false ? "bg-red-400" : "bg-gray-500"}`} />
              {backendOk === true ? "SDK Ready" : backendOk === false ? "Offline" : "..."}
            </div>
            {!isGenerating && (
              <button onClick={handleGenerate} disabled={!isReady || backendOk !== true}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${isReady && backendOk === true ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-gray-900 shadow-lg shadow-amber-500/20" : "bg-gray-800 text-gray-500 cursor-not-allowed"}`}>
                🚀 Generate
              </button>
            )}
          </div>
        </div>
      </header>

      {backendOk === false && (
        <div className="max-w-4xl mx-auto px-4 mt-3">
          <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-300">
            <strong>Backend not reachable</strong> at <code className="text-red-400">{API_BASE}</code>. Run the backend and set <code className="text-red-400">LLAMAGEN_API_KEY</code> in .env.
          </div>
        </div>
      )}

      <nav className="border-b border-gray-800 bg-gray-900/50">
        <div className="max-w-4xl mx-auto px-4 flex gap-1">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${activeTab === t.id ? "text-amber-400" : "text-gray-400 hover:text-white"}`}>
              <span className="flex items-center gap-1.5">
                <span>{t.icon}</span><span>{t.label}</span>
                {t.count !== undefined && <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === t.id ? "bg-amber-500/20" : "bg-gray-700"}`}>{t.count}</span>}
              </span>
              {activeTab === t.id && <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-amber-500 rounded-t" />}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {activeTab === "prompt" && (
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">Use case</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {USE_CASES.map((uc) => (
                  <button key={uc.id} onClick={() => setUseCase(uc.id)} className={`p-3 rounded-xl border text-left transition-all ${useCase === uc.id ? "border-amber-500 bg-amber-500/10" : "border-gray-700 bg-gray-800/50 hover:border-gray-500"}`}>
                    <div className="text-sm font-medium">{uc.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{uc.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {useCase === 4 ? (
              <div className="space-y-4">
                <h2 className="text-lg font-bold">Structured Prompt (LlamaGen template)</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">[Visual Style] — Genre, art style, color palette, lighting</label>
                    <textarea value={template.visualStyle} onChange={(e) => setTemplate((t) => ({ ...t, visualStyle: e.target.value }))} placeholder="Genre: cinematic anime. Art style: clean line-art. Color palette: warm dusk. Lighting: soft rim." rows={3} className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">[Story] — Premise, conflict, emotional tone</label>
                    <textarea value={template.story} onChange={(e) => setTemplate((t) => ({ ...t, story: e.target.value }))} placeholder="Premise: fox detective helps lost child. Conflict: nightfall approaching. Tone: warm, hopeful." rows={3} className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">[Characters] — Name, role, appearance, personality</label>
                    <textarea value={template.characters} onChange={(e) => setTemplate((t) => ({ ...t, characters: e.target.value }))} placeholder="Ren (fox detective): slim build, tan coat, calm eyes. Mino (child): short bob hair, yellow raincoat." rows={3} className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">[Constraints] — Aspect ratio, forbidden elements</label>
                    <textarea value={template.constraints} onChange={(e) => setTemplate((t) => ({ ...t, constraints: e.target.value }))} placeholder="Preserve character face consistency; no text watermark; high detail background." rows={2} className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none resize-none" />
                  </div>
                </div>
                <p className="text-xs text-gray-500">Panels are added in the Panels tab. Per-panel prompts are merged into the final prompt.</p>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Story / Prompt</label>
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={EXAMPLE_PROMPT} rows={10} className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none resize-none font-mono text-xs" />
                <p className="text-xs text-gray-500 mt-1">Use the recommended template structure for best results. See docs for [Visual Style], [Story], [Characters], [Panels], [Constraints].</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "options" && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold">Generation options</h2>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">Preset</label>
              <div className="flex gap-2">
                {PRESETS.map((p) => (
                  <button key={p.id} onClick={() => setPreset(p.id)} className={`p-3 rounded-xl border transition-all ${preset === p.id ? "border-amber-500 bg-amber-500/10" : "border-gray-700 bg-gray-800/50"}`}>
                    <span className="text-xl">{p.icon}</span><div className="text-sm font-medium mt-1">{p.label}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">Size</label>
              <div className="grid grid-cols-3 gap-2">
                {SIZES.map((s) => (
                  <button key={s.id} onClick={() => setSize(s.id)} className={`p-2 rounded-lg border text-left text-xs transition-all ${size === s.id ? "border-amber-500 bg-amber-500/10" : "border-gray-700 bg-gray-800/50"}`}>
                    <div className="font-medium">{s.label}</div>
                    <div className="text-gray-500">{s.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Panels per page (1–20)</label>
              <input type="number" min={1} max={20} value={fixPanelNum} onChange={(e) => setFixPanelNum(Math.min(20, Math.max(1, parseInt(e.target.value, 10) || 4)))} className="w-24 px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none" />
            </div>
          </div>
        )}

        {activeTab === "characters" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div><h2 className="text-lg font-bold">Characters (comicRoles)</h2><p className="text-xs text-gray-500 mt-0.5">name, age, gender, dress, image (URL or file upload)</p></div>
              <button onClick={addCharacter} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-gray-900 rounded-lg text-sm font-medium transition-colors">+ Add Character</button>
            </div>
            {characters.length === 0 ? (
              <div className="py-16 text-center"><div className="text-5xl mb-3">👤</div><p className="text-gray-400">No characters</p><button onClick={addCharacter} className="mt-4 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors">Add character</button></div>
            ) : (
              <div className="space-y-2">{characters.map((c) => (
                <CharacterCard key={c.id} character={c} isUploading={uploadingChars.has(c.id)}
                  onUpdate={(u) => setCharacters((p) => p.map((x) => x.id === u.id ? u : x))}
                  onRemove={() => { setCharacters((p) => p.filter((x) => x.id !== c.id)); if (expandedChar === c.id) setExpandedChar(null); }}
                  isExpanded={expandedChar === c.id} onToggle={() => setExpandedChar(expandedChar === c.id ? null : c.id)} />
              ))}</div>
            )}
          </div>
        )}

        {activeTab === "panels" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div><h2 className="text-lg font-bold">Per-panel prompts</h2><p className="text-xs text-gray-500 mt-0.5">Each panel becomes a section in the [Panels] part of the prompt</p></div>
              <button onClick={addPanelPrompt} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-gray-900 rounded-lg text-sm font-medium transition-colors">+ Add Panel</button>
            </div>
            {panelPrompts.length === 0 ? (
              <div className="py-16 text-center"><div className="text-5xl mb-3">🎬</div><p className="text-gray-400">No panels</p><button onClick={addPanelPrompt} className="mt-4 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors">Add panel</button></div>
            ) : (
              <div className="space-y-2">{panelPrompts.map((p, idx) => (
                <PanelPromptCard key={p.id} panel={p} index={idx}
                  onUpdate={(u) => setPanelPrompts((prev) => prev.map((x) => x.id === u.id ? u : x))}
                  onRemove={() => setPanelPrompts((prev) => prev.filter((x) => x.id !== p.id))} />
              ))}</div>
            )}
          </div>
        )}

        {activeTab === "result" && (
          <GenerationView comicId={comicId} phase={genPhase} progress={result} error={genError} panels={result?.panels} elapsed={elapsed} onReset={handleReset} />
        )}
      </main>
    </div>
  );
}
