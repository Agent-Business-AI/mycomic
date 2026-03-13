"""
Comic Pilot — FastAPI Backend
==============================
Connects the React frontend to the LlamaGen Internal API.

Full character + comic flow (per Postman collection):
  1. POST /api/characters/upload-file → Upload photo (proxy: backend uploads to S3, avoids CORS)
  2. POST /api/characters/create   → Create character from uploaded photo
  3. POST /api/generate            → Create comic with characters attached

Endpoints:
  POST /api/characters/upload   → Get presigned S3 URL (for direct upload; may hit CORS)
  POST /api/characters/upload-file → Upload file via proxy (recommended; no CORS)
  POST /api/characters/create   → Create character from uploaded photo (LlamaGen Create Character)
  GET  /api/characters/{id}/detail → Get character detail (for comicRoles)
  POST /api/generate            → Submit comic generation job
  GET  /api/status/{comic_id}   → Quick status check
  GET  /api/result/{comic_id}   → Full result with panel images
  GET  /api/health              → Health check

Required env vars:
  LLAMAGEN_SESSION_TOKEN  — Session cookie from llamagen.ai browser session
  CORS_ORIGINS            — Comma-separated allowed origins (default: http://localhost:5555)

Usage:
  pip install -r requirements.txt
  Copy .env.example to .env and set LLAMAGEN_SESSION_TOKEN (from llamagen.ai cookie).
  uvicorn comic_pilot_backend:app --reload --port 8000
"""

import os

from dotenv import load_dotenv

# Load .env from same directory as this file. override=True so .env wins over
# any value you previously exported in the terminal (e.g. the placeholder).
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"), override=True)

import json
import time
import asyncio
from typing import Optional
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# =============================================================================
# Configuration
# =============================================================================

LLAMAGEN_BASE = "https://llamagen.ai/api"
REQUEST_TIMEOUT = 30.0
POLL_INTERVAL = 5  # seconds (matches SDK pattern)
MAX_POLL_ATTEMPTS = 60  # 5 minutes max


# Placeholder values that mean "you didn't replace this in .env"
_PLACEHOLDER_TOKENS = frozenset({
    "your-llamagen-session-token",
    "your-session-token-here",
    "paste-your-token-here",
    "your-token-here",
})


def _get_session_token() -> str:
    token = os.environ.get("LLAMAGEN_SESSION_TOKEN", "").strip()
    if not token:
        raise HTTPException(
            status_code=500,
            detail="LLAMAGEN_SESSION_TOKEN not set. Get it from browser: "
            "DevTools → Application → Cookies → __Secure-next-auth.session-token",
        )
    if token.lower() in _PLACEHOLDER_TOKENS:
        raise HTTPException(
            status_code=500,
            detail=(
                "LLAMAGEN_SESSION_TOKEN in .env is still the placeholder. "
                "Replace it with your real token: log in at https://llamagen.ai → DevTools → Application → Cookies → copy __Secure-next-auth.session-token value into .env"
            ),
        )
    return token


def _cookies() -> dict:
    return {"__Secure-next-auth.session-token": _get_session_token()}


def _headers() -> dict:
    """Base headers for LlamaGen. Use _headers_with_cookie() to include Cookie explicitly."""
    return {
        "accept": "*/*",
        "origin": "https://llamagen.ai",
        "referer": "https://llamagen.ai/",
    }


def _headers_with_cookie() -> dict:
    """Headers including explicit Cookie header so the token is definitely sent."""
    token = _get_session_token()
    # Log token sent on each LlamaGen request (for debugging auth issues)
    print(f"[LlamaGen Auth] Token sent with request: {token!r}")
    return {
        **_headers(),
        "Cookie": f"__Secure-next-auth.session-token={token}",
    }


def _redact_token(token: str) -> str:
    """For debug output: show first 4 and last 4 chars, length."""
    if not token or len(token) < 12:
        return "<empty or too short>"
    return f"{token[:4]}...{token[-4:]} (len={len(token)})"


