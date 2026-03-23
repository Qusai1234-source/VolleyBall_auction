# Spike Draft — Volleyball Auction Platform
## Complete Project Context (Updated)

---

## Project Overview
Live in-person volleyball auction platform — TKM VB 2026.
6 teams, 48 players (6 Diamond retained, 42 auctioned).
Admin enters bids manually on a laptop. Scoreboard displayed on projector.

**Project path:** `C:\projects\VolleyBall_Auction\`
**Supabase URL:** `https://wodobdfhxyzlyfljngik.supabase.co`
**Dev:** frontend `localhost:3000`, backend `localhost:8000`

---

## Tech Stack
- **Frontend:** Next.js 14, App Router, JSX only (no TypeScript)
- **Backend:** FastAPI, Python, Anaconda `volley` env
- **Database:** Supabase (PostgreSQL + Realtime)
- **Notifications:** authkey.io WhatsApp API (pay-as-you-go)

---

## File Locations (canonical working versions)

### Frontend deploy targets
| File | Route |
|------|-------|
| `app/page.jsx` | Scoreboard (projector display) |
| `app/admin/page.jsx` | Admin auction control panel |
| `app/team/[id]/page.jsx` | Team dashboard (per-team view) |

### Backend deploy targets
| File | Purpose |
|------|---------|
| `services/auction_service.py` | All auction business logic |
| `routers/auction.py` | Auction API endpoints |
| `routers/teams.py` | Teams API endpoints |

---

## Team Brand Colours (hardcoded by UUID)
```js
const TEAM_BRAND = {
  '11111111-0001-0001-0001-000000000001': '#C47F17', // Block Hawks
  '11111111-0002-0002-0002-000000000002': '#D4A017', // Agile Dolphins
  '11111111-0003-0003-0003-000000000003': '#1A8A3A', // Spikey Piranhas
  '11111111-0004-0004-0004-000000000004': '#7C3FAB', // Ferocious Panthers
  '11111111-0005-0005-0005-000000000005': '#A89B18', // Ace Lions
  '11111111-0006-0006-0006-000000000006': '#CC2020', // PowerHouse Bulls
}
```

---

## Business Logic Constants
```js
GOLD_BASE       = 20000   // Gold player base price
SILVER_BASE     = 10000   // Silver player base price
STARTING_WALLET = 200000  // Per team starting budget (₹3,00,000)
// Required: 2 Gold + 5 Silver per team (7 auction slots, 1 Diamond retained)
// Total squad size: 8 (1 diamond + 7 auctioned)
```

## Max Bid Formula
```js
const calcMaxBid = (team, currentCls = null, squad = []) => {
    const goldHave   = squad.filter(p => normaliseClass(p.cls) === 'gold').length
    const silverHave = squad.filter(p => normaliseClass(p.cls) === 'silver').length
    let goldNeed   = Math.max(0, 2 - goldHave)
    let silverNeed = Math.max(0, 5 - silverHave)
    if (currentCls === 'gold')   goldNeed   = Math.max(0, goldNeed - 1)
    if (currentCls === 'silver') silverNeed = Math.max(0, silverNeed - 1)
    const reserve = goldNeed * GOLD_BASE + silverNeed * SILVER_BASE
    return Math.max(0, (team.wallet ?? 0) - reserve)
}
```

## Smart Bid Increments (Admin)
```js
const getIncrements = () => {
    const cur = parseInt(bidAmount) || astate?.current_bid || 0
    if (currentClass === 'gold')   return cur < 50000 ? [2000, 5000]  : [5000, 10000]
    if (currentClass === 'silver') return cur < 30000 ? [1000, 2000]  : [2000, 5000]
    return [1000, 2000, 5000]
}
```

---

## Database Schema

### Key Facts
- `player_status` enum: `upcoming / active / sold / unsold` (NOT 'available')
- `auction_state` always has exactly one row with `id = 1`
- `action_log` columns: `"action"` and `"payload"` (NOT action_type/description)
- `teams` table real columns: `roster_count`, `max_slots`, `wallet`
  - Aliased in responses to: `players_bought`, `max_players`, `max_wallet`
