'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

// ── Helpers ────────────────────────────────────────────────────────────────
const fmtFull = (n) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN')}`)

const normaliseClass = (cls) => {
    if (!cls) return 'other'
    const c = cls.toLowerCase()
    if (c.includes('diamond') || c === 'a') return 'diamond'
    if (c.includes('gold') || c === 'b') return 'gold'
    if (c.includes('silver') || c === 'c') return 'silver'
    return 'other'
}

const normalisePos = (pos) => {
    if (!pos) return null
    const p = pos.toLowerCase()
    if (p.includes('spike') || p.includes('outside') || p.includes('opposite') || p.includes('middle')) return 'Spiker'
    if (p.includes('set')) return 'Setter'
    if (p.includes('liber') || p.includes('lift')) return 'Lifter'
    return pos
}

const CLASS_CFG = {
    diamond: { label: 'Diamond', color: '#67E8F9', border: 'rgba(103,232,249,0.55)', bg: 'rgba(103,232,249,0.1)' },
    gold: { label: 'Gold', color: '#FFD700', border: 'rgba(255,215,0,0.55)', bg: 'rgba(255,215,0,0.1)' },
    silver: { label: 'Silver', color: '#CBD5E1', border: 'rgba(203,213,225,0.55)', bg: 'rgba(203,213,225,0.1)' },
    other: { label: '', color: '#9CA3AF', border: 'rgba(255,255,255,0.1)', bg: 'transparent' },
}
const classCfg = (cls) => CLASS_CFG[normaliseClass(cls)] || CLASS_CFG.other

const TEAM_BRAND = {
    '11111111-0001-0001-0001-000000000001': '#C47F17',
    '11111111-0002-0002-0002-000000000002': '#00a3c8',
    '11111111-0003-0003-0003-000000000003': '#1A8A3A',
    '11111111-0004-0004-0004-000000000004': '#7C3FAB',
    '11111111-0005-0005-0005-000000000005': '#A89B18',
    '11111111-0006-0006-0006-000000000006': '#CC2020',
}
const teamColour = (id) => TEAM_BRAND[id] || '#FFD700'
const hexToRgb = (hex) => {
    const h = hex.replace('#', '').slice(0, 6)
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    return `${r},${g},${b}`
}

// ── Supabase singleton ─────────────────────────────────────────────────────
const supabase = createClient()