async def _get_user_id() -> str:
    """
    Fetch current user ID from LlamaGen session. Required for presigned path and auth.
    Raises HTTPException if session is invalid or expired.
    """
    url = "https://llamagen.ai/api/auth/session"
    print(f"[LlamaGen] GET {url} with Cookie (token {_redact_token(_get_session_token())})")
    resp = await _client.get(
        url,
        headers=_headers_with_cookie(),
    )
    print(f"[LlamaGen] Session response: status={resp.status_code}, body={resp.text[:200]}")
    if resp.status_code != 200:
        raise HTTPException(
            status_code=401,
            detail="Session invalid or expired. Log in again at https://llamagen.ai, then update LLAMAGEN_SESSION_TOKEN in .env with the new __Secure-next-auth.session-token cookie value.",
        )
    data = resp.json()
    # LlamaGen returns userId at root and/or user.id; user object may not have id
    if not data:
        raise HTTPException(
            status_code=401,
            detail="Session expired or not logged in. Get a fresh token: https://llamagen.ai → DevTools → Application → Cookies → __Secure-next-auth.session-token",
        )
    user_id = (data.get("userId") or "").strip() or (data.get("user") or {}).get("id") or ""
    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="Could not read user ID from session. Try re-logging in at llamagen.ai and updating .env with a new session token.",
        )
    return user_id


# =============================================================================
# HTTP Client (shared across requests)
# =============================================================================

_client: Optional[httpx.AsyncClient] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _client
    _client = httpx.AsyncClient(timeout=REQUEST_TIMEOUT)
    yield
    await _client.aclose()


# =============================================================================
# FastAPI App
# =============================================================================