- `players` table real columns: `class`, `sold_amount`
  - Aliased in responses to: `cls`, `sold_price`
- `current_bid_team` in DB aliased to `current_bid_team_id` in responses
- `watchlist` uses `insert()` NOT `upsert()`

### players table (relevant columns)
```
id, name, class, position, status, base_price,
sold_to_team, sold_amount, photo_url,
phone_number, email  ← added for WhatsApp notifications
```

### teams table (relevant columns)
```
id, name, wallet, roster_count, max_slots, initial_wallet, owner_name
```

---

## SQL Applied to Supabase (run once)

### Auto-bump updated_at trigger (Realtime fires)
```sql
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS auction_state_updated_at ON auction_state;
CREATE TRIGGER auction_state_updated_at BEFORE UPDATE ON auction_state
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
```

### RLS policies for Realtime
```sql
ALTER TABLE auction_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read auction_state" ON auction_state;
DROP POLICY IF EXISTS "public read players" ON players;
DROP POLICY IF EXISTS "public read teams" ON teams;
CREATE POLICY "public read auction_state" ON auction_state FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read players" ON players FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read teams" ON teams FOR SELECT TO anon, authenticated USING (true);
```

### Wallet bar fix
```sql
ALTER TABLE teams ADD COLUMN IF NOT EXISTS initial_wallet integer;
UPDATE teams SET initial_wallet = wallet WHERE initial_wallet IS NULL;
```

### Notification columns
```sql
ALTER TABLE players ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS email TEXT;
```

### mark_player_sold RPC fix (8th player bug)
The original RPC used `>=` which blocked the 8th player (diamond counts in roster_count).
Fixed to `>`:
```sql
CREATE OR REPLACE FUNCTION mark_player_sold(
  p_player_id uuid, p_team_id uuid, p_amount integer
)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_team teams%ROWTYPE;
BEGIN
  SELECT * INTO v_team FROM teams WHERE id = p_team_id FOR UPDATE;
  IF v_team.wallet < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient wallet');
  END IF;
  IF v_team.roster_count > v_team.max_slots THEN   -- was >= (bug), now >
    RETURN jsonb_build_object('ok', false, 'error', 'Team roster is full');
  END IF;
  UPDATE players SET status='sold', sold_to_team=p_team_id, sold_amount=p_amount WHERE id=p_player_id;
  UPDATE teams SET wallet=wallet-p_amount, roster_count=roster_count+1 WHERE id=p_team_id;
  UPDATE auction_state SET phase='idle', current_player_id=NULL, current_bid=0,
    current_bid_team=NULL, updated_at=now() WHERE id=1;
  INSERT INTO action_log (action, payload) VALUES (
    'player_sold',
    jsonb_build_object('player_id',p_player_id,'team_id',p_team_id,'amount',p_amount,
      'team_wallet_before',v_team.wallet,'team_roster_before',v_team.roster_count)
  );
  RETURN jsonb_build_object('ok', true);
END; $$;
```

### Supabase Dashboard (manual steps required)
- Realtime → Tables → toggle ON: `auction_state`, `players`, `teams`

---

## Environment Variables Required

### Backend `.env`
```
SUPABASE_URL=https://wodobdfhxyzlyfljngik.supabase.co
SUPABASE_SERVICE_KEY=...
AUTHKEY_API_KEY=your_authkey_here
AUTHKEY_WID=your_template_id_here   # WhatsApp template ID from authkey.io portal
AUTHKEY_COUNTRY_CODE=91
# Optional email fallback
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=...
```

---

## API Endpoints

### Auction Router (`/auction/...`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/auction/state` | Full auction state (player, teams, logs) |
| POST | `/auction/pull-player` | Pull next upcoming player onto block |
| POST | `/auction/assign-opening-bid` | Set opening bid + leading team |
| POST | `/auction/sold` | Mark player sold → triggers WhatsApp notification |
| POST | `/auction/unsold` | Mark current player unsold |
| POST | `/auction/pause` | Toggle pause/resume |
| POST | `/auction/undo` | Undo last action (DB rollback via RPC) |
| POST | `/auction/reset` | **NEW** Reset entire auction to initial state |

