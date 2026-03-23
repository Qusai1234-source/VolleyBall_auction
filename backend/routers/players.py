from fastapi import APIRouter, HTTPException
from services.supabase_client import get_supabase

router = APIRouter(prefix="/players", tags=["players"])


def _alias_player(p: dict) -> dict:
    """Add frontend-expected aliases to a player row."""
    p["cls"]        = p.get("class")
    p["sold_price"] = p.get("sold_amount")
    return p


@router.get("/")
def get_all_players(
    status:   str | None = None,
    position: str | None = None,
    cls:      str | None = None,
):
    supabase = get_supabase()
    try:
        query = supabase.table("players").select("*")

        if status:
            query = query.eq("status", status)
        if position:
            query = query.eq("position", position)
        if cls:
            # DB column is "class", query param is "cls"
            query = query.eq("class", cls)

        players = query.order("pool_order").execute().data
        return [_alias_player(p) for p in (players or [])]

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{player_id}")
def get_player(player_id: str):
    supabase = get_supabase()
    try:
        p = supabase.table("players")\
            .select("*")\
            .eq("id", player_id)\
            .single()\
            .execute().data
        return _alias_player(p)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))