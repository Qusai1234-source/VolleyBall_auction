from services.supabase_client import get_supabase
import random
from datetime import datetime, timedelta, timezone


def get_auction_state():
    supabase = get_supabase()

    # fetch core state row first (needed to know current_player_id)
    state = supabase.table("auction_state").select("*").eq("id", 1).single().execute().data

    # honour is_paused flag
    if state.get("is_paused") and state.get("phase") == "active":
        state["phase"] = "paused"

    state["current_bid_team_id"] = state.get("current_bid_team")
    player_id = state.get("current_player_id")

    # fetch player
    if player_id:
        p = supabase.table("players").select("*").eq("id", player_id).single().execute().data
        if p:
            p["cls"]        = p.get("class")
            p["sold_price"] = p.get("sold_amount")
        state["current_player"] = p
    else:
        state["current_player"] = None

    # fetch teams
    rows = supabase.table("teams").select("*").order("name").execute().data or []
    for t in rows:
        t["players_bought"] = t.get("roster_count", 0)
        t["max_players"]    = t.get("max_slots", 0)
        t["max_wallet"]     = 300000
    state["teams"] = rows

    # action_log not fetched here - admin fetches separately
    state["action_log"] = []

    return state


def pull_next_player(override_player_id=None):
    supabase = get_supabase()

    if override_player_id:
        player = supabase.table("players").select("*")\
            .eq("id", override_player_id).single().execute().data
    else:
        upcoming = supabase.table("players").select("*")\
            .eq("status", "upcoming").execute().data
        if not upcoming:
            unsold = supabase.table("players").select("*")\
                .eq("status", "unsold").execute().data
            if not unsold:
                return {"ok": False, "error": "No more players available"}
            supabase.table("auction_state").update({"round": 2}).eq("id", 1).execute()
            player = random.choice(unsold)
        else:
            player = random.choice(upcoming)

    supabase.table("players").update({"status": "active"})\
        .eq("id", player["id"]).execute()

    supabase.table("auction_state").update({
        "phase":             "active",
        "is_paused":         False,
        "current_player_id": player["id"],
        "current_bid":       player["base_price"],
        "current_bid_team":  None,
    }).eq("id", 1).execute()

    supabase.table("action_log").insert({
        "action":  "player_activated",
        "payload": {"player_id": player["id"], "player_name": player["name"]},
    }).execute()

    return {"ok": True, "player": player}


def mark_player_unsold():
    supabase = get_supabase()
    state = get_auction_state()
    player_id = state.get("current_player_id")

    if not player_id:
        return {"ok": False, "error": "No active player"}

    supabase.table("players").update({"status": "unsold"})\
        .eq("id", player_id).execute()

    supabase.table("auction_state").update({
        "phase":             "idle",
        "is_paused":         False,
        "current_player_id": None,
        "current_bid":       None,
        "current_bid_team":  None,
    }).eq("id", 1).execute()

    supabase.table("action_log").insert({
        "action":  "player_unsold",
        "payload": {"player_id": player_id},
    }).execute()

    return {"ok": True}


def trigger_deadlock(deadline_seconds=30):
    supabase = get_supabase()
    state = get_auction_state()

    if not state.get("current_player_id"):
        return {"ok": False, "error": "No active player"}

    supabase.table("deadlock_bids").delete()\
        .eq("player_id", state["current_player_id"]).execute()

    deadline = (
        datetime.now(timezone.utc) + timedelta(seconds=deadline_seconds)
    ).isoformat()

    supabase.table("auction_state").update({
        "phase":             "deadlock",
        "deadlock_deadline": deadline,
    }).eq("id", 1).execute()

    supabase.table("action_log").insert({
        "action":  "deadlock_triggered",
        "payload": {"player_id": state["current_player_id"], "deadline": deadline},
    }).execute()

    return {"ok": True, "deadline": deadline}