app = FastAPI(
    title="Comic Pilot Backend",
    description="Proxy backend for LlamaGen Internal API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow the Next.js frontend
origins = os.environ.get("CORS_ORIGINS", "http://localhost:5555").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Models — match the React frontend's data structures
# =============================================================================


class Character(BaseModel):
    name: str
    description: str = ""
    gender: str = "male"
    age: int = 25
    bodyType: str = "average"
    defaultEmotion: str = "Happy"
    defaultPose: str = "Standing with hands on hips"
    imageUrl: str = ""  # S3 URL after upload
    characterId: Optional[str] = None  # From Create Character API; used for full comicRoles


class Scene(BaseModel):
    description: str
    captionText: str = ""
    location: str = ""
    timeOfDay: str = ""
    lighting: str = ""
    cameraShot: str = ""
    negativePrompt: str = ""
    seed: Optional[int] = None


class ComicSettings(BaseModel):
    comicTitle: str = "Untitled Comic"
    storyPrompt: str = ""
    preset: str = "comedyComicBook2"
    layout: str = "Layout0"
    font: str = "cartoonist"
    fontSize: str = "12"  # LlamaGen expects "12" per Postman
    lang: str = "en"
    size: str = "1024,1024"
    showCaption: bool = True
    needDialogs: bool = True
    bubble: str = "undefined"


class GenerateRequest(BaseModel):
    characters: list[Character]
    scenes: list[Scene]
    settings: ComicSettings = ComicSettings()


class PresignedRequest(BaseModel):
    fileName: str
    fileType: str = "image/jpeg"


class CreateCharacterRequest(BaseModel):
    """Request to create a character via LlamaGen Create Character API."""
    name: str
    imageUrl: str  # S3 URL from upload step (https://s.llamagen.ai/u/{userId}/{fileName})
    gender: str = "female"
    ethnicity: str = "White"
    age: int = 30
    bodyType: str = "Normal"  # Normal, Slim, Athletic, Heavy
    hairStyle: str = "long"
    hairColor: str = "brown"
    dress: str = ""
    description: str = ""


# =============================================================================
# Helper: Build the LlamaGen prompt using discovered syntax
# Pattern: CharacterName(((styling)), bodyType X, Emotion, Pose) img is [scene]
# =============================================================================


def build_prompt(characters: list[Character], scene: Scene) -> str:
    if not scene.description:
        return ""

    # Find characters mentioned in the scene description
    referenced = [
        c for c in characters if c.name and c.name.lower() in scene.description.lower()
    ]

    if not referenced:
        return scene.description

    # Build structured prompt with character descriptors
    char_parts = []
    for c in referenced:
        styling = c.description or "casual clothing"
        char_parts.append(
            f"{c.name}((({styling})), bodyType {c.bodyType}, "
            f"{c.defaultEmotion}, {c.defaultPose})"
        )

    return f"{', '.join(char_parts)} img is {scene.description}"


# =============================================================================
# Helper: Build the full multipart/form-data payload
# =============================================================================


def _build_comic_role_from_detail(detail: dict, name_override: str = "") -> dict:
    """
    Build comicRole object from LlamaGen character detail response.
    Matches Postman 'Create Comic with Characters' format.
    """
    name = name_override or detail.get("name", "")
    image_url = detail.get("imageUrl") or detail.get("backImageUrl") or ""
    char_data_raw = detail.get("characterData", "{}")
    try:
        char_data = json.loads(char_data_raw) if isinstance(char_data_raw, str) else (char_data_raw or {})
    except json.JSONDecodeError:
        char_data = {}

    return {
        "actor": name,
        "name": name,
        "id": detail.get("id", ""),
        "from": "user",
        "style": char_data.get("style", "photo"),
        "characterType": char_data.get("characterType", "Human"),
        "gender": char_data.get("gender", "female"),
        "ethnicity": char_data.get("ethnicity", "White"),
        "age": int(char_data.get("age", 30)) if isinstance(char_data.get("age"), (int, float)) else int(char_data.get("age", "30") or 30),
        "bodyType": char_data.get("bodyType", "Normal"),
        "skin": char_data.get("skin", "Fair"),
        "hairStyle": char_data.get("hairStyle", "long"),
        "hairColor": char_data.get("hairColor", "brown"),
        "dress": char_data.get("dress", ""),
        "expression": char_data.get("expression", ""),
        "equipment": char_data.get("equipment", ""),
        "viewAngle": char_data.get("viewAngle", "halfBody"),
        "characterDisplay": char_data.get("characterDisplay", "front"),
        "seed": char_data.get("seed", 0) or detail.get("seed", 0),
        "image": image_url,
        "backImage": detail.get("backImageUrl") or image_url,
        "shortDescription": char_data.get("shortDescription", ""),
        "fullDescription": char_data.get("fullDescription", ""),
    }


def build_form_data(req: GenerateRequest, comic_roles_override: Optional[list] = None) -> dict:
    chars = req.characters
    scenes = req.scenes
    s = req.settings

    # Parse size
    size_parts = s.size.split(",")
    w = int(size_parts[0].strip())
    h = int(size_parts[1].strip()) if len(size_parts) > 1 else w

    # Build comicRoles: use override if provided (from character details), else build simple format
    if comic_roles_override is not None:
        comic_roles = comic_roles_override
    else:
        # Simple comicRoles format — match Postman keys (image/backImage, expression)
        comic_roles = []
        for c in chars:
            role = {
                "actor": c.name,
                "name": c.name,
                "from": "user",
                "style": "photo",
                "characterType": "Human",
                "gender": c.gender or "female",
                "ethnicity": "White",
                "age": c.age,
                "bodyType": _to_llamagen_body_type(c.bodyType),
                "skin": "Fair",
                "hairStyle": "long",
                "hairColor": "brown",
                "dress": c.description or "",
                "expression": c.defaultEmotion or "",
                "equipment": "",
                "viewAngle": "halfBody",
                "characterDisplay": "front",
                "seed": 0,
                "image": c.imageUrl or "",
                "backImage": c.imageUrl or "",
                "shortDescription": c.description or "",
                "fullDescription": "",
            }
            comic_roles.append(role)

    # Build comicData panels — match Postman format exactly
    # Per-panel fields: assetUrl, panel, instructions, prompt, caption, status, failedCode, llama
    panels = []
    for i, scene in enumerate(scenes):
        # Combine scene metadata into instructions for richer context
        extra_parts = []
        if scene.location:
            extra_parts.append(f"Location: {scene.location}")
        if scene.timeOfDay:
            extra_parts.append(f"Time: {scene.timeOfDay}")
        if scene.lighting:
            extra_parts.append(f"Lighting: {scene.lighting}")
        if scene.cameraShot:
            extra_parts.append(f"Camera: {scene.cameraShot}")
        instructions = scene.description
        if extra_parts:
            instructions = f"{scene.description}. {'; '.join(extra_parts)}"
        panels.append(
            {
                "assetUrl": "",
                "panel": i,
                "instructions": instructions,
                "prompt": build_prompt(chars, scene),
                "caption": scene.captionText or "",
                "status": "LOADING",
                "failedCode": 0,
                "llama": [w, h],
            }
        )

    comic_data = [
        {
            "page": 0,
            "panels": panels,
            "prompt": s.storyPrompt or ". ".join(sc.description for sc in scenes),
            "layout": s.layout,
        }
    ]

    # Full form payload — matches the Internal API exactly
    overall_prompt = s.storyPrompt or ". ".join(sc.description for sc in scenes)
    return {
        "prompt": overall_prompt,
        "name": s.comicTitle or overall_prompt[:100],
        "preset": s.preset,
        "layout": s.layout,
        "pagePanelsNum": str(len(scenes)),
        "llama": f"[{w}, {h}]",
        "font": s.font,
        "fontSize": s.fontSize or "12",
        "lang": s.lang,
        "showCaption": str(s.showCaption).lower(),
        "needDialogs": str(s.needDialogs).lower(),
        "bubble": s.bubble,
        "useCase": "COMIC",
        "direct_mode": "false",
        "deepframe": "false",
        "identifyStyle": "false",
        "uploadedAttachments": str(any(c.imageUrl for c in chars)).lower(),
        "tags": '["comic"]',
        "comicRoles": json.dumps(comic_roles),
        "comicLocations": "[]",
        "composeAudiencePrompt": "",
        "linkFileId": "null",
        "comicData": json.dumps(comic_data),
    }


# =============================================================================
# Endpoints
# =============================================================================


@app.get("/api/health")
async def health():
    """Health check. Also verifies session token is set."""
    has_token = bool(os.environ.get("LLAMAGEN_SESSION_TOKEN", "").strip())
    return {"status": "ok", "llamagen_auth": has_token}


@app.get("/api/debug/session")
async def debug_session():
    """
    Debug: verify token is loaded and what LlamaGen returns when we send it.
    Open http://localhost:8000/api/debug/session in browser or curl.
    """
    token = os.environ.get("LLAMAGEN_SESSION_TOKEN", "").strip()
    out = {
        "token_set": bool(token),
        "token_length": len(token),
        "token_preview": _redact_token(token) if token else "<not set>",
        "cookie_header": None,
        "session_url": "https://llamagen.ai/api/auth/session",
        "session_response_status": None,
        "session_response_body": None,
        "session_ok": False,
        "user_id": None,
    }
    if not token:
        return out

    out["cookie_header"] = f"__Secure-next-auth.session-token={_redact_token(token)} (full token is sent to LlamaGen)"

    try:
        resp = await _client.get(
            "https://llamagen.ai/api/auth/session",
            headers=_headers_with_cookie(),
        )
        out["session_response_status"] = resp.status_code
        out["session_response_body"] = resp.text[:500] if resp.text else None
        if resp.status_code == 200 and resp.text:
            try:
                data = resp.json()
                out["session_ok"] = bool(data.get("user") or data.get("userId"))
                out["user_id"] = (data.get("userId") or "").strip() or ((data.get("user") or {}).get("id") if isinstance(data.get("user"), dict) else None)
            except Exception:
                pass
    except Exception as e:
        out["session_response_body"] = f"Request failed: {e!r}"

    return out


@app.post("/api/characters/upload")
async def get_presigned_url(req: PresignedRequest):
    """
    Step 1 of character photo upload.
    Returns a presigned S3 URL from LlamaGen.

    Flow: Frontend uploads to this presigned URL, then uses the
    resulting S3 URL as the character's imageUrl.
    """
    # LlamaGen requires the real user ID from the session for the upload path
    user_id = await _get_user_id()
    payload = {
        "fileName": req.fileName,
        "fileType": req.fileType,
        "filePath": f"u/{user_id}/",
    }

    url = f"{LLAMAGEN_BASE}/files/presigned"
    print(f"[LlamaGen] POST {url} filePath=u/{user_id}/ with Cookie (token {_redact_token(_get_session_token())})")
    resp = await _client.post(
        url,
        json=payload,
        headers=_headers_with_cookie(),
    )
    print(f"[LlamaGen] Presigned response: status={resp.status_code}, body={resp.text[:300]}")

    if resp.status_code != 200:
        detail = resp.text
        if resp.status_code == 401 or "Unauthorized" in detail or "error" in detail.lower():
            detail = (
                "Session expired or invalid. Log in again at https://llamagen.ai, then copy the new "
                "__Secure-next-auth.session-token from DevTools → Application → Cookies and update your .env file."
            )
        else:
            detail = f"Presigned URL failed: {resp.text}"
        raise HTTPException(status_code=resp.status_code, detail=detail)

    data = resp.json()
    # LlamaGen returns signedUrl or url; key is e.g. "u/{userId}/{fileName}"
    presigned_url = data.get("url") or data.get("signedUrl") or ""
    key = data.get("key", "")
    file_url = f"https://s.llamagen.ai/{key}" if key else f"https://s.llamagen.ai/u/{user_id}/{req.fileName}"
    return {
        **data,
        "url": presigned_url,
        "signedUrl": presigned_url,
        "fileUrl": file_url,
        "presignedUrl": presigned_url,
    }


@app.post("/api/characters/upload-file")
async def upload_character_file(file: UploadFile = File(...)):
    """
    Proxy upload: accepts file from frontend, uploads to S3 via presigned URL.

    Use this instead of direct S3 upload to avoid CORS (S3 bucket may not allow
    browser origins). Frontend POSTs file here; backend uploads to S3.
    """
    import re
    # Sanitize filename for S3 (keep extension, replace problematic chars)
    raw_name = file.filename or "image.jpg"
    base, ext = os.path.splitext(raw_name)
    safe_base = re.sub(r"[^\w\-.]", "_", base)[:80]
    fileName = f"{safe_base}{ext}" if ext else f"{safe_base}.jpg"

    file_type = file.content_type or "image/jpeg"
    user_id = await _get_user_id()

    # Get presigned URL
    payload = {"fileName": fileName, "fileType": file_type, "filePath": f"u/{user_id}/"}
    resp = await _client.post(
        f"{LLAMAGEN_BASE}/files/presigned",
        json=payload,
        headers=_headers_with_cookie(),
    )
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"Presigned failed: {resp.text[:300]}")

    data = resp.json()
    presigned_url = data.get("url") or data.get("signedUrl") or ""
    key = data.get("key", "")
    if not presigned_url:
        raise HTTPException(status_code=500, detail="No presigned URL in response")

    # Read file and upload to S3 (server-side, no CORS)
    content = await file.read()
    put_resp = await _client.put(
        presigned_url,
        content=content,
        headers={"Content-Type": file_type},
    )
    if put_resp.status_code not in (200, 204):
        raise HTTPException(
            status_code=502,
            detail=f"S3 upload failed: {put_resp.status_code} {put_resp.text[:200]}",
        )

    file_url = f"https://s.llamagen.ai/{key}" if key else f"https://s.llamagen.ai/u/{user_id}/{fileName}"
    return {"fileUrl": file_url, "fileName": fileName, "key": key}


