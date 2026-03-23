from services.supabase_client import get_supabase
import random
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor


def get_auction_state():
    supabase = get_supabase()

    # fetch core state row first (needed to know current_player_id)
    state = supabase.table("auction_state").select("*").eq("id", 1).single().execute().data

    # honour is_paused flag
    if state.get("is_paused") and state.get("phase") == "active":
        state["phase"] = "paused"

    state["current_bid_team_id"] = state.get("current_bid_team")
    player_id = state.get("current_player_id")

    # fetch player, teams, logs in parallel
    def fetch_player():
        if not player_id:
            return None
        p = supabase.table("players").select("*").eq("id", player_id).single().execute().data
        if p:
            p["cls"]        = p.get("class")
            p["sold_price"] = p.get("sold_amount")
        return p

    def fetch_teams():
        rows = supabase.table("teams").select("*").order("name").execute().data or []
        for t in rows:
            t["players_bought"] = t.get("roster_count", 0)
            t["max_players"]    = t.get("max_slots", 0)
            t["max_wallet"]     = 200000  # fixed starting budget
        return rows

    def fetch_logs():
        return supabase.table("action_log").select("*").order("created_at", desc=True).limit(50).execute().data or []

    with ThreadPoolExecutor(max_workers=3) as ex:
        f_player = ex.submit(fetch_player)
        f_teams  = ex.submit(fetch_teams)
        f_logs   = ex.submit(fetch_logs)
        state["current_player"] = f_player.result()
        state["teams"]          = f_teams.result()
        state["action_log"]     = f_logs.result()

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


def pause_auction():
    supabase = get_supabase()

    # Read current state and toggle
    state = supabase.table("auction_state").select("is_paused, current_player_id")\
        .eq("id", 1).single().execute().data
    paused = not state.get("is_paused", False)

    update = {"is_paused": paused}
    if paused:
        update["phase"] = "paused"
    else:
        update["phase"] = "active" if state.get("current_player_id") else "idle"

    supabase.table("auction_state").update(update).eq("id", 1).execute()

    supabase.table("action_log").insert({
        "action":  "auction_paused" if paused else "auction_resumed",
        "payload": {},
    }).execute()

    return {"ok": True, "paused": paused, "message": "Paused" if paused else "Resumed"}


def undo_last():
    """Undo the last auction action by reading the most recent action_log entry
    and reversing it in Python."""
    supabase = get_supabase()

    # Get the most recent action log entry
    logs = supabase.table("action_log").select("*")\
        .order("created_at", desc=True).limit(1).execute().data
    if not logs:
        return {"ok": False, "error": "Nothing to undo"}

    last = logs[0]
    action = last.get("action", "")
    payload = last.get("payload") or {}

    try:
        if action == "player_sold":
            # Reverse a sale: restore player to active, refund team wallet, decrement roster
            pid = payload.get("player_id")
            tid = payload.get("team_id")
            amt = payload.get("amount", 0)
            if pid:
                supabase.table("players").update({
                    "status": "active", "sold_to_team": None, "sold_amount": None,
                }).eq("id", pid).execute()
            if tid:
                # Refund wallet and decrement roster_count
                team = supabase.table("teams").select("wallet, roster_count")\
                    .eq("id", tid).single().execute().data
                if team:
                    supabase.table("teams").update({
                        "wallet": (team.get("wallet", 0) + amt),
                        "roster_count": max(0, team.get("roster_count", 1) - 1),
                    }).eq("id", tid).execute()
            # Restore auction_state to active with this player
            if pid:
                supabase.table("auction_state").update({
                    "phase": "active",
                    "current_player_id": pid,
                    "current_bid": amt,
                    "current_bid_team": tid,
                    "is_paused": False,
                }).eq("id", 1).execute()

        elif action == "player_unsold":
            # Reverse unsold: put player back to active
            pid = payload.get("player_id")
            if pid:
                player = supabase.table("players").select("base_price")\
                    .eq("id", pid).single().execute().data
                supabase.table("players").update({"status": "active"}).eq("id", pid).execute()
                supabase.table("auction_state").update({
                    "phase": "active",
                    "current_player_id": pid,
                    "current_bid": player.get("base_price", 0) if player else 0,
                    "current_bid_team": None,
                    "is_paused": False,
                }).eq("id", 1).execute()

        elif action == "player_activated":
            # Reverse pulling a player: set them back to upcoming, clear auction state
            pid = payload.get("player_id")
            if pid:
                supabase.table("players").update({"status": "upcoming"}).eq("id", pid).execute()
                supabase.table("auction_state").update({
                    "phase": "idle",
                    "current_player_id": None,
                    "current_bid": None,
                    "current_bid_team": None,
                    "is_paused": False,
                }).eq("id", 1).execute()

        elif action == "bid_placed":
            # Reverse a bid: restore previous bid state from the bids table
            pid = payload.get("player_id") if payload.get("player_id") else None
            # Delete the latest bid entry
            try:
                bids = supabase.table("bids").select("*")\
                    .order("created_at", desc=True).limit(2).execute().data or []
                if bids:
                    supabase.table("bids").delete().eq("id", bids[0]["id"]).execute()
                # Restore previous bid if exists
                if len(bids) > 1:
                    prev = bids[1]
                    supabase.table("auction_state").update({
                        "current_bid": prev["amount"],
                        "current_bid_team": prev["team_id"],
                    }).eq("id", 1).execute()
                else:
                    # No previous bid — revert to base price
                    state = supabase.table("auction_state").select("current_player_id")\
                        .eq("id", 1).single().execute().data
                    if state and state.get("current_player_id"):
                        player = supabase.table("players").select("base_price")\
                            .eq("id", state["current_player_id"]).single().execute().data
                        supabase.table("auction_state").update({
                            "current_bid": player.get("base_price", 0) if player else 0,
                            "current_bid_team": None,
                        }).eq("id", 1).execute()
            except Exception:
                pass  # bids table might not exist

        else:
            # Unknown action type — just delete the log entry
            pass

        # Delete the action log entry we just undid
        supabase.table("action_log").delete().eq("id", last["id"]).execute()

        return {"ok": True, "message": f"Undid: {action}"}

    except Exception as e:
        return {"ok": False, "error": f"Undo failed: {str(e)}"}