def resolve_deadlock():
    supabase = get_supabase()
    state = get_auction_state()
    player_id = state.get("current_player_id")

    bids = supabase.table("deadlock_bids")\
        .select("*, teams(*)")\
        .eq("player_id", player_id)\
        .order("amount", desc=True)\
        .order("submitted_at", desc=False)\
        .execute().data

    if not bids:
        return mark_player_unsold()

    winner = bids[0]
    supabase.rpc("mark_player_sold", {
        "p_player_id": player_id,
        "p_team_id":   winner["team_id"],
        "p_amount":    winner["amount"],
    }).execute()

    return {
        "ok":          True,
        "winner_team": winner["teams"]["name"],
        "amount":      winner["amount"],
    }


def pause_auction(paused: bool):
    supabase = get_supabase()

    update = {"is_paused": paused}
    # Also flip the phase so frontend phase checks work
    if paused:
        update["phase"] = "paused"
    else:
        # Resume: only go back to active if a player is currently up
        state = supabase.table("auction_state").select("current_player_id")\
            .eq("id", 1).single().execute().data
        update["phase"] = "active" if state.get("current_player_id") else "idle"

    supabase.table("auction_state").update(update).eq("id", 1).execute()

    supabase.table("action_log").insert({
        "action":  "auction_paused" if paused else "auction_resumed",
        "payload": {},
    }).execute()

    return {"ok": True, "paused": paused}


def undo_last():
    supabase = get_supabase()
    res = supabase.rpc("undo_last_action", {}).execute()
    return res.data

def reset_auction():
    supabase = get_supabase()
    from datetime import datetime, timezone

    # Reset all non-diamond players to upcoming, clear sale info
    supabase.table("players").update({
        "status":       "upcoming",
        "sold_to_team": None,
        "sold_amount":  None,
    }).neq("class", "Diamond").execute()

    # Reset teams: wallet back to 300000, roster_count to 1 (diamond retained)
    supabase.table("teams").update({
        "wallet":       300000,
        "roster_count": 1,
    }).execute()

    # Clear bids + deadlock_bids
    supabase.table("bids").delete().gt("amount", 0).execute()
    supabase.table("deadlock_bids").delete().gt("amount", 0).execute()

    # Reset auction_state
    supabase.table("auction_state").update({
        "phase":             "idle",
        "is_paused":         False,
        "current_player_id": None,
        "current_bid":       None,
        "current_bid_team":  None,
        "round":             1,
        "deadlock_deadline": None,
        "updated_at":        datetime.now(timezone.utc).isoformat(),
    }).eq("id", 1).execute()

    supabase.table("action_log").insert({
        "action":  "auction_reset",
        "payload": {},
    }).execute()

    return {"ok": True, "message": "Auction reset successfully"}


# def send_whatsapp(to_number: str, message: str) -> bool:
#     """Send WhatsApp via Twilio. Needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM."""
#     import os
#     try:
#         from twilio.rest import Client
#         client = Client(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])
#         from_num = os.environ.get("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")
#         to = f"whatsapp:{to_number}" if not to_number.startswith("whatsapp:") else to_number
#         client.messages.create(body=message, from_=from_num, to=to)
#         return True
#     except Exception as e:
#         print(f"[WhatsApp] Failed: {e}")
#         return False


# def send_email_notification(to_email: str, subject: str, body: str) -> bool:
#     """Send email via SMTP. Needs SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS."""
#     import os, smtplib
#     from email.mime.text import MIMEText
#     try:
#         msg = MIMEText(body)
#         msg["Subject"] = subject
#         msg["From"]    = os.environ.get("SMTP_FROM", os.environ["SMTP_USER"])
#         msg["To"]      = to_email
#         with smtplib.SMTP(os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT", 587))) as s:
#             s.starttls()
#             s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASS"])
#             s.send_message(msg)
#         return True
#     except Exception as e:
#         print(f"[Email] Failed: {e}")
#         return False