# Map pilot bodyType to LlamaGen characterData bodyType
_BODY_TYPE_MAP = {
    "slim": "Slim",
    "athletic": "Athletic",
    "average": "Normal",
    "muscular": "Athletic",
    "curvy": "Normal",
    "heavyset": "Heavy",
}


def _to_llamagen_body_type(bt: str) -> str:
    return _BODY_TYPE_MAP.get((bt or "").lower(), "Normal")


async def _resolve_comic_roles(chars: list[Character]) -> list[dict]:
    """
    Resolve comicRoles for generate: fetch character details for characterId,
    fallback to simple format for others.
    """
    comic_roles = []
    for c in chars:
        if c.characterId:
            for attempt in range(MAX_POLL_ATTEMPTS):
                detail_resp = await _client.get(
                    f"{LLAMAGEN_BASE}/artworks/{c.characterId}/detail?_t={int(time.time() * 1000)}",
                    headers=_headers_with_cookie(),
                )
                if detail_resp.status_code != 200:
                    break
                detail = detail_resp.json()
                status = detail.get("status", "")
                if status == "PROCESSED":
                    role = _build_comic_role_from_detail(detail, c.name)
                    comic_roles.append(role)
                    print(f"[GENERATE] Character {c.name!r} loaded from detail (id={c.characterId})")
                    break
                if status in ("FAILED", "ERROR"):
                    break
                await asyncio.sleep(2)
            else:
                pass  # timeout
        if not any(r.get("name") == c.name for r in comic_roles):
            comic_roles.append({
                "actor": c.name,
                "name": c.name,
                "from": "user",
                "style": "photo",
                "characterType": "Human",
                "gender": c.gender or "female",
                "ethnicity": "White",
                "age": c.age,
                "bodyType": _to_llamagen_body_type(c.bodyType),
                "skin": "Fair",
                "hairStyle": "long",
                "hairColor": "brown",
                "dress": c.description or "",
                "expression": c.defaultEmotion or "",
                "equipment": "",
                "viewAngle": "halfBody",
                "characterDisplay": "front",
                "seed": 0,
                "image": c.imageUrl or "",
                "backImage": c.imageUrl or "",
                "shortDescription": c.description or "",
                "fullDescription": "",
            })
    return comic_roles


