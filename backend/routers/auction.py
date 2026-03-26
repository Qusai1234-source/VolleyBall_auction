from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services import auction_service
from services.supabase_client import get_supabase
from services.email_service import send_sold_notification
import threading

router = APIRouter(prefix="/auction", tags=["auction"])


# ── Request models ──────────────────────────────────────────────────────────

class BidRequest(BaseModel):
    team_id: str
    amount: int

class DeadlockBidRequest(BaseModel):
    team_id: str
    amount: int

class PullPlayerRequest(BaseModel):
    override_player_id: str | None = None

class SoldRequest(BaseModel):
    player_id: str
    team_id: str
    amount: int

class PauseRequest(BaseModel):
    paused: bool

class DeadlockRequest(BaseModel):
    deadline_seconds: int = 30

class AssignOpeningBidRequest(BaseModel):
    team_id: str
    amount: int          # ← added: admin passes the current bid amount


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/state")
def get_state():
    return auction_service.get_auction_state()


@router.post("/pull-player")
def pull_player(body: PullPlayerRequest):
    result = auction_service.pull_next_player(body.override_player_id)
    if not result["ok"]:
        raise HTTPException(400, result["error"])
    return result


@router.post("/bid")
def place_bid(body: BidRequest):
    supabase = get_supabase()
    res = supabase.rpc("place_bid", {
        "p_team_id": body.team_id,
        "p_amount":  body.amount,
    }).execute()
    if not res.data["ok"]:
        raise HTTPException(400, res.data["error"])
    return res.data


@router.post("/deadlock-bid")
def place_deadlock_bid(body: DeadlockBidRequest):
    supabase = get_supabase()
    state = auction_service.get_auction_state()
    if state["phase"] != "deadlock":
        raise HTTPException(400, "Not in deadlock phase")
    supabase.table("deadlock_bids").upsert({
        "player_id": state["current_player_id"],
        "team_id":   body.team_id,
        "amount":    body.amount,
    }, on_conflict="team_id").execute()
    return {"ok": True}


@router.post("/trigger-deadlock")
def trigger_deadlock(body: DeadlockRequest):
    result = auction_service.trigger_deadlock(body.deadline_seconds)
    if not result["ok"]:
        raise HTTPException(400, result["error"])
    return result


@router.post("/resolve-deadlock")
def resolve_deadlock():
    return auction_service.resolve_deadlock()


@router.post("/sold")
def mark_sold(body: SoldRequest):
    supabase = get_supabase()
    res = supabase.rpc("mark_player_sold", {
        "p_player_id": body.player_id,
        "p_team_id":   body.team_id,
        "p_amount":    body.amount,
    }).execute()
    if not res.data["ok"]:
        raise HTTPException(400, res.data["error"])

    # fire email in background thread — never blocks the sale response
    try:
        player = supabase.table("players").select("*").eq("id", body.player_id).single().execute().data
        team   = supabase.table("teams").select("*").eq("id", body.team_id).single().execute().data
        if player and team:
            def _send():
                send_sold_notification(
                    player_id       = player.get("id", "Unknown"),
                    player_name     = player.get("name", "Unknown"),
                    player_position = player.get("position"),
                    player_class    = player.get("class"),
                    team_name       = team.get("name", "Unknown"),
                    sold_amount     = body.amount,
                    base_price      = player.get("base_price"),
                )
            threading.Thread(target=_send, daemon=True).start()
    except Exception as e:
        print(f"[Email] Could not queue notification: {e}")  # log but never raise

    return res.data


@router.post("/unsold")
def mark_unsold():
    return auction_service.mark_player_unsold()


@router.post("/pause")
def pause():
    return auction_service.pause_auction()


@router.post("/undo")
def undo():
    return auction_service.undo_last()


@router.get("/undo-preview")
def undo_preview():
    return auction_service.get_undo_preview()


@router.get("/reset-preview")
def reset_preview():
    return auction_service.get_reset_preview()



@router.post("/assign-opening-bid")
def assign_opening_bid(body: AssignOpeningBidRequest):
    supabase = get_supabase()
    state = auction_service.get_auction_state()

    if not state.get("current_player_id"):
        raise HTTPException(400, "No active player")
    if state["phase"] not in ("active", "paused"):
        raise HTTPException(400, "Auction is not active")

    # Update bid amount AND leading team in one write
    from datetime import datetime, timezone
    supabase.table("auction_state").update({
        "current_bid":      body.amount,
        "current_bid_team": body.team_id,
        "updated_at":       datetime.now(timezone.utc).isoformat(),
    }).eq("id", 1).execute()

    # Record in bids table (may not exist in some setups)
    try:
        supabase.table("bids").insert({
            "player_id": state["current_player_id"],
            "team_id":   body.team_id,
            "amount":    body.amount,
        }).execute()
    except Exception:
        pass

    # Log the action
    supabase.table("action_log").insert({
        "action":  "bid_placed",
        "payload": {"player_id": state["current_player_id"], "team_id": body.team_id, "amount": body.amount},
    }).execute()

    return {"ok": True, "message": f"Bid updated to ₹{body.amount:,}"}

@router.post("/reset")
def reset_auction():
    result = auction_service.reset_auction()
    if not result["ok"]:
        raise HTTPException(400, result.get("error", "Reset failed"))
    return result