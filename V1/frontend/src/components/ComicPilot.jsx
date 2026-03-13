import { useState, useCallback, useRef, useEffect } from "react";

const API_BASE = "http://localhost:8000";

const PRESETS = [
  { id: "comedyComicBook2", label: "Comedy Comic", icon: "😄" },
  { id: "manga", label: "Manga", icon: "🎌" },
  { id: "manhwa", label: "Manhwa", icon: "🇰🇷" },
  { id: "webtoon", label: "Webtoon", icon: "📱" },
  { id: "americanComic", label: "American Comic", icon: "🦸" },
  { id: "noir", label: "Noir", icon: "🌑" },
];
const LAYOUTS = [
  { id: "Layout0", label: "Standard Grid" },
  { id: "Layout1", label: "Wide Panels" },
  { id: "Layout2", label: "Vertical Strip" },
];
const FONTS = [
  { id: "cartoonist", label: "Cartoonist" },
  { id: "manga", label: "Manga" },
  { id: "handwritten", label: "Handwritten" },
];
const GENDERS = ["male", "female", "other"];
const BODY_TYPES = ["slim", "athletic", "average", "muscular", "curvy", "heavyset"];
const EMOTIONS = ["Happy", "Sad", "Angry", "Surprised", "Determined", "Scared", "Calm", "Excited", "Thoughtful"];
const POSES = [
  "Standing with hands on hips", "Walking forward", "Sitting down", "Running",
  "Pointing at something", "Arms crossed", "Waving", "Jumping", "Crouching",
];

let _idC = 0;
const uid = (p = "id") => `${p}_${++_idC}_${Date.now()}`;

function buildPrompt(characters, scene) {
  if (!scene.description) return "";
  const refs = characters.filter((c) => c.name && scene.description.toLowerCase().includes(c.name.toLowerCase()));
  if (refs.length === 0) return scene.description;
  const parts = refs.map((c) => {
    const styling = c.description || "casual clothing";
    return `${c.name}(((${styling})), bodyType ${c.bodyType || "average"}, ${c.defaultEmotion || "Happy"}, ${c.defaultPose || "Standing with hands on hips"})`;
  });
  return `${parts.join(", ")} img is ${scene.description}`;
}

