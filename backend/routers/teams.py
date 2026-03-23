from fastapi import APIRouter
from pydantic import BaseModel
from services.supabase_client import get_supabase

router = APIRouter(prefix="/teams", tags=["teams"])


class WatchlistRequest(BaseModel):
    team_id: str
    player_id: str


def _alias_team(t: dict) -> dict:
    """Add frontend-expected aliases to a team row."""
    t["players_bought"] = t.get("roster_count", 0)
    t["max_players"]    = t.get("max_slots", 0)
    t["max_wallet"]     = 200000  # fixed starting budget
    return t


# ── Static routes FIRST ────────────────────────────────────────────────────

@router.get("/")
def get_all_teams():
    supabase = get_supabase()
    teams = supabase.table("teams").select("*").order("name").execute().data
    return [_alias_team(t) for t in (teams or [])]


@router.get("/watchlist/all")
def get_all_watchlists():
    supabase = get_supabase()
    return supabase.table("watchlist")\
        .select("*, players(*), teams(*)")\
        .execute().data


@router.get("/bids/history")
def get_bid_history():
    """
    Returns bid history for the player currently on the block.
    No player_id param needed — fetched from auction_state.
    """
    supabase = get_supabase()

    state = supabase.table("auction_state")\
        .select("current_player_id")\
        .eq("id", 1).single().execute().data

    player_id = state.get("current_player_id") if state else None
    if not player_id:
        return []

    return supabase.table("bids")\
        .select("*, teams(name)")\
        .eq("player_id", player_id)\
        .order("created_at", desc=True)\
        .execute().data


# ── Dynamic routes AFTER ──────────────────────────────────────────────────

@router.get("/{team_id}")
def get_team(team_id: str):
    supabase = get_supabase()
    t = supabase.table("teams")\
        .select("*")\
        .eq("id", team_id)\
        .single()\
        .execute().data
    return _alias_team(t) if t else {}


@router.get("/{team_id}/roster")
def get_roster(team_id: str):
    supabase = get_supabase()
    players = supabase.table("players")\
        .select("*")\
        .eq("sold_to_team", team_id)\
        .eq("status", "sold")\
        .execute().data
    # alias player fields for frontend
    for p in (players or []):
        p["cls"]        = p.get("class")
        p["sold_price"] = p.get("sold_amount")
    return players


@router.get("/{team_id}/watchlist")
def get_watchlist(team_id: str):
    supabase = get_supabase()
    rows = supabase.table("watchlist")\
        .select("*, players(*)")\
        .eq("team_id", team_id)\
        .execute().data
    # flatten: return player objects with aliases
    players = []
    for row in (rows or []):
        p = row.get("players") or {}
        p["cls"]        = p.get("class")
        p["sold_price"] = p.get("sold_amount")
        players.append(p)
    return players


@router.post("/watchlist")
def add_to_watchlist(body: WatchlistRequest):
    supabase = get_supabase()
    supabase.table("watchlist").insert({
        "team_id":   body.team_id,
        "player_id": body.player_id,
    }).execute()
    return {"ok": True}


@router.delete("/watchlist")
def remove_from_watchlist(body: WatchlistRequest):
    supabase = get_supabase()
    supabase.table("watchlist")\
        .delete()\
        .eq("team_id",   body.team_id)\
        .eq("player_id", body.player_id)\
        .execute()
    return {"ok": True}