def reset_auction():
    supabase = get_supabase()
    from datetime import datetime, timezone

    # Reset all non-diamond players to upcoming, clear sale info
    supabase.table("players").update({
        "status":       "upcoming",
        "sold_to_team": None,
        "sold_amount":  None,
    }).neq("class", "Diamond").execute()

    # Reset teams: wallet back to 200000, roster_count to 1 (diamond retained)
    supabase.table("teams").update({
        "wallet":       200000,
        "roster_count": 1,
    }).neq("id", "00000000-0000-0000-0000-000000000000").execute()

    # Clear bids + deadlock_bids (tables may not exist — ignore errors)
    try:
        supabase.table("bids").delete().gt("amount", 0).execute()
    except Exception:
        pass
    try:
        supabase.table("deadlock_bids").delete().gt("amount", 0).execute()
    except Exception:
        pass

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


# ── Email notification (uncomment once player email IDs are added) ──────────
#
# Required .env variables:
#   SMTP_HOST=smtp.gmail.com
#   SMTP_PORT=587
#   SMTP_USER=your_email@gmail.com
#   SMTP_PASS=your_app_password
#   SMTP_FROM=your_email@gmail.com  (optional, defaults to SMTP_USER)
#
# def send_email_notification(to_email: str, subject: str, body: str) -> bool:
#     """Send email via SMTP."""
#     import os, smtplib
#     from email.mime.text import MIMEText
#     from email.mime.multipart import MIMEMultipart
#     try:
#         msg = MIMEMultipart("alternative")
#         msg["Subject"] = subject
#         msg["From"]    = os.environ.get("SMTP_FROM", os.environ["SMTP_USER"])
#         msg["To"]      = to_email
#
#         # Plain text version
#         msg.attach(MIMEText(body, "plain"))
#
#         # HTML version (prettier email)
#         html = f"""
#         <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;
#                     background:#0B0E18;color:#EEF2FF;padding:32px;border-radius:12px;
#                     border:1px solid rgba(255,215,0,0.15);">
#             <h1 style="color:#FFD700;font-size:24px;margin-bottom:8px;">
#                 🏐 Congratulations!
#             </h1>
#             <p style="font-size:16px;line-height:1.6;color:#9CA3AF;">
#                 You have been selected in the <strong style="color:#EEF2FF">TKM Volleyball Auction 2026</strong> 🎉
#             </p>
#             <div style="background:#0F1320;padding:16px;border-radius:8px;margin:16px 0;
#                         border:1px solid rgba(255,255,255,0.07);">
#                 <p style="margin:0 0 8px;font-size:14px;color:#9CA3AF;">Team</p>
#                 <p style="margin:0 0 16px;font-size:20px;font-weight:bold;color:#FFD700;">{body.split('Team: ')[1].split(chr(10))[0] if 'Team: ' in body else ''}</p>
#                 <p style="margin:0 0 8px;font-size:14px;color:#9CA3AF;">Sold Price</p>
#                 <p style="margin:0;font-size:20px;font-weight:bold;color:#4ADE80;">{body.split('Price: ')[1].split(chr(10))[0] if 'Price: ' in body else ''}</p>
#             </div>
#             <p style="font-size:15px;color:#9CA3AF;">All the best for the tournament! 💪</p>
#         </div>
#         """
#         msg.attach(MIMEText(html, "html"))
#
#         with smtplib.SMTP(os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT", 587))) as s:
#             s.starttls()
#             s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASS"])
#             s.send_message(msg)
#         print(f"[Email] Sent to {to_email}")
#         return True
#     except Exception as e:
#         print(f"[Email] Failed to send to {to_email}: {e}")
#         return False
#
#
# def notify_player_sold(player_id: str, team_name: str, amount: int):
#     """Send email to a player when they are sold."""
#     supabase = get_supabase()
#     player = supabase.table("players").select("name, email")\
#         .eq("id", player_id).single().execute().data
#     if not player or not player.get("email"):
#         print(f"[Notify] No email for player {player_id}, skipping notification")
#         return
#
#     message = (
#         f"Congratulations {player['name']}!\n\n"
#         f"You have been selected in the TKM Volleyball Auction 2026.\n\n"
#         f"Team: {team_name}\n"
#         f"Price: ₹{amount:,}\n\n"
#         f"All the best for the tournament!"
#     )
#
#     send_email_notification(
#         player["email"],
#         "🏐 You've been selected — TKM Volleyball Auction 2026!",
#         message,
#     )


# Placeholder so the import in auction.py router doesn't break
def notify_player_sold(player_id: str, team_name: str, amount: int):
    """Notification disabled — uncomment the email block above once player emails are available."""
    pass