@app.post("/api/characters/create")
async def create_character(req: CreateCharacterRequest):
    """
    Step 3 of character flow: Create character from uploaded photo via LlamaGen.

    Requires imageUrl from step 2 (upload to presigned URL).
    Returns character artwork ID for use in comic generation.
    """
    import random
    seed = random.randint(1, 2_000_000_000)
    body_type = _to_llamagen_body_type(req.bodyType)
    character_data = {
        "gender": req.gender.lower(),
        "ethnicity": req.ethnicity,
        "age": str(req.age),
        "bodyType": body_type,
        "hairStyle": req.hairStyle or "long",
        "hairColor": req.hairColor or "brown",
        "dress": req.dress or (req.description[:200] if req.description else "casual clothing"),
        "seed": seed,
        "style": "photo",
        "image": req.imageUrl,
        "expression": "",
        "equipment": "",
        "viewAngle": "halfBody",
        "characterDisplay": "front",
        "characterType": "Human",
        "description": req.description or "",
        "characterPrompt": "",
    }
    prompt = f"((masterpiece,best quality))photo, one {req.gender}, {req.ethnicity}, {req.age} years old, {body_type} bodytype"

    form_data = {
        "action": "createCharacter",
        "useCase": "CHARACTER",
        "tags": '["character"]',
        "name": req.name,
        "seed": str(seed),
        "preset": "(No style)",
        "prompt": prompt,
        "description": req.description or "",
        "characterData": json.dumps(character_data),
    }

    url = f"{LLAMAGEN_BASE}/artworks"
    print(f"[LlamaGen] POST {url} createCharacter name={req.name!r}")
    resp = await _client.post(
        url,
        data=form_data,
        headers=_headers_with_cookie(),
    )
    print(f"[LlamaGen] Create character response: status={resp.status_code}, body={resp.text[:400]}")

    if resp.status_code != 200:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Create character failed: {resp.text[:500]}",
        )

    data = resp.json()
    artwork = data.get("artwork") or {}
    character_id = artwork.get("id") if isinstance(artwork, dict) else data.get("id")
    if not character_id:
        raise HTTPException(
            status_code=500,
            detail=f"No character ID in response: {json.dumps(data)[:500]}",
        )

    return {
        "characterId": character_id,
        "status": artwork.get("status", "LOADING") if isinstance(artwork, dict) else "LOADING",
        "raw": data,
    }