### Teams Router (`/teams/...`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/teams/` | All teams |
| GET | `/teams/{id}/roster` | Players bought by a team |

### Players Router (`/players/...`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/players/` | All players with status |

---

## Scoreboard Layout (Option D — current)

**Page grid:** `50px header | 1fr player zone | 180px team strip | 58px footer`

### Player Zone (top, fills remaining height)
- `38% photo column | 62% details column`
- Photo: rounded rectangle container (`border-radius: 14px`), `3px` border in player class colour with glow
  - Gold → `#FFD700`, Silver → `#CBD5E1`, Diamond → `#67E8F9`
- Details: class badge + position badge → player name (Bebas Neue, ~4rem) → chips → base price → bid block
- Bid block: current bid (left) + leading team name in team colour (right), background tints to leading team colour

### Team Strip (bottom, 180px fixed)
- 6 `TeamCard` components in a flex row, each `flex: 1`
- **Style 4:** thick left stripe in team colour, logo circle, name, leading badge with pulse dot, wallet/max bid stats, wallet bar, players count, roster button
- Leading team: coloured border glow, `▲ Leading` badge with animated pulse dot

### Footer (58px)
- 4 equal stats: Available | Sold | Unsold | Total Players

---

## Admin Page Features

### Topbar (left → right)
- Logo + phase pill (Live/Paused/Idle with pulse animation)
- Pause/Resume · Undo · **Reset Auction** (red, opens confirmation modal) · Sign Out

### Reset Auction Modal
- Red confirmation modal
- Warning text: "This cannot be undone"
- Lists what gets reset: players → upcoming, wallets → ₹3,00,000, bids cleared, state → idle
- Two buttons: Cancel | Yes, Reset Everything

### Bid Panel
- Current bid display
- **Quick Increment buttons** — dynamic based on class + current bid:
  - Silver < ₹30K: `[+1K, +2K]` / Silver ≥ ₹30K: `[+2K, +5K]`
  - Gold < ₹50K: `[+2K, +5K]` / Gold ≥ ₹50K: `[+5K, +10K]`
  - Other: `[+1K, +2K, +5K]`
- Bid amount input (seeds with current_bid or base_price on player change)
- Team buttons (6 grid) — disabled if class quota full
- Bid warnings: exceeds wallet / below current bid / exceeds max safe bid
- Update Bid · Mark Sold · Mark Unsold · Pull Next Player action buttons

### Class Quota Enforcement
- Gold: max 2 per team → button disabled + "gold quota full" label
- Silver: max 5 per team → button disabled + "silver quota full" label

---

## Team Dashboard Features (`/team/[id]`)
- Live "On the Block" panel: player photo, name, current bid, leading team
- Squad tab: player cards with class-coloured glow on hover, filter by position + class
- Bid Strategy cards: gold/silver needed, max bid calculation
- Wallet bar: turns orange <50%, red <25%
- Slots Left card: turns orange when ≤2
- Leaderboard tab: all 6 teams sorted by wallet

---

## WhatsApp Notification System (authkey.io)

### Flow
1. Player sold via `POST /auction/sold`
2. Backend calls `notify_player_sold(player_id, team_name, amount)`
3. Fetches `phone_number` + `email` from players table
4. Sends WhatsApp via authkey.io API
5. Falls back to SMTP email if WhatsApp fails
6. Wrapped in try/except — never blocks the sale response

### Template (to create in authkey.io portal)
```
Template name: player_sold_notification
Category: MARKETING or UTILITY
Language: English

Body:
Congratulations {#1#}! 🎉

You have been selected in the TKM Volleyball Auction 2026.

Team: {#2#}
Price: ₹{#3#}

All the best for the tournament! 🏐
```
Variables: `{#1#}` = player name, `{#2#}` = team name, `{#3#}` = amount