// ══════════════════════════════════════════════════════════════════════════
export default function OverlayPage() {
    const [astate, setAstate] = useState(null)
    const [allTeams, setAllTeams] = useState([])
    const [connected, setConnected] = useState(false)

    // banner state — same pattern as scoreboard/team dashboard
    const [soldAnim, setSoldAnim] = useState(null) // { player, team, leaving }
    const [unsoldAnim, setUnsoldAnim] = useState(null) // { player, leaving }
    const soldTimerRef = useRef(null)
    const soldLeaveRef = useRef(null)
    const unsoldTimerRef = useRef(null)
    const unsoldLeaveRef = useRef(null)
    const gavelRef = useRef(null)
    const unsoldRef = useRef(null)

    // bid number animation
    const [bidKey, setBidKey] = useState(0)

    // ── Audio ──────────────────────────────────────────────────────────────
    const playGavel = useCallback(() => {
        try {
            if (!gavelRef.current) { gavelRef.current = new Audio('/sounds/gavel.wav'); gavelRef.current.volume = 0.85 }
            gavelRef.current.currentTime = 0
            gavelRef.current.play().catch(() => { })
        } catch { }
    }, [])

    const playUnsold = useCallback(() => {
        try {
            if (!unsoldRef.current) { unsoldRef.current = new Audio('/sounds/unsold.wav'); unsoldRef.current.volume = 0.75 }
            unsoldRef.current.currentTime = 0
            unsoldRef.current.play().catch(() => { })
        } catch { }
    }, [])

    // ── Banner triggers ────────────────────────────────────────────────────
    const triggerSold = useCallback((playerRow, teamRow) => {
        clearTimeout(soldTimerRef.current); clearTimeout(soldLeaveRef.current)
        setSoldAnim({ player: playerRow, team: teamRow, leaving: false })
        playGavel()
        soldTimerRef.current = setTimeout(() => {
            setSoldAnim(p => p ? { ...p, leaving: true } : null)
            soldLeaveRef.current = setTimeout(() => setSoldAnim(null), 500)
        }, 4500)
    }, [playGavel])

    const triggerUnsold = useCallback((playerRow) => {
        clearTimeout(unsoldTimerRef.current); clearTimeout(unsoldLeaveRef.current)
        setUnsoldAnim({ player: playerRow, leaving: false })
        playUnsold()
        unsoldTimerRef.current = setTimeout(() => {
            setUnsoldAnim(p => p ? { ...p, leaving: true } : null)
            unsoldLeaveRef.current = setTimeout(() => setUnsoldAnim(null), 500)
        }, 3500)
    }, [playUnsold])

    // ── Fast Supabase read ─────────────────────────────────────────────────
    const fastRefresh = useCallback(async () => {
        try {
            const { data: stateRow } = await supabase
                .from('auction_state').select('*').eq('id', 1).single()
            if (!stateRow) return

            let currentPlayer = null
            if (stateRow.current_player_id) {
                const { data: p } = await supabase
                    .from('players').select('*').eq('id', stateRow.current_player_id).single()
                if (p) { p.cls = p.class; currentPlayer = p }
            }

            const { data: teamsRaw } = await supabase.from('teams').select('*').order('name')
            const teams = (teamsRaw || []).map(t => ({
                ...t, players_bought: t.roster_count ?? 0, max_players: t.max_slots ?? 0,
            }))

            let phase = stateRow.phase
            if (stateRow.is_paused && phase === 'active') phase = 'paused'

            setAstate(prev => {
                // animate bid number when it changes
                if (prev?.current_bid !== stateRow.current_bid) setBidKey(k => k + 1)
                return { ...stateRow, phase, current_player: currentPlayer, current_bid_team_id: stateRow.current_bid_team }
            })
            setAllTeams(teams)
        } catch (err) { console.error('[Overlay] fast refresh error:', err) }
    }, [])

    // ── Realtime subscription ──────────────────────────────────────────────
    useEffect(() => {
        fastRefresh()

        const ch = supabase.channel('overlay-rt')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_state' },
                () => fastRefresh())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' },
                () => fastRefresh())
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players' },
                async (payload) => {
                    fastRefresh()
                    const row = payload?.new
                    if (row?.status === 'sold' && row?.sold_to_team) {
                        const { data: teamRow } = await supabase
                            .from('teams').select('*').eq('id', row.sold_to_team).single()
                        const playerRow = { ...row, cls: row.class, sold_price: row.sold_amount }
                        if (teamRow) triggerSold(playerRow, teamRow)
                    } else if (row?.status === 'unsold') {
                        triggerUnsold({ ...row, cls: row.class })
                    }
                })
            .on('system', {}, p => setConnected(p.status === 'SUBSCRIBED'))
            .subscribe(s => setConnected(s === 'SUBSCRIBED'))

        return () => supabase.removeChannel(ch)
    }, [fastRefresh, triggerSold, triggerUnsold])

    // ── Derived ────────────────────────────────────────────────────────────
    const phase = astate?.phase || 'idle'
    const isActive = phase === 'active'
    const isPaused = phase === 'paused'
    const currentPlayer = astate?.current_player
    const leadingTeam = allTeams.find(t => t.id === astate?.current_bid_team_id)
    const cc = currentPlayer ? classCfg(currentPlayer.cls) : null
    const leadColour = leadingTeam ? teamColour(leadingTeam.id) : '#FFD700'
    const leadRgb = leadingTeam ? hexToRgb(leadColour) : '255,215,0'

    // ══════════════════════════════════════════════════════════════════════
    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Libre+Franklin:wght@400;600;700;800;900&family=JetBrains+Mono:wght@400&display=swap');

        *,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0 }

        :root {
          --bg:     #060810;
          --acc:    #FFD700;
          --acc2:   #FF6B35;
          --green:  #4ADE80;
          --red:    #F87171;
          --orange: #FB923C;
          --text:   #EEF2FF;
          --sub:    #9CA3AF;
          --muted:  #4B5563;
          --border: rgba(255,215,0,0.12);
          --border2:rgba(255,255,255,0.07);
          --fd: 'Bebas Neue', sans-serif;
          --fu: 'Libre Franklin', sans-serif;
          --mono: 'JetBrains Mono', monospace;
        }

        /* OBS requires transparent body for chroma-key-free overlays */
        html, body {
          background: transparent !important;
          overflow: hidden;
          width: 1920px;
          height: 180px;
        }

        /* Scanline texture — same as site */
        body::before {
          content: '';
          position: fixed; inset: 0;
          pointer-events: none; z-index: 0;
          background: repeating-linear-gradient(
            0deg,
            transparent, transparent 2px,
            rgba(255,255,255,0.006) 2px, rgba(255,255,255,0.006) 4px
          );
        }

        /* ── Keyframes ── */
        @keyframes spin        { to { transform: rotate(360deg) } }
        @keyframes fadeUp      { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
        @keyframes bidNumIn    { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes pulse       { 0%,100% { opacity:1 } 50% { opacity:0.35 } }
        @keyframes barSlideIn  { from { transform:translateY(100%); opacity:0 } to { transform:translateY(0); opacity:1 } }
        @keyframes barSlideOut { from { transform:translateY(0); opacity:1 } to { transform:translateY(100%); opacity:0 } }
        @keyframes soldStamp   { 0%{opacity:0;transform:scale(2.2) rotate(-14deg)} 55%{opacity:1;transform:scale(0.92) rotate(-6deg)} 80%{transform:scale(1.04) rotate(-6deg)} 100%{opacity:1;transform:scale(1) rotate(-6deg)} }
        @keyframes soldPriceIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes soldPhotoIn { from{opacity:0;transform:scale(1.05)} to{opacity:1;transform:scale(1)} }
        @keyframes soldSweep   { from{transform:scaleX(0)} to{transform:scaleX(1)} }
        @keyframes particle    { 0%{transform:translate(0,0) scale(1);opacity:0.9} 100%{transform:translate(var(--dx),var(--dy)) scale(0);opacity:0} }
        @keyframes bannerScan  { 0%{transform:translateY(-100%)} 100%{transform:translateY(400%)} }
        @keyframes leadPulse   { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.3;transform:scale(1.7)} }

        /* ── MAIN BAR ── */
        .bar {
          position: fixed;
          bottom: 0; left: 0; right: 0;
          height: 90px;
          display: grid;
          grid-template-columns: 90px 1fr auto auto auto;
          align-items: stretch;
          background: linear-gradient(180deg, rgba(8,10,22,0.97) 0%, rgba(4,6,14,0.99) 100%);
          border-top: 2px solid var(--border);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          overflow: hidden;
          animation: barSlideIn 0.5s cubic-bezier(0.16,1,0.3,1);
          z-index: 10;
        }
        .bar.hidden {
          animation: barSlideOut 0.4s ease-in forwards;
        }

        /* subtle gold left-edge glow */
        .bar::before {
          content: '';
          position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
          background: linear-gradient(180deg, transparent, var(--acc), transparent);
          opacity: 0.6;
        }

        /* scanline on bar */
        .bar-scanline {
          position: absolute; inset: 0; pointer-events: none; z-index: 1; overflow: hidden;
        }
        .bar-scanline::after {
          content: '';
          position: absolute; left: 0; right: 0; height: 30%;
          background: linear-gradient(180deg, transparent, rgba(255,255,255,0.018), transparent);
          animation: bannerScan 3s linear 1s infinite;
        }

        /* ── PHOTO CELL ── */
        .bar-photo {
          position: relative;
          overflow: hidden;
          border-right: 1px solid var(--border2);
          flex-shrink: 0;
        }
        .bar-photo img {
          width: 100%; height: 100%;
          object-fit: cover; object-position: center 15%;
          display: block;
          animation: soldPhotoIn 0.4s ease;
        }
        .bar-photo-fallback {
          width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
          background: #0F1320;
        }
        /* class colour strip at bottom of photo */
        .bar-photo-strip {
          position: absolute; bottom: 0; left: 0; right: 0; height: 3px;
        }

        /* ── PLAYER INFO CELL ── */
        .bar-player {
          padding: 0 20px;
          display: flex; flex-direction: column; justify-content: center; gap: 6px;
          min-width: 0; position: relative; z-index: 2;
        }
        .bar-eyebrow {
          display: flex; align-items: center; gap: 8px;
        }
        .bar-live-pill {
          display: flex; align-items: center; gap: 5px;
          padding: 2px 8px;
          border: 1px solid rgba(74,222,128,0.35);
          background: rgba(74,222,128,0.06);
        }
        .bar-live-dot {
          width: 5px; height: 5px; border-radius: 50%;
          background: var(--green);
          animation: pulse 1.8s ease-in-out infinite;
          flex-shrink: 0;
        }
        .bar-live-lbl {
          font-family: var(--fu); font-size: 0.52rem; font-weight: 800;
          letter-spacing: 3px; color: var(--green); text-transform: uppercase;
        }
        .bar-otb-lbl {
          font-family: var(--fu); font-size: 0.52rem; font-weight: 700;
          letter-spacing: 4px; color: var(--muted); text-transform: uppercase;
        }
        .bar-name {
          font-family: var(--fd); font-size: 2.4rem; letter-spacing: 1.5px;
          color: var(--text); line-height: 1;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .bar-badges {
          display: flex; align-items: center; gap: 7px;
        }
        .bar-badge {
          font-family: var(--fu); font-size: 0.52rem; font-weight: 700;
          letter-spacing: 2px; text-transform: uppercase;
          padding: 2px 8px; border: 1px solid;
        }

        /* ── DIVIDER ── */
        .bar-div {
          width: 1px;
          background: var(--border2);
          align-self: stretch;
          flex-shrink: 0;
          position: relative; z-index: 2;
        }

        /* ── BID CELL ── */
        .bar-bid {
          padding: 0 28px;
          display: flex; flex-direction: column; justify-content: center; align-items: flex-start;
          gap: 4px; flex-shrink: 0; position: relative; z-index: 2;
          min-width: 220px;
        }
        .bar-bid-lbl {
          font-family: var(--fu); font-size: 0.52rem; font-weight: 800;
          letter-spacing: 4px; color: var(--muted); text-transform: uppercase;
        }
        .bar-bid-amt {
          font-family: var(--fd); font-size: 2.6rem; letter-spacing: 2px;
          color: var(--acc); line-height: 1;
          animation: bidNumIn 0.25s ease both;
        }

        /* ── LEADING TEAM CELL ── */
        .bar-lead {
          padding: 0 28px;
          display: flex; flex-direction: column; justify-content: center; align-items: flex-start;
          gap: 4px; flex-shrink: 0; position: relative; z-index: 2;
          border-left: 1px solid var(--border2);
          min-width: 200px;
        }
        .bar-lead-header {
          display: flex; align-items: center; gap: 6px;
        }
        .bar-lead-dot {
          width: 6px; height: 6px; border-radius: 50%;
          animation: leadPulse 1.2s ease-in-out infinite;
          flex-shrink: 0;
        }
        .bar-lead-lbl {
          font-family: var(--fu); font-size: 0.52rem; font-weight: 800;
          letter-spacing: 4px; color: var(--muted); text-transform: uppercase;
        }
        .bar-lead-name {
          font-family: var(--fd); font-size: 2rem; letter-spacing: 1px; line-height: 1;
        }

        /* ── IDLE STATE ── */
        .bar-idle {
          grid-column: 2 / -1;
          display: flex; align-items: center; justify-content: center; gap: 18px;
          padding: 0 28px;
          position: relative; z-index: 2;
        }
        .bar-idle-title {
          font-family: var(--fd); font-size: 1.8rem; letter-spacing: 3px; color: var(--muted);
        }
        .bar-idle-sub {
          font-family: var(--fu); font-size: 0.6rem; font-weight: 700;
          letter-spacing: 3px; color: var(--muted); text-transform: uppercase;
        }

        /* ── SOLD BANNER (drops from top) ── */
        @keyframes soldBannerIn  { from{opacity:0;transform:translateY(-110%)} to{opacity:1;transform:translateY(0)} }
        @keyframes soldBannerOut { from{opacity:1;transform:translateY(0)} to{opacity:0;transform:translateY(-110%)} }

        .sold-banner {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          height: 90px;
          display: grid; grid-template-columns: 90px 1fr auto auto;
          align-items: stretch;
          background: linear-gradient(180deg, rgba(10,13,26,0.99) 0%, rgba(6,8,16,0.99) 100%);
          border-bottom: 3px solid;
          animation: soldBannerIn 0.45s cubic-bezier(0.16,1,0.3,1);
          overflow: hidden;
          box-shadow: 0 12px 60px rgba(0,0,0,0.9);
        }
        .sold-banner.leaving { animation: soldBannerOut 0.4s ease-in forwards; }

        .unsold-banner {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          height: 90px;
          display: grid; grid-template-columns: 90px 1fr auto;
          align-items: stretch;
          background: linear-gradient(180deg, rgba(10,13,26,0.99) 0%, rgba(6,8,16,0.99) 100%);
          border-bottom: 3px solid rgba(248,113,113,0.7);
          animation: soldBannerIn 0.45s cubic-bezier(0.16,1,0.3,1);
          overflow: hidden;
          box-shadow: 0 12px 60px rgba(0,0,0,0.9);
        }
        .unsold-banner.leaving { animation: soldBannerOut 0.4s ease-in forwards; }

        /* shared banner parts */
        .banner-scanline { position:absolute;inset:0;pointer-events:none;z-index:10;overflow:hidden }
        .banner-scanline::after { content:'';position:absolute;left:0;right:0;height:25%;background:linear-gradient(180deg,transparent,rgba(255,255,255,0.022),transparent);animation:bannerScan 2.5s linear 0.5s infinite }

        .bn-photo { width:90px;height:100%;overflow:hidden;position:relative;border-right:1px solid rgba(255,255,255,0.06);flex-shrink:0 }
        .bn-photo img { width:100%;height:100%;object-fit:cover;object-position:center 15%;animation:soldPhotoIn 0.5s ease }
        .bn-photo-fallback { width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#0F1320 }
        .bn-stamp { position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;background:rgba(6,8,16,0.52) }
        .bn-stamp-inner { font-family:var(--fd);font-size:1.6rem;letter-spacing:4px;padding:4px 10px;border:3px solid;line-height:1;animation:soldStamp 0.55s 1.5s cubic-bezier(0.16,1,0.3,1) both }
        .bn-particles { position:absolute;inset:0;pointer-events:none;overflow:visible }
        .bn-p { position:absolute;border-radius:50%;animation:particle 0.9s ease-out both }

        .bn-player { padding:0 22px;display:flex;flex-direction:column;justify-content:center;gap:5px;min-width:0;position:relative;z-index:2 }
        .bn-eyebrow { font-family:var(--fu);font-size:0.5rem;font-weight:800;letter-spacing:5px;text-transform:uppercase;margin-bottom:3px;display:flex;align-items:center;gap:8px }
        .bn-eyebrow.sold  { color:#4ADE80 }
        .bn-eyebrow.unsold{ color:#F87171 }
        .bn-eye-line { flex:1;height:1px;transform-origin:left;animation:soldSweep 0.6s 0.2s ease forwards;transform:scaleX(0) }
        .bn-eye-line.sold  { background:rgba(74,222,128,0.25) }
        .bn-eye-line.unsold{ background:rgba(248,113,113,0.25) }
        .bn-name { font-family:var(--fd);font-size:2.4rem;letter-spacing:1px;line-height:1;color:#EEF2FF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis }
        .bn-badges { display:flex;gap:6px;margin-top:4px;flex-wrap:wrap }
        .bn-badge { font-family:var(--fu);font-size:0.5rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:2px 8px;border:1px solid }

        .bn-team { padding:0 24px;border-left:1px solid rgba(255,255,255,0.07);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;flex-shrink:0;min-width:180px;position:relative;z-index:2 }
        .bn-to-lbl { font-family:var(--fu);font-size:0.5rem;font-weight:800;letter-spacing:4px;text-transform:uppercase;color:var(--muted) }
        .bn-team-logo { width:36px;height:36px;border-radius:6px;object-fit:cover;border:1.5px solid;display:block }
        .bn-team-name { font-family:var(--fd);font-size:1.7rem;letter-spacing:1px;line-height:1;text-align:center }

        .bn-price { padding:0 28px;border-left:1px solid rgba(255,255,255,0.07);display:flex;flex-direction:column;align-items:flex-end;justify-content:center;gap:4px;flex-shrink:0;position:relative;z-index:2;min-width:190px }
        .bn-price-lbl { font-family:var(--fu);font-size:0.5rem;font-weight:800;letter-spacing:4px;text-transform:uppercase;color:var(--muted) }
        .bn-price-val { font-family:var(--fd);font-size:2.8rem;letter-spacing:2px;line-height:1;animation:soldPriceIn 0.4s 0.15s ease both }

        .bn-unsold-note { padding:0 32px;border-left:1px solid rgba(248,113,113,0.15);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;flex-shrink:0;position:relative;z-index:2 }
        .bn-unsold-note-lbl { font-family:var(--fu);font-size:0.5rem;font-weight:800;letter-spacing:4px;text-transform:uppercase;color:var(--muted) }
        .bn-unsold-note-val { font-family:var(--fd);font-size:2rem;letter-spacing:1px;color:#F87171;line-height:1;animation:soldPriceIn 0.4s 0.15s ease both }
      `}</style>

            {/* ══ MAIN BAR ══ */}
            <div className={`bar${(!isActive && !isPaused) ? ' hidden' : ''}`}>
                <div className="bar-scanline" />

                {/* ── photo ── */}
                <div className="bar-photo">
                    {currentPlayer ? (
                        <>
                            <img
                                key={currentPlayer.id}
                                src={currentPlayer.photo_url || `/images/players/${currentPlayer.id}.jpg`}
                                alt={currentPlayer.name}
                                onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
                            />
                            <div className="bar-photo-fallback" style={{ display: 'none' }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                                </svg>
                            </div>
                            {cc && <div className="bar-photo-strip" style={{ background: cc.color, opacity: 0.8 }} />}
                        </>
                    ) : (
                        <div className="bar-photo-fallback">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,215,0,0.08)" strokeWidth="1">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                            </svg>
                        </div>
                    )}
                </div>

                {/* ── player info OR idle ── */}
                {currentPlayer ? (
                    <div className="bar-player" key={currentPlayer.id} style={{ animation: 'fadeUp 0.35s ease' }}>
                        <div className="bar-eyebrow">
                            <div className="bar-live-pill">
                                <div className="bar-live-dot" />
                                <span className="bar-live-lbl">Live</span>
                            </div>
                            <span className="bar-otb-lbl">On the Block</span>
                        </div>
                        <div className="bar-name">{currentPlayer.name}</div>
                        <div className="bar-badges">
                            {currentPlayer.position && (
                                <span className="bar-badge" style={{ borderColor: 'rgba(255,255,255,0.15)', color: 'var(--sub)' }}>
                                    {normalisePos(currentPlayer.position) || currentPlayer.position}
                                </span>
                            )}
                            {cc && cc.label && (
                                <span className="bar-badge" style={{ background: cc.bg, borderColor: cc.border, color: cc.color }}>
                                    {cc.label}
                                </span>
                            )}
                            {currentPlayer.base_price && (
                                <span className="bar-badge" style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'var(--muted)' }}>
                                    Base {fmtFull(currentPlayer.base_price)}
                                </span>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="bar-idle">
                        <div className="bar-idle-title">{isPaused ? 'AUCTION PAUSED' : 'TKM VOLLEYBALL AUCTION'}</div>
                        <div className="bar-idle-sub">{isPaused ? 'Standing by…' : 'Next player coming up'}</div>
                    </div>
                )}

                {currentPlayer && (
                    <>
                        <div className="bar-div" />

                        {/* ── current bid ── */}
                        <div className="bar-bid">
                            <div className="bar-bid-lbl">Current Bid</div>
                            <div className="bar-bid-amt" key={bidKey}>
                                {astate?.current_bid
                                    ? fmtFull(astate.current_bid)
                                    : fmtFull(currentPlayer.base_price)}
                            </div>
                        </div>

                        {/* ── leading team ── */}
                        <div className="bar-lead" style={{
                            background: leadingTeam
                                ? `linear-gradient(90deg, transparent 0%, rgba(${leadRgb},0.07) 100%)`
                                : 'transparent',
                        }}>
                            <div className="bar-lead-header">
                                {leadingTeam && (
                                    <div className="bar-lead-dot" style={{ background: leadColour }} />
                                )}
                                <span className="bar-lead-lbl">Leading</span>
                            </div>
                            {leadingTeam ? (
                                <div className="bar-lead-name" style={{ color: leadColour }}>
                                    {leadingTeam.name}
                                </div>
                            ) : (
                                <div style={{ fontFamily: 'var(--fu)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '2px', color: 'var(--muted)' }}>
                                    No bids yet
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* ══ SOLD BANNER ══ */}
            {soldAnim && (() => {
                const colour = teamColour(soldAnim.team.id)
                const rgb = hexToRgb(colour)
                const price = soldAnim.player.sold_price || soldAnim.player.sold_amount
                const cc2 = classCfg(soldAnim.player.cls)
                const particles = Array.from({ length: 16 }, (_, i) => {
                    const angle = (i / 16) * 2 * Math.PI
                    const dist = 45 + Math.random() * 50
                    return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, delay: i * 0.04, size: 3 + Math.random() * 5 }
                })
                return (
                    <div className={`sold-banner${soldAnim.leaving ? ' leaving' : ''}`}
                        style={{ borderBottomColor: colour, boxShadow: `0 12px 60px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(${rgb},0.12)` }}>

                        <div className="banner-scanline" />

                        {/* photo + stamp */}
                        <div className="bn-photo" style={{ borderRightColor: `rgba(${rgb},0.15)` }}>
                            <img src={soldAnim.player.photo_url || `/images/players/${soldAnim.player.id}.jpg`}
                                alt={soldAnim.player.name}
                                onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
                            <div className="bn-photo-fallback" style={{ display: 'none' }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={`rgba(${rgb},0.3)`} strokeWidth="1">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                                </svg>
                            </div>
                            <div className="bn-stamp">
                                <div className="bn-stamp-inner" style={{ borderColor: colour, color: colour }}>SOLD</div>
                            </div>
                            <div className="bn-particles">
                                {particles.map((p, i) => (
                                    <div key={i} className="bn-p" style={{
                                        background: colour, width: p.size, height: p.size,
                                        top: '50%', left: '50%',
                                        '--dx': `${p.dx}px`, '--dy': `${p.dy}px`,
                                        animationDelay: `${1.5 + p.delay}s`, opacity: 0.85,
                                    }} />
                                ))}
                            </div>
                        </div>

                        {/* player info */}
                        <div className="bn-player">
                            <div className="bn-eyebrow sold">SOLD <div className="bn-eye-line sold" /></div>
                            <div className="bn-name">{soldAnim.player.name}</div>
                            <div className="bn-badges">
                                {soldAnim.player.position && (
                                    <span className="bn-badge" style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'var(--sub)' }}>
                                        {normalisePos(soldAnim.player.position) || soldAnim.player.position}
                                    </span>
                                )}
                                {cc2.label && (
                                    <span className="bn-badge" style={{ background: cc2.bg, borderColor: cc2.border, color: cc2.color }}>
                                        {cc2.label}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* goes to */}
                        <div className="bn-team" style={{ borderLeftColor: `rgba(${rgb},0.15)` }}>
                            <div className="bn-to-lbl">Goes to</div>
                            <img className="bn-team-logo"
                                src={`/images/teams/${soldAnim.team.id}.png`} alt=""
                                style={{ borderColor: `rgba(${rgb},0.5)`, boxShadow: `0 0 10px rgba(${rgb},0.25)` }}
                                onError={e => e.target.style.display = 'none'} />
                            <div className="bn-team-name" style={{ color: colour }}>{soldAnim.team.name}</div>
                        </div>

                        {/* final price */}
                        <div className="bn-price" style={{ borderLeftColor: `rgba(${rgb},0.15)` }}>
                            <div className="bn-price-lbl">Final Price</div>
                            <div className="bn-price-val" style={{ color: colour }}>{fmtFull(price)}</div>
                        </div>
                    </div>
                )
            })()}

            {/* ══ UNSOLD BANNER ══ */}
            {unsoldAnim && (() => {
                const cc2 = classCfg(unsoldAnim.player.cls)
                return (
                    <div className={`unsold-banner${unsoldAnim.leaving ? ' leaving' : ''}`}>
                        <div className="banner-scanline" />

                        <div className="bn-photo" style={{ borderRightColor: 'rgba(248,113,113,0.15)' }}>
                            <img src={unsoldAnim.player.photo_url || `/images/players/${unsoldAnim.player.id}.jpg`}
                                alt={unsoldAnim.player.name}
                                onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
                            <div className="bn-photo-fallback" style={{ display: 'none' }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(248,113,113,0.25)" strokeWidth="1">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                                </svg>
                            </div>
                            <div className="bn-stamp">
                                <div className="bn-stamp-inner" style={{ borderColor: '#F87171', color: '#F87171' }}>UNSOLD</div>
                            </div>
                        </div>

                        <div className="bn-player">
                            <div className="bn-eyebrow unsold">UNSOLD <div className="bn-eye-line unsold" /></div>
                            <div className="bn-name">{unsoldAnim.player.name}</div>
                            <div className="bn-badges">
                                {unsoldAnim.player.position && (
                                    <span className="bn-badge" style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'var(--sub)' }}>
                                        {normalisePos(unsoldAnim.player.position) || unsoldAnim.player.position}
                                    </span>
                                )}
                                {cc2.label && (
                                    <span className="bn-badge" style={{ background: cc2.bg, borderColor: cc2.border, color: cc2.color }}>
                                        {cc2.label}
                                    </span>
                                )}
                                {unsoldAnim.player.base_price && (
                                    <span className="bn-badge" style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'var(--muted)' }}>
                                        Base {fmtFull(unsoldAnim.player.base_price)}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="bn-unsold-note">
                            <div className="bn-unsold-note-lbl">Returns to pool</div>
                            <div className="bn-unsold-note-val">No bids</div>
                        </div>
                    </div>
                )
            })()}
        </>
    )
}