@app.get("/api/characters/{character_id}/detail")
async def get_character_detail(character_id: str):
    """
    Get full character detail from LlamaGen. Use comicRoles from response for comic generation.

    Poll until status is PROCESSED before using in comics.
    """
    ts = int(time.time() * 1000)
    url = f"{LLAMAGEN_BASE}/artworks/{character_id}/detail?_t={ts}"
    resp = await _client.get(url, headers=_headers_with_cookie())

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text[:500])

    return resp.json()


@app.post("/api/generate")
async def generate_comic(req: GenerateRequest):
    """
    Submit a comic generation job to LlamaGen Internal API.

    Accepts characters + scenes + settings from the frontend.
    For characters with characterId (from Create Character), fetches character
    detail and uses full comicRoles format. Otherwise uses simple format.

    Returns the comic ID for polling.
    """
    comic_roles = await _resolve_comic_roles(req.characters)
    form_data = build_form_data(req, comic_roles_override=comic_roles)

    # Debug: log the payload keys being sent
    print(f"\n{'='*60}")
    print(f"[GENERATE] Sending to LlamaGen API...")
    print(f"  Characters: {len(req.characters)}")
    print(f"  Scenes: {len(req.scenes)}")
    print(f"  Preset: {req.settings.preset}")
    print(f"  Payload keys: {list(form_data.keys())}")
    print(f"  comicRoles preview: {form_data.get('comicRoles', '')[:200]}")
    print(f"{'='*60}\n")

    resp = await _client.post(
        f"{LLAMAGEN_BASE}/artworks",
        data=form_data,
        headers=_headers_with_cookie(),
    )

    # Debug: log the full response
    print(f"\n{'='*60}")
    print(f"[GENERATE] LlamaGen Response:")
    print(f"  Status: {resp.status_code}")
    print(f"  Headers: {dict(resp.headers)}")
    resp_text = resp.text
    print(f"  Body: {resp_text[:1000]}")
    print(f"{'='*60}\n")

    if resp.status_code != 200:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Generation failed (HTTP {resp.status_code}): {resp_text[:500]}",
        )

    # Try to parse response — handle various response formats
    try:
        data = resp.json()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"LlamaGen returned non-JSON response: {resp_text[:500]}",
        )

    # LlamaGen returns { "code": 200, "artwork": { "id": "...", "status": "LOADING" } }
    artwork = data.get("artwork") or {}
    comic_id = (
        (artwork.get("id") if isinstance(artwork, dict) else None)
        or data.get("id")
        or data.get("_id")
        or data.get("artworkId")
        or data.get("comicId")
    )

    if not comic_id:
        # Return the full response for debugging
        raise HTTPException(
            status_code=500,
            detail=f"No comic ID in LlamaGen response. Full response: {json.dumps(data)[:800]}",
        )

    print(f"[GENERATE] Success! Comic ID: {comic_id}")

    return {
        "comicId": comic_id,
        "status": artwork.get("status") if isinstance(artwork, dict) else data.get("status") or "LOADING",
        "raw": data,  # Include full response for frontend debugging
        "message": f"Comic generation started. Poll /api/status/{comic_id} for progress.",
    }