### authkey.io API call (POST)
```
URL: https://console.authkey.io/restapi/requestjson.php
Headers: Authorization: Basic <AUTHKEY_API_KEY>, Content-Type: application/json
Body: { "country_code": "91", "mobile": "<phone>", "wid": "<AUTHKEY_WID>",
        "type": "text", "bodyValues": {"1": name, "2": team, "3": amount} }
```

---

## Realtime Architecture

### Stale closure fix (all 3 pages)
```js
const fetchAllRef = useRef(fetchAll)
useEffect(() => { fetchAllRef.current = fetchAll }, [fetchAll])
const debounceRef = useRef(null)
const debouncedFetchRef = useRef(null)
debouncedFetchRef.current = () => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchAllRef.current(), 120)
}
// In channel: () => debouncedFetchRef.current()
```
- 120ms debounce collapses thundering herd from multiple simultaneous DB events
- `supabase` client wrapped in `useMemo` to avoid recreating on every render

---

## Design System

### Colours
```
--bg: #060810          Page background
--bg-card: #0B0E18     Card background
--bg-panel: #0F1320    Panel/input background
--acc: #FFD700         Gold accent
--acc2: #FF6B35        Orange accent
--green: #4ADE80       Success/live
--red: #F87171         Error/danger
--orange: #FB923C      Warning
--text: #EEF2FF        Primary text
--sub: #9CA3AF         Secondary text (use this for audience-readable labels)
--muted: #6B7280       Tertiary/disabled text
--border: rgba(255,215,0,0.09)
--border2: rgba(255,255,255,0.07)
```

### Fonts
```
--fd: 'Bebas Neue'      Display/numbers
--fu: 'Libre Franklin'  UI labels (replaced Barlow Condensed)
Google Fonts import includes weights 400, 600, 700, 800, 900
```

### Player Class Colours
```
Diamond: #67E8F9 (cyan)
Gold:    #FFD700
Silver:  #CBD5E1
```

### Position Colours
```
Spiker/Outside/Middle: #FB923C (orange)
Setter:                #FCD34D (yellow)
Libero/Lifter:         #22D3EE (cyan)
Other:                 #C084FC (purple)
```

### Minimum font sizes for projector readability
- All audience-facing labels: minimum `0.72rem` with `font-weight: 700`
- Secondary labels: use `var(--sub)` (#9CA3AF) NOT `var(--muted)` (#6B7280)
- Display numbers: Bebas Neue, minimum `1.1rem`

---

## Known Issues Fixed

| Issue | Fix |
|-------|-----|
| Wallet bar stuck at 100% | `STARTING_WALLET` was 200000, DB has 200000 — corrected to 200000 |
| 8th player blocked ("roster is full") | `mark_player_sold` RPC used `>=` instead of `>` — fixed in Supabase SQL editor |
| Realtime stale closure | `fetchAllRef` + `debouncedFetchRef` pattern on all 3 pages |
| `max_wallet` always 100% | Hardcoded to 200000 in `auction_service.py` and `teams.py` |
| `action_log` wrong columns | Fixed from `action_type`/`description` to `action`/`payload` |
| Thundering herd on Realtime | 120ms debounce collapses multiple simultaneous events |
| Badge text not centred | Added `display: inline-flex; alignItems: center; justifyContent: center` |
| Photo cropping heads | `object-position: center 15%` on all player images |
| Build error: duplicate `currentBid` | `const currentBid` declared twice in `bidWarning` IIFE — remove the second declaration (line ~263 of admin page) |

---

## Pending / Notes
- authkey.io WhatsApp template needs approval before notifications work
- After template approved: set `AUTHKEY_WID=<template_id>` in backend `.env`
- Install authkey HTTP client or use `requests` library (no SDK needed — pure HTTP POST)
- `twilio` dependency in `auction_service.py` should be removed — replaced by authkey.io
- Round 2 (unsold players): `pull_next_player` auto-falls back to `unsold` pool when `upcoming` is empty, sets `round=2` — no separate button needed
- Player pool order is random (`random.choice`) — intentional
- Mobile scoreboard view (`/scoreboard/mobile`) — not yet built
