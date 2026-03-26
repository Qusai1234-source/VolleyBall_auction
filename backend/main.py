from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.requests import Request
from dotenv import load_dotenv
from routers import auction, players, teams
import os
import traceback

load_dotenv()

app = FastAPI(title="Volleyball Auction API")

# ── CORS ──────────────────────────────────────────────────────────────────────
# Add your Vercel production URL to this list before deploying.
# e.g. "https://your-app.vercel.app"
allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://volley-ball-auction.vercel.app"
]

# Allow any extra origin set via env var (e.g. FRONTEND_URL=https://your-app.vercel.app)
extra_origin = os.getenv("FRONTEND_URL")
if extra_origin:
    allowed_origins.append(extra_origin)

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auction.router)
app.include_router(players.router)
app.include_router(teams.router)

# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok"}

# ── Debug (remove or protect before going live) ───────────────────────────────
@app.get("/debug")
def debug():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")

    if not url or not key:
        return {"error": "env vars missing", "url": url, "key": key[:10] if key else None}

    try:
        from services.supabase_client import get_supabase
        supabase = get_supabase()
        res = supabase.table("players").select("id, name, status").limit(5).execute()
        return {
            "env_ok":     True,
            "url":        url,
            "key_prefix": key[:15],
            "sample":     res.data,
            "count":      len(res.data),
        }
    except Exception as e:
        return {"error": str(e)}

# ── Global error handler ──────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "trace": traceback.format_exc()},
    )