@app.get("/api/status/{comic_id}")
async def get_status(comic_id: str):
    """
    Quick status check (lightweight).
    Returns status without full panel data.
    """
    ts = int(time.time() * 1000)
    resp = await _client.get(
        f"{LLAMAGEN_BASE}/artworks/{comic_id}/status?_t={ts}",
        headers=_headers_with_cookie(),
    )

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    return resp.json()


@app.get("/api/progress/{comic_id}")
async def get_progress(comic_id: str):
    """
    Progress check with stage information.
    Returns progress percentage and current stage name.
    """
    ts = int(time.time() * 1000)
    resp = await _client.get(
        f"{LLAMAGEN_BASE}/artworks/{comic_id}/progress?t={ts}",
        headers=_headers_with_cookie(),
    )

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    return resp.json()


@app.get("/api/result/{comic_id}")
async def get_result(comic_id: str):
    """
    Full result with panel images and captions.
    Only useful after status is PROCESSED.
    """
    ts = int(time.time() * 1000)
    resp = await _client.get(
        f"{LLAMAGEN_BASE}/artworks/{comic_id}/detail?_t={ts}",
        headers=_headers_with_cookie(),
    )

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    data = resp.json()

    # Parse comicData for easy frontend consumption
    comic_data_raw = data.get("comicData", "[]")
    try:
        comic_data = json.loads(comic_data_raw) if isinstance(comic_data_raw, str) else comic_data_raw
    except json.JSONDecodeError:
        comic_data = []

    # Extract panels with their images
    panels = []
    for page in comic_data:
        if isinstance(page, dict):
            for panel in page.get("panels", []):
                panels.append(
                    {
                        "panel": panel.get("panel"),
                        "assetUrl": panel.get("assetUrl", ""),
                        "caption": panel.get("caption", ""),
                        "status": panel.get("status", ""),
                        "instruction": panel.get("instruction", ""),
                        "prompt": panel.get("prompt", ""),
                    }
                )

    return {
        "id": data.get("id"),
        "status": data.get("status"),
        "preset": data.get("preset"),
        "panels": panels,
        "raw": data,  # Include raw response for debugging
    }