const api = {
  async health() {
    const r = await fetch(`${API_BASE}/api/health`);
    return r.json();
  },
  async uploadCharacterPhoto(file) {
    // Proxy via backend to avoid CORS (S3 bucket blocks browser direct uploads)
    const form = new FormData();
    form.append("file", file);
    const r = await fetch(`${API_BASE}/api/characters/upload-file`, {
      method: "POST",
      body: form,
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || `Upload failed: ${r.status}`);
    }
    const data = await r.json();
    return data.fileUrl;
  },
  async createCharacter({ name, imageUrl, gender, age, bodyType, description }) {
    const r = await fetch(`${API_BASE}/api/characters/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        imageUrl,
        gender: gender || "female",
        age: age || 25,
        bodyType: bodyType || "Normal",
        description: description || "",
      }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || `Create character failed: ${r.status}`);
    }
    return r.json();
  },
  async generate(characters, scenes, settings) {
    const payload = {
      characters: characters.map((c) => ({
        name: c.name, description: c.description, gender: c.gender,
        age: c.age, bodyType: c.bodyType, defaultEmotion: c.defaultEmotion,
        defaultPose: c.defaultPose, imageUrl: c.s3Url || "",
        characterId: c.characterId || null,
      })),
      scenes: scenes.map((s) => ({
        description: s.description, captionText: s.captionText || "",
        location: s.location || "", timeOfDay: s.timeOfDay || "",
        lighting: s.lighting || "", cameraShot: s.cameraShot || "",
        negativePrompt: s.negativePrompt || "", seed: s.seed || null,
      })),
      settings: {
        comicTitle: settings.comicTitle || "Untitled Comic",
        storyPrompt: settings.storyPrompt || "",
        preset: settings.preset, layout: settings.layout,
        font: settings.font, fontSize: settings.fontSize || "12",
        lang: settings.lang, size: settings.size,
        showCaption: settings.showCaption, needDialogs: settings.needDialogs,
        bubble: settings.bubble || "undefined",
      },
    };
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
  async getProgress(comicId) {
    const r = await fetch(`${API_BASE}/api/progress/${comicId}`);
    if (!r.ok) return null;
    return r.json();
  },
  async getResult(comicId) {
    const r = await fetch(`${API_BASE}/api/result/${comicId}`);
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
          <div className="text-xs text-gray-400 truncate">{c.gender} · {c.age}y · {c.bodyType}{c.characterId ? " · ✓ character" : c.s3Url ? " · 📸 uploaded" : c.imageFile ? " · 📸 pending" : ""}</div>
        </div>
        {isUploading && <span className="text-xs text-amber-400 animate-pulse">Uploading...</span>}
        <span className="text-gray-500 text-sm">{isExpanded ? "▲" : "▼"}</span>
      </button>
      {isExpanded && (
        <div className="border-t border-gray-700 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Name *</label>
              <input type="text" value={c.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Emi, Phil..." className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none" />
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
              <input type="number" min="0" max="150" value={c.age} onChange={(e) => update("age", parseInt(e.target.value) || 0)} className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Body Type</label>
              <select value={c.bodyType} onChange={(e) => update("bodyType", e.target.value)} className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none">
                {BODY_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Visual Description</label>
            <textarea value={c.description} onChange={(e) => update("description", e.target.value)} placeholder="e.g. white toy poodle with red collar..." rows={2} className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Default Emotion</label>
              <select value={c.defaultEmotion} onChange={(e) => update("defaultEmotion", e.target.value)} className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none">
                {EMOTIONS.map((em) => <option key={em} value={em}>{em}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Default Pose</label>
              <select value={c.defaultPose} onChange={(e) => update("defaultPose", e.target.value)} className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none">
                {POSES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Reference Photo</label>
            <div className="flex items-start gap-3">
              {c.imagePreview ? (
                <div className="relative group">
                  <img src={c.imagePreview} alt="" className="w-20 h-20 rounded-lg object-cover border border-gray-600" />
                  <button onClick={() => onUpdate({ ...c, imagePreview: null, imageFile: null, s3Url: "", characterId: null })} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                  {c.s3Url && <div className="absolute bottom-0 left-0 right-0 bg-green-600/80 text-[9px] text-center text-white py-0.5 rounded-b-lg">✓ S3</div>}
                </div>
              ) : (
                <label className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-600 hover:border-amber-500 cursor-pointer transition-colors flex flex-col items-center justify-center text-gray-500 hover:text-amber-500">
                  <span className="text-xl">📷</span><span className="text-[10px] mt-0.5">Upload</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpdate({ ...c, imageFile: f, imagePreview: URL.createObjectURL(f), s3Url: "" }); }} />
                </label>
              )}
              <p className="text-xs text-gray-500 mt-1">Flow: Presigned URL → Upload to S3 → Create Character → attached to comic.</p>
            </div>
          </div>
          <button onClick={onRemove} className="text-xs text-red-400 hover:text-red-300 transition-colors mt-2">Remove Character</button>
        </div>
      )}
    </div>
  );
}

function SceneCard({ scene: s, index, characters, onUpdate, onRemove, isExpanded, onToggle }) {
  const update = (f, v) => onUpdate({ ...s, [f]: v });
  const mentioned = characters.filter((c) => c.name && s.description.toLowerCase().includes(c.name.toLowerCase()));
  return (
    <div className="bg-gray-800/80 rounded-xl border border-gray-700 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-3 hover:bg-gray-700/50 transition-colors text-left">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shrink-0">{index + 1}</div>
        <div className="flex-1 min-w-0">
          <div className="text-white font-medium truncate">{s.description || "Empty Scene"}</div>
          <div className="text-xs text-gray-400">{mentioned.length > 0 ? mentioned.map((c) => c.name).join(", ") : "No characters"}</div>
        </div>
        <span className="text-gray-500 text-sm">{isExpanded ? "▲" : "▼"}</span>
      </button>
      {isExpanded && (
        <div className="border-t border-gray-700 p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Scene Description * <span className="text-amber-400">(use character names!)</span></label>
            <textarea value={s.description} onChange={(e) => update("description", e.target.value)} placeholder={`e.g. "${characters[0]?.name || "Emi"} is standing in front of the Eiffel Tower"`} rows={3} className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none resize-none" />
            {characters.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {characters.map((c) => {
                  const m = c.name && s.description.toLowerCase().includes(c.name.toLowerCase());
                  return (
                    <button key={c.id} onClick={() => { if (!m && c.name) update("description", s.description + (s.description ? " " : "") + c.name); }}
                      className={`text-xs px-2 py-0.5 rounded-full transition-colors ${m ? "bg-amber-500/20 text-amber-400 border border-amber-500/40" : "bg-gray-700 text-gray-400 border border-gray-600 hover:border-amber-500 cursor-pointer"}`}>
                      {m ? "✓ " : "+ "}{c.name || "Unnamed"}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Caption / Dialog</label>
            <input type="text" value={s.captionText} onChange={(e) => update("captionText", e.target.value)} placeholder='"Wow, Paris is beautiful!"' className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Location</label>
              <input type="text" value={s.location || ""} onChange={(e) => update("location", e.target.value)} placeholder="Paris" className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Time</label>
              <select value={s.timeOfDay || ""} onChange={(e) => update("timeOfDay", e.target.value)} className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none">
                <option value="">Auto</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option><option value="night">Night</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Camera</label>
              <select value={s.cameraShot || ""} onChange={(e) => update("cameraShot", e.target.value)} className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none">
                <option value="">Auto</option><option value="close-up">Close-up</option><option value="medium">Medium</option><option value="wide">Wide</option><option value="bird-eye">Bird's Eye</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Negative Prompt</label>
            <input type="text" value={s.negativePrompt || ""} onChange={(e) => update("negativePrompt", e.target.value)} placeholder="blurry, low quality, extra limbs" className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none" />
          </div>
          <div className="bg-gray-900/80 rounded-lg p-3 border border-gray-700">
            <div className="text-xs font-medium text-gray-400 mb-1">API Prompt Preview</div>
            <code className="text-xs text-amber-300 break-all leading-relaxed">{buildPrompt(characters, s) || "— enter description —"}</code>
          </div>
          <button onClick={onRemove} className="text-xs text-red-400 hover:text-red-300 transition-colors">Remove Scene</button>
        </div>
      )}
    </div>
  );
}

function GenerationView({ comicId, phase, progress, error, panels, elapsed, onReset }) {
  const stages = ["Submitting...", "Writing story...", "Drawing scenes...", "Adding details...", "Assembling..."];
  const stageIdx = progress > 80 ? 4 : progress > 60 ? 3 : progress > 30 ? 2 : progress > 5 ? 1 : 0;

  if (phase === "done" && panels.length > 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-green-400">Comic Generated!</h2>
            <p className="text-xs text-gray-500">{panels.length} panels · {elapsed}s · ID: <code className="text-amber-400">{comicId}</code></p>
          </div>
          <button onClick={onReset} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors">← New Comic</button>
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: panels.length <= 2 ? "repeat(2,1fr)" : panels.length <= 4 ? "repeat(2,1fr)" : "repeat(3,1fr)" }}>
          {panels.map((p, i) => (
            <div key={i} className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700">
              {p.assetUrl ? <img src={p.assetUrl} alt={`Panel ${i + 1}`} className="w-full aspect-square object-cover" /> : <div className="w-full aspect-square bg-gray-900 flex items-center justify-center text-gray-600">No image</div>}
              {p.caption && <div className="p-3 border-t border-gray-700"><p className="text-sm text-gray-300">{p.caption}</p></div>}
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
        <div className="absolute inset-0 flex items-center justify-center text-amber-400 font-bold text-lg">{progress > 0 ? `${Math.round(progress)}%` : "..."}</div>
      </div>
      <div>
        <h2 className="text-lg font-bold">{stages[stageIdx]}</h2>
        <p className="text-xs text-gray-500 mt-1">ID: <code className="text-amber-400">{comicId || "..."}</code> · {elapsed}s</p>
      </div>
      <div className="max-w-xs mx-auto">
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-1000" style={{ width: `${Math.max(progress, 5)}%` }} />
        </div>
      </div>
    </div>
  );
}

export default function ComicPilot() {
  const [characters, setCharacters] = useState([]);
  const [expandedChar, setExpandedChar] = useState(null);
  const [scenes, setScenes] = useState([]);
  const [expandedScene, setExpandedScene] = useState(null);
  const [settings, setSettings] = useState({
    comicTitle: "", storyPrompt: "", preset: "comedyComicBook2", layout: "Layout0",
    font: "cartoonist", fontSize: "12", lang: "en", size: "1024,1024", showCaption: true, needDialogs: true, bubble: "undefined",
  });
  const [activeTab, setActiveTab] = useState("characters");
  const [genPhase, setGenPhase] = useState("idle");
  const [comicId, setComicId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [panels, setPanels] = useState([]);
  const [genError, setGenError] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [uploadingChars, setUploadingChars] = useState(new Set());
  const [backendOk, setBackendOk] = useState(null);

  const pollRef = useRef(null);
  const startRef = useRef(null);

  useEffect(() => { api.health().then((r) => setBackendOk(r.llamagen_auth)).catch(() => setBackendOk(false)); }, []);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const startPolling = useCallback((id) => {
    startRef.current = Date.now();
    setGenPhase("polling");
    pollRef.current = setInterval(async () => {
      try {
        setElapsed(Math.round((Date.now() - startRef.current) / 1000));
        const prog = await api.getProgress(id);
        if (prog?.progress !== undefined) setProgress(prog.progress);
        const result = await api.getResult(id);
        if (result?.status === "PROCESSED" && result.panels?.length > 0) {
          clearInterval(pollRef.current);
          setPanels(result.panels);
          setGenPhase("done");
        } else if (result?.status === "FAILED" || result?.status === "ERROR") {
          clearInterval(pollRef.current);
          setGenError(result.raw?.failedMessage || "Generation failed");
          setGenPhase("error");
        }
      } catch (e) { console.error("Poll error:", e); }
    }, 5000);
  }, []);

  const handleGenerate = async () => {
    try {
      setGenPhase("uploading");
      setActiveTab("result");
      setProgress(0); setPanels([]); setGenError(null); setElapsed(0);

      const updatedChars = [...characters];
      for (let i = 0; i < updatedChars.length; i++) {
        const c = updatedChars[i];
        const hasPhoto = c.imageFile || c.s3Url;
        if (!hasPhoto) continue;
        if (c.imageFile && !c.s3Url) {
          setUploadingChars((p) => new Set([...p, c.id]));
          try {
            const fileUrl = await api.uploadCharacterPhoto(c.imageFile);
            updatedChars[i] = { ...c, s3Url: fileUrl };
            if (c.name && fileUrl) {
              const created = await api.createCharacter({
                name: c.name,
                imageUrl: fileUrl,
                gender: c.gender,
                age: c.age,
                bodyType: c.bodyType,
                description: c.description,
              });
              updatedChars[i] = { ...updatedChars[i], characterId: created.characterId };
            }
          } catch (e) { console.warn(`Photo/character setup failed for ${c.name}:`, e); }
          setUploadingChars((p) => { const n = new Set(p); n.delete(c.id); return n; });
        } else if (c.s3Url && !c.characterId && c.name) {
          try {
            const created = await api.createCharacter({
              name: c.name,
              imageUrl: c.s3Url,
              gender: c.gender,
              age: c.age,
              bodyType: c.bodyType,
              description: c.description,
            });
            updatedChars[i] = { ...c, characterId: created.characterId };
          } catch (e) { console.warn(`Create character failed for ${c.name}:`, e); }
        }
      }
      setCharacters(updatedChars);

      setGenPhase("generating");
      const result = await api.generate(updatedChars, scenes, settings);
      if (!result.comicId) throw new Error("No comic ID returned");
      setComicId(result.comicId);
      startPolling(result.comicId);
    } catch (e) {
      setGenError(e.message || "Generation failed");
      setGenPhase("error");
    }
  };

  const handleReset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setGenPhase("idle"); setComicId(null); setProgress(0); setPanels([]); setGenError(null); setElapsed(0); setActiveTab("characters");
  };

  const addCharacter = () => { const c = { id: uid("ch"), name: "", gender: "male", age: 25, bodyType: "average", description: "", defaultEmotion: "Happy", defaultPose: "Standing with hands on hips", imageFile: null, imagePreview: null, s3Url: "", characterId: null }; setCharacters((p) => [...p, c]); setExpandedChar(c.id); setActiveTab("characters"); };
  const addScene = () => { const s = { id: uid("sc"), description: "", captionText: "", location: "", timeOfDay: "", lighting: "", cameraShot: "", negativePrompt: "", seed: null }; setScenes((p) => [...p, s]); setExpandedScene(s.id); setActiveTab("scenes"); };
  const moveScene = (id, dir) => { setScenes((p) => { const idx = p.findIndex((s) => s.id === id); if ((dir === -1 && idx === 0) || (dir === 1 && idx === p.length - 1)) return p; const n = [...p]; [n[idx], n[idx + dir]] = [n[idx + dir], n[idx]]; return n; }); };

  const isReady = characters.length > 0 && scenes.length > 0 && characters.every((c) => c.name) && scenes.every((s) => s.description) && genPhase === "idle";
  const isGenerating = ["uploading", "generating", "polling"].includes(genPhase);

  const tabs = [
    { id: "characters", label: "Characters", count: characters.length, icon: "👤" },
    { id: "scenes", label: "Scenes", count: scenes.length, icon: "🎬" },
    { id: "settings", label: "Settings", icon: "⚙️" },
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
              <h1 className="text-base font-bold tracking-tight">Comic Pilot</h1>
              <p className="text-xs text-gray-500">LlamaGen Internal API → FastAPI → React</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${backendOk === true ? "bg-green-500/15 text-green-400" : backendOk === false ? "bg-red-500/15 text-red-400" : "bg-gray-700 text-gray-400"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${backendOk === true ? "bg-green-400" : backendOk === false ? "bg-red-400" : "bg-gray-500"}`} />
              {backendOk === true ? "Backend OK" : backendOk === false ? "Offline" : "..."}
            </div>
            {!isGenerating && (
              <button onClick={handleGenerate} disabled={!isReady || backendOk !== true}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${isReady && backendOk === true ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-gray-900 shadow-lg shadow-amber-500/20" : "bg-gray-800 text-gray-500 cursor-not-allowed"}`}>
                🚀 Generate{scenes.length > 0 ? ` (${scenes.length})` : ""}
              </button>
            )}
          </div>
        </div>
      </header>

      {backendOk === false && (
        <div className="max-w-4xl mx-auto px-4 mt-3">
          <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-300">
            <strong>Backend not reachable</strong> at <code className="text-red-400">{API_BASE}</code>. Run the backend first (see README).
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
        {activeTab === "characters" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div><h2 className="text-lg font-bold">Characters</h2><p className="text-xs text-gray-500 mt-0.5">Each → comicRoles. Photos: Presigned URL → S3 upload → Create Character.</p></div>
              <button onClick={addCharacter} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-gray-900 rounded-lg text-sm font-medium transition-colors">+ Add Character</button>
            </div>
            {characters.length === 0 ? (
              <div className="py-16 text-center"><div className="text-5xl mb-3">👤</div><p className="text-gray-400">No characters yet</p><button onClick={addCharacter} className="mt-4 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors">Create first character</button></div>
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

        {activeTab === "scenes" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div><h2 className="text-lg font-bold">Scenes</h2><p className="text-xs text-gray-500 mt-0.5">Each scene = one panel. Reference character names in descriptions.</p></div>
              <button onClick={addScene} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-gray-900 rounded-lg text-sm font-medium transition-colors">+ Add Scene</button>
            </div>
            {characters.length === 0 && <div className="px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300">💡 Create characters first, then reference them by name.</div>}
            {scenes.length === 0 ? (
              <div className="py-16 text-center"><div className="text-5xl mb-3">🎬</div><p className="text-gray-400">No scenes yet</p><button onClick={addScene} className="mt-4 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors">Create first scene</button></div>
            ) : (
              <div className="space-y-2">{scenes.map((s, idx) => (
                <div key={s.id} className="flex gap-2 items-start">
                  <div className="flex flex-col gap-0.5 pt-3">
                    <button onClick={() => moveScene(s.id, -1)} disabled={idx === 0} className="w-6 h-6 rounded bg-gray-800 text-gray-400 hover:text-white disabled:opacity-20 text-xs flex items-center justify-center">▲</button>
                    <button onClick={() => moveScene(s.id, 1)} disabled={idx === scenes.length - 1} className="w-6 h-6 rounded bg-gray-800 text-gray-400 hover:text-white disabled:opacity-20 text-xs flex items-center justify-center">▼</button>
                  </div>
                  <div className="flex-1">
                    <SceneCard scene={s} index={idx} characters={characters}
                      onUpdate={(u) => setScenes((p) => p.map((x) => x.id === u.id ? u : x))}
                      onRemove={() => { setScenes((p) => p.filter((x) => x.id !== s.id)); if (expandedScene === s.id) setExpandedScene(null); }}
                      isExpanded={expandedScene === s.id} onToggle={() => setExpandedScene(expandedScene === s.id ? null : s.id)} />
                  </div>
                </div>
              ))}</div>
            )}
          </div>
        )}

        {activeTab === "settings" && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold">Settings</h2>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-gray-400 mb-1">Comic Title</label><input type="text" value={settings.comicTitle} onChange={(e) => setSettings((s) => ({ ...s, comicTitle: e.target.value }))} placeholder="My Comic" className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none" /></div>
              <div><label className="block text-xs font-medium text-gray-400 mb-1">Story Prompt (optional)</label><textarea value={settings.storyPrompt} onChange={(e) => setSettings((s) => ({ ...s, storyPrompt: e.target.value }))} placeholder="Overall story..." rows={2} className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none resize-none" /></div>
            </div>
            <div><label className="block text-xs font-medium text-gray-400 mb-2">Style</label>
              <div className="grid grid-cols-3 gap-2">{PRESETS.map((p) => (
                <button key={p.id} onClick={() => setSettings((s) => ({ ...s, preset: p.id }))} className={`p-3 rounded-xl border text-left transition-all ${settings.preset === p.id ? "border-amber-500 bg-amber-500/10" : "border-gray-700 bg-gray-800/50 hover:border-gray-500"}`}>
                  <span className="text-2xl">{p.icon}</span><div className="text-sm font-medium mt-1">{p.label}</div>
                </button>
              ))}</div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><label className="block text-xs font-medium text-gray-400 mb-1">Layout</label><select value={settings.layout} onChange={(e) => setSettings((s) => ({ ...s, layout: e.target.value }))} className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none">{LAYOUTS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></div>
              <div><label className="block text-xs font-medium text-gray-400 mb-1">Font</label><select value={settings.font} onChange={(e) => setSettings((s) => ({ ...s, font: e.target.value }))} className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none">{FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></div>
              <div><label className="block text-xs font-medium text-gray-400 mb-1">Language</label><select value={settings.lang} onChange={(e) => setSettings((s) => ({ ...s, lang: e.target.value }))} className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none"><option value="en">English</option><option value="de">Deutsch</option><option value="fr">Français</option><option value="ja">日本語</option></select></div>
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={settings.showCaption} onChange={(e) => setSettings((s) => ({ ...s, showCaption: e.target.checked }))} className="w-4 h-4 rounded" /><span className="text-sm text-gray-300">Captions</span></label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={settings.needDialogs} onChange={(e) => setSettings((s) => ({ ...s, needDialogs: e.target.checked }))} className="w-4 h-4 rounded" /><span className="text-sm text-gray-300">Dialogs</span></label>
            </div>
            <div><label className="block text-xs font-medium text-gray-400 mb-1">Panel Size</label>
              <div className="flex gap-2">{[{ id: "1024,1024", l: "1024²" }, { id: "1024,1792", l: "1024×1792" }, { id: "1792,1024", l: "1792×1024" }].map((sz) => (
                <button key={sz.id} onClick={() => setSettings((s) => ({ ...s, size: sz.id }))} className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${settings.size === sz.id ? "bg-amber-500/20 border border-amber-500 text-amber-400" : "bg-gray-800 border border-gray-700 text-gray-400"}`}>{sz.l}</button>
              ))}</div>
            </div>
          </div>
        )}

        {activeTab === "result" && (
          <GenerationView comicId={comicId} phase={genPhase} progress={progress} error={genError} panels={panels} elapsed={elapsed} onReset={handleReset} />
        )}
      </main>
    </div>
  );
}