@app.post("/api/generate-and-wait")
async def generate_and_wait(req: GenerateRequest):
    """
    Convenience endpoint: generate + poll until complete.
    Returns the full result when all panels are ready.

    Warning: This is a long-running request (30-120s typical).
    For production, use /api/generate + /api/status polling from the frontend.
    """
    comic_roles = await _resolve_comic_roles(req.characters)
    form_data = build_form_data(req, comic_roles_override=comic_roles)
    resp = await _client.post(
        f"{LLAMAGEN_BASE}/artworks",
        data=form_data,
        headers=_headers_with_cookie(),
    )

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text[:500])

    data = resp.json()
    artwork = data.get("artwork") or {}
    comic_id = (artwork.get("id") if isinstance(artwork, dict) else None) or data.get("id")
    if not comic_id:
        raise HTTPException(status_code=500, detail="No comic ID in response")

    # Poll until complete
    for attempt in range(MAX_POLL_ATTEMPTS):
        await asyncio.sleep(POLL_INTERVAL)

        ts = int(time.time() * 1000)
        status_resp = await _client.get(
            f"{LLAMAGEN_BASE}/artworks/{comic_id}/detail?_t={ts}",
            headers=_headers_with_cookie(),
        )

        if status_resp.status_code != 200:
            continue

        result = status_resp.json()
        status = result.get("status", "")

        if status == "PROCESSED":
            # Parse and return panels
            comic_data_raw = result.get("comicData", "[]")
            try:
                comic_data = (
                    json.loads(comic_data_raw)
                    if isinstance(comic_data_raw, str)
                    else comic_data_raw
                )
            except json.JSONDecodeError:
                comic_data = []

            panels = []
            for page in comic_data:
                if isinstance(page, dict):
                    for panel in page.get("panels", []):
                        panels.append(
                            {
                                "panel": panel.get("panel"),
                                "assetUrl": panel.get("assetUrl", ""),
                                "caption": panel.get("caption", ""),
                            }
                        )

            return {
                "id": comic_id,
                "status": "PROCESSED",
                "panels": panels,
                "attempts": attempt + 1,
                "elapsed_seconds": (attempt + 1) * POLL_INTERVAL,
            }

        if status in ("FAILED", "ERROR"):
            return {
                "id": comic_id,
                "status": status,
                "error": result.get("failedMessage", "Unknown error"),
                "failedCode": result.get("failedCode"),
            }

    # Timeout
    return {
        "id": comic_id,
        "status": "TIMEOUT",
        "message": f"Still processing after {MAX_POLL_ATTEMPTS * POLL_INTERVAL}s. "
        f"Poll /api/result/{comic_id} manually.",
    }


# =============================================================================
# Run directly
# =============================================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
