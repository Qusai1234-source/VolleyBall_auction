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
    diamond: { label: 'Diamond', color: '#67E8F9', border: 'rgba(103,232,249,0.6)', bg: 'rgba(103,232,249,0.08)', glow: 'rgba(103,232,249,0.22)' },
    gold: { label: 'Gold', color: '#FFD700', border: 'rgba(255,215,0,0.6)', bg: 'rgba(255,215,0,0.08)', glow: 'rgba(255,215,0,0.22)' },
    silver: { label: 'Silver', color: '#CBD5E1', border: 'rgba(203,213,225,0.6)', bg: 'rgba(203,213,225,0.08)', glow: 'rgba(203,213,225,0.18)' },
    other: { label: '', color: '#9CA3AF', border: 'rgba(255,255,255,0.15)', bg: 'transparent', glow: 'transparent' },
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
    return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`
}

const supabase = createClient()

// ── Team Logo with letter fallback ─────────────────────────────────────────
function TeamLogo({ team, colour, rgb, size = 54 }) {
    const [err, setErr] = useState(false)
    if (!team) return null
    const letter = team.name?.charAt(0)?.toUpperCase() || '?'
    const shared = {
        width: size, height: size, borderRadius: 8,
        border: `2px solid rgba(${rgb},0.55)`,
        boxShadow: `0 0 14px rgba(${rgb},0.28)`,
        flexShrink: 0,
    }
    if (err) return (
        <div style={{ ...shared, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `rgba(${rgb},0.12)`, fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.4rem', color: colour }}>
            {letter}
        </div>
    )
    return (
        <img
            src={`/images/teams/${team.id}.png`} alt={team.name}
            style={{ ...shared, objectFit: 'cover', display: 'block' }}
            onError={() => setErr(true)}
        />
    )
}

// ══════════════════════════════════════════════════════════════════════════
export default function OverlayPage() {
    const [astate, setAstate] = useState(null)
    const [allTeams, setAllTeams] = useState([])
    const [soldAnim, setSoldAnim] = useState(null)
    const [unsoldAnim, setUnsoldAnim] = useState(null)
    const [bidKey, setBidKey] = useState(0)

    const soldTimerRef = useRef(null)
    const soldLeaveRef = useRef(null)
    const unsoldTimerRef = useRef(null)
    const unsoldLeaveRef = useRef(null)
    const gavelRef = useRef(null)
    const unsoldAudioRef = useRef(null)

    const playGavel = useCallback(() => {
        try {
            if (!gavelRef.current) { gavelRef.current = new Audio('/sounds/gavel.wav'); gavelRef.current.volume = 0.85 }
            gavelRef.current.currentTime = 0; gavelRef.current.play().catch(() => { })
        } catch { }
    }, [])

    const playUnsoldSfx = useCallback(() => {
        try {
            if (!unsoldAudioRef.current) { unsoldAudioRef.current = new Audio('/sounds/unsold.wav'); unsoldAudioRef.current.volume = 0.75 }
            unsoldAudioRef.current.currentTime = 0; unsoldAudioRef.current.play().catch(() => { })
        } catch { }
    }, [])

    const triggerSold = useCallback((playerRow, teamRow) => {
        clearTimeout(soldTimerRef.current); clearTimeout(soldLeaveRef.current)
        setSoldAnim({ player: playerRow, team: teamRow, leaving: false })
        playGavel()
        soldTimerRef.current = setTimeout(() => {
            setSoldAnim(p => p ? { ...p, leaving: true } : null)
            soldLeaveRef.current = setTimeout(() => setSoldAnim(null), 600)
        }, 4500)
    }, [playGavel])

    const triggerUnsold = useCallback((playerRow) => {
        clearTimeout(unsoldTimerRef.current); clearTimeout(unsoldLeaveRef.current)
        setUnsoldAnim({ player: playerRow, leaving: false })
        playUnsoldSfx()
        unsoldTimerRef.current = setTimeout(() => {
            setUnsoldAnim(p => p ? { ...p, leaving: true } : null)
            unsoldLeaveRef.current = setTimeout(() => setUnsoldAnim(null), 600)
        }, 3500)
    }, [playUnsoldSfx])

    const fastRefresh = useCallback(async () => {
        try {
            const { data: stateRow } = await supabase.from('auction_state').select('*').eq('id', 1).single()
            if (!stateRow) return
            let currentPlayer = null
            if (stateRow.current_player_id) {
                const { data: p } = await supabase.from('players').select('*').eq('id', stateRow.current_player_id).single()
                if (p) { p.cls = p.class; currentPlayer = p }
            }
            const { data: teamsRaw } = await supabase.from('teams').select('*').order('name')
            const teams = (teamsRaw || []).map(t => ({ ...t, players_bought: t.roster_count ?? 0, max_players: t.max_slots ?? 0 }))
            let phase = stateRow.phase
            if (stateRow.is_paused && phase === 'active') phase = 'paused'
            setAstate(prev => {
                if (prev?.current_bid !== stateRow.current_bid) setBidKey(k => k + 1)
                return { ...stateRow, phase, current_player: currentPlayer, current_bid_team_id: stateRow.current_bid_team }
            })
            setAllTeams(teams)
        } catch (err) { console.error('[Overlay]', err) }
    }, [])

    useEffect(() => {
        fastRefresh()
        const ch = supabase.channel('overlay-rt-v2')
            .on('broadcast', { event: 'bid' }, ({ payload }) => {
                setAstate(prev => prev ? { ...prev, current_bid: payload.current_bid, current_bid_team: payload.current_bid_team, current_bid_team_id: payload.current_bid_team_id } : prev)
                setBidKey(k => k + 1)
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_state' }, () => fastRefresh())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => fastRefresh())
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players' }, async (payload) => {
                fastRefresh()
                const row = payload?.new
                if (row?.status === 'sold' && row?.sold_to_team) {
                    const { data: teamRow } = await supabase.from('teams').select('*').eq('id', row.sold_to_team).single()
                    const playerRow = { ...row, cls: row.class, sold_price: row.sold_amount }
                    if (teamRow) triggerSold(playerRow, teamRow)
                } else if (row?.status === 'unsold') {
                    triggerUnsold({ ...row, cls: row.class })
                }
            })
            .subscribe()
        return () => supabase.removeChannel(ch)
    }, [fastRefresh, triggerSold, triggerUnsold])

    // ── Derived ────────────────────────────────────────────────────────────
    const phase = astate?.phase || 'idle'
    const isActive = phase === 'active'
    const isPaused = phase === 'paused'
    const currentPlayer = astate?.current_player
    const leadingTeam = allTeams.find(t => t.id === astate?.current_bid_team_id)
    const cc = currentPlayer ? classCfg(currentPlayer.cls) : null
    const leadColour = leadingTeam ? teamColour(leadingTeam.id) : null
    const leadRgb = leadColour ? hexToRgb(leadColour) : null
    // Strip top border: team colour > class colour > gold default
    const stripBorderColour = leadColour || cc?.color || '#FFD700'
    const stripBorderRgb = hexToRgb(stripBorderColour)

    // ══════════════════════════════════════════════════════════════════════
    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Libre+Franklin:wght@400;600;700;800;900&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        :root{
          --fd:'Bebas Neue',sans-serif;
          --fu:'Libre Franklin',sans-serif;
          --bg:#060810; --text:#EEF2FF; --sub:#9CA3AF; --muted:#4B5563;
          --green:#4ADE80; --red:#F87171; --acc:#FFD700;
          --border2:rgba(255,255,255,0.07);
        }
        /* OBS canvas */
        html,body{
          background:transparent !important;
          overflow:hidden;
          width:1920px; height:1080px;
        }
        /* ── Keyframes ── */
        @keyframes stripIn  {from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
        @keyframes bidFlip  {from{opacity:0;transform:translateY(9px)}to{opacity:1;transform:translateY(0)}}
        @keyframes dotPulse {0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.25;transform:scale(1.9)}}
        @keyframes bannerIn {from{opacity:0;transform:translate(-50%,-55px) scale(0.97)}to{opacity:1;transform:translate(-50%,0) scale(1)}}
        @keyframes bannerOut{from{opacity:1;transform:translate(-50%,0) scale(1)}to{opacity:0;transform:translate(-50%,-55px) scale(0.97)}}
        @keyframes stampDrop{0%{opacity:0;transform:rotate(-18deg) scale(2.2)}60%{opacity:1;transform:rotate(-7deg) scale(0.9)}80%{transform:rotate(-7deg) scale(1.06)}100%{opacity:1;transform:rotate(-7deg) scale(1)}}
        @keyframes priceIn  {from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes sweepIn  {from{transform:scaleX(0)}to{transform:scaleX(1)}}
        @keyframes particle {0%{transform:translate(0,0) scale(1);opacity:0.9}100%{transform:translate(var(--dx),var(--dy)) scale(0);opacity:0}}
        @keyframes scanPass {0%{transform:translateY(-100%)}100%{transform:translateY(500%)}}

        /* ── MAIN STRIP ── */
        .strip{
          position:fixed;
          bottom:28px; left:50%;
          transform:translateX(-50%);
          width:1540px; height:192px;
          display:grid;
          grid-template-columns:300px 1fr 360px;
          overflow:hidden;
          border-top:3px solid;
          animation:stripIn 0.55s cubic-bezier(0.16,1,0.3,1);
        }
        .sp{
          position:relative;
          background:rgba(6,8,16,0.97);
          backdrop-filter:blur(20px);
          -webkit-backdrop-filter:blur(20px);
        }
        /* subtle scanline pass on each panel */
        .sp::before{
          content:'';position:absolute;left:0;right:0;height:18%;pointer-events:none;z-index:20;
          background:linear-gradient(180deg,transparent,rgba(255,255,255,0.016),transparent);
          animation:scanPass 4s linear 1s infinite;
        }

        /* ── LEFT panel ── */
        .sp-left{
          border-right:1px solid var(--border2);
          display:flex;flex-direction:column;align-items:flex-start;justify-content:center;
          padding:0 26px;gap:11px;
        }
        .cls-badge{
          display:inline-flex;align-items:center;gap:7px;
          padding:6px 14px;border:1px solid;
          font-family:var(--fu);font-size:0.7rem;font-weight:800;
          letter-spacing:2.5px;text-transform:uppercase;
        }
        .cls-gem{width:8px;height:8px;border-radius:2px;transform:rotate(45deg);flex-shrink:0}
        .pos-pill{
          display:inline-flex;align-items:center;
          padding:5px 13px;border:1px solid rgba(255,255,255,0.11);
          font-family:var(--fu);font-size:0.65rem;font-weight:700;
          letter-spacing:2.5px;text-transform:uppercase;color:var(--sub);
        }
        .base-wrap{display:flex;flex-direction:column;gap:1px}
        .base-lbl{font-family:var(--fu);font-size:0.52rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--muted)}
        .base-val{font-family:var(--fd);font-size:1.3rem;letter-spacing:1px;color:var(--sub);line-height:1}
        .idle-side{font-family:var(--fu);font-size:0.58rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--muted)}

        /* ── CENTER panel ── */
        .sp-center{
          display:grid;
          grid-template-columns:155px 1fr;
          align-items:stretch;
          border-right:1px solid var(--border2);
        }
        .photo-col{position:relative;overflow:hidden;border-right:1px solid var(--border2)}
        .photo-col img{width:100%;height:100%;object-fit:cover;object-position:center 12%;display:block}
        .photo-fb{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#0F1320}
        .cls-strip{position:absolute;bottom:0;left:0;right:0;height:4px}
        .info-col{display:flex;flex-direction:column;justify-content:center;padding:0 26px;gap:9px;min-width:0}
        .live-pill{
          display:inline-flex;align-items:center;gap:6px;width:fit-content;
          padding:3px 10px;border:1px solid rgba(74,222,128,0.35);
          background:rgba(74,222,128,0.06);
        }
        .live-dot{width:6px;height:6px;border-radius:50%;background:#4ADE80;animation:dotPulse 1.8s ease-in-out infinite;flex-shrink:0}
        .live-lbl{font-family:var(--fu);font-size:0.5rem;font-weight:800;letter-spacing:4px;color:#4ADE80;text-transform:uppercase}
        .p-name{
          font-family:var(--fd);
          font-size:clamp(2rem,3.2vw,3.3rem);
          line-height:1;letter-spacing:1.5px;color:var(--text);
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        }
        .p-college{font-family:var(--fu);font-size:0.6rem;font-weight:600;letter-spacing:2px;color:var(--muted);text-transform:uppercase}
        .idle-center{
          grid-column:1/-1;
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          gap:7px;
        }
        .idle-title{font-family:var(--fd);font-size:2.8rem;letter-spacing:4px;color:var(--muted);line-height:1}
        .idle-sub{font-family:var(--fu);font-size:0.6rem;font-weight:700;letter-spacing:4px;color:var(--muted);text-transform:uppercase}

        /* ── RIGHT panel ── */
        .sp-right{
          display:grid;
          grid-template-rows:1fr 1fr;
        }
        .right-team{
          display:flex;align-items:center;gap:13px;
          padding:0 22px;
          border-bottom:1px solid var(--border2);
          overflow:hidden;
        }
        .team-info{display:flex;flex-direction:column;gap:3px;min-width:0}
        .team-lead-row{
          display:flex;align-items:center;gap:5px;
          font-family:var(--fu);font-size:0.5rem;font-weight:800;
          letter-spacing:4px;text-transform:uppercase;color:var(--muted);
        }
        .tdot{width:5px;height:5px;border-radius:50%;animation:dotPulse 1.2s ease-in-out infinite;flex-shrink:0}
        .team-name-val{
          font-family:var(--fd);font-size:1.6rem;letter-spacing:1px;line-height:1;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        }
        .no-bid{font-family:var(--fu);font-size:0.6rem;font-weight:700;letter-spacing:2px;color:var(--muted)}
        .right-bid{display:flex;flex-direction:column;justify-content:center;padding:0 22px;gap:2px}
        .bid-header{font-family:var(--fu);font-size:0.5rem;font-weight:800;letter-spacing:5px;text-transform:uppercase;color:var(--muted)}
        .bid-amount{
          font-family:var(--fd);font-size:2.6rem;letter-spacing:2px;line-height:1;
          animation:bidFlip 0.25s ease both;
        }

        /* ── RESULT BANNER (SOLD / UNSOLD) ── */
        .result-banner{
          position:fixed;top:55px;left:50%;
          transform:translateX(-50%);
          width:1120px;height:128px;
          display:grid;
          grid-template-columns:128px 1fr auto auto;
          align-items:stretch;
          background:linear-gradient(180deg,#0d1020,#060810);
          border-bottom:4px solid;
          overflow:hidden;
          z-index:999;
          box-shadow:0 20px 80px rgba(0,0,0,0.95);
          animation:bannerIn 0.45s cubic-bezier(0.16,1,0.3,1);
        }
        .result-banner.leaving{animation:bannerOut 0.5s ease-in forwards}
        .result-banner.is-unsold{
          grid-template-columns:128px 1fr auto;
          border-bottom-color:rgba(248,113,113,0.8) !important;
        }
        .bn-scan{position:absolute;inset:0;pointer-events:none;z-index:10;overflow:hidden}
        .bn-scan::after{content:'';position:absolute;left:0;right:0;height:28%;background:linear-gradient(180deg,transparent,rgba(255,255,255,0.02),transparent);animation:scanPass 2.5s linear 0.5s infinite}
        .bn-photo{position:relative;overflow:hidden;border-right:1px solid rgba(255,255,255,0.07)}
        .bn-photo img{width:100%;height:100%;object-fit:cover;object-position:center 15%;display:block}
        .bn-stamp-wrap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(6,8,16,0.52)}
        .bn-stamp{font-family:var(--fd);font-size:1.65rem;letter-spacing:4px;padding:4px 10px;border:3px solid;line-height:1;animation:stampDrop 0.55s 1.4s cubic-bezier(0.16,1,0.3,1) both}
        .bn-particles{position:absolute;inset:0;pointer-events:none;overflow:visible;z-index:5}
        .bn-p{position:absolute;border-radius:50%;animation:particle 0.9s ease-out both}
        .bn-info{padding:0 22px;display:flex;flex-direction:column;justify-content:center;gap:5px;min-width:0;position:relative;z-index:2}
        .bn-result-lbl{font-family:var(--fu);font-size:0.5rem;font-weight:800;letter-spacing:5px;text-transform:uppercase;display:flex;align-items:center;gap:8px}
        .bn-sweep{flex:1;height:1px;transform-origin:left;animation:sweepIn 0.5s 0.2s ease forwards;transform:scaleX(0)}
        .bn-name{font-family:var(--fd);font-size:2.7rem;letter-spacing:1px;line-height:1;color:#EEF2FF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .bn-badges{display:flex;gap:5px;margin-top:2px;flex-wrap:wrap}
        .bn-badge{font-family:var(--fu);font-size:0.48rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:2px 8px;border:1px solid}
        .bn-team{padding:0 22px;border-left:1px solid rgba(255,255,255,0.07);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;flex-shrink:0;min-width:165px;position:relative;z-index:2}
        .bn-team-lbl{font-family:var(--fu);font-size:0.48rem;font-weight:800;letter-spacing:4px;text-transform:uppercase;color:var(--muted)}
        .bn-team-logo{width:40px;height:40px;border-radius:7px;object-fit:cover;border:2px solid;display:block}
        .bn-team-name{font-family:var(--fd);font-size:1.65rem;letter-spacing:1px;line-height:1;text-align:center}
        .bn-price{padding:0 26px;border-left:1px solid rgba(255,255,255,0.07);display:flex;flex-direction:column;align-items:flex-end;justify-content:center;flex-shrink:0;min-width:195px;position:relative;z-index:2}
        .bn-price-lbl{font-family:var(--fu);font-size:0.48rem;font-weight:800;letter-spacing:4px;text-transform:uppercase;color:var(--muted);margin-bottom:5px}
        .bn-price-val{font-family:var(--fd);font-size:2.9rem;letter-spacing:2px;line-height:1;animation:priceIn 0.4s 0.15s ease both}
        .bn-nosale{padding:0 32px;border-left:1px solid rgba(248,113,113,0.15);display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;position:relative;z-index:2}
        .bn-nosale-lbl{font-family:var(--fu);font-size:0.48rem;font-weight:800;letter-spacing:4px;text-transform:uppercase;color:var(--muted);margin-bottom:5px}
        .bn-nosale-val{font-family:var(--fd);font-size:2.1rem;letter-spacing:1px;color:#F87171;line-height:1;animation:priceIn 0.4s 0.15s ease both}
      `}</style>

            {/* ══ MAIN STRIP ══ */}
            <div
                className="strip"
                style={{
                    borderTopColor: stripBorderColour,
                    boxShadow: `0 -3px 32px rgba(${stripBorderRgb},0.18), 0 30px 80px rgba(0,0,0,0.9)`,
                }}
            >
                {/* ── LEFT: Class + Position + Base price ── */}
                <div
                    className="sp sp-left"
                    style={{
                        background: cc && cc.glow !== 'transparent'
                            ? `linear-gradient(135deg, rgba(6,8,16,0.97) 45%, ${cc.glow.replace('0.22', '0.1')} 100%)`
                            : 'rgba(6,8,16,0.97)',
                    }}
                >
                    {currentPlayer ? (
                        <>
                            {cc && cc.label && (
                                <div className="cls-badge" style={{ background: cc.bg, borderColor: cc.border, color: cc.color, boxShadow: `0 0 16px ${cc.glow}` }}>
                                    <div className="cls-gem" style={{ background: cc.color }} />
                                    {cc.label} Class
                                </div>
                            )}
                            {currentPlayer.position && (
                                <div className="pos-pill">
                                    {normalisePos(currentPlayer.position) || currentPlayer.position}
                                </div>
                            )}
                            {currentPlayer.base_price && (
                                <div className="base-wrap">
                                    <div className="base-lbl">Base Price</div>
                                    <div className="base-val">{fmtFull(currentPlayer.base_price)}</div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="idle-side">{isPaused ? 'Paused' : 'Standby'}</div>
                    )}
                </div>

                {/* ── CENTER: Photo + Name + College ── */}
                <div className="sp sp-center">
                    {currentPlayer ? (
                        <>
                            <div className="photo-col">
                                <img
                                    key={currentPlayer.id}
                                    src={currentPlayer.photo_url || `/images/players/${currentPlayer.id}.jpg`}
                                    alt={currentPlayer.name}
                                    onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
                                />
                                <div className="photo-fb" style={{ display: 'none' }}>
                                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                                </div>
                                {cc && <div className="cls-strip" style={{ background: cc.color, opacity: 0.85 }} />}
                            </div>
                            <div className="info-col">
                                <div className="live-pill">
                                    <div className="live-dot" />
                                    <span className="live-lbl">On the Block</span>
                                </div>
                                <div className="p-name">{currentPlayer.name}</div>
                                {currentPlayer.college && (
                                    <div className="p-college">{currentPlayer.college}</div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="idle-center">
                            <div className="idle-title">{isPaused ? 'PAUSED' : 'STANDBY'}</div>
                            <div className="idle-sub">{isPaused ? 'Auctioneer will resume shortly' : 'Next player coming up'}</div>
                        </div>
                    )}
                </div>

                {/* ── RIGHT: Team logo + name + Current bid ── */}
                <div
                    className="sp sp-right"
                    style={{
                        background: leadRgb
                            ? `linear-gradient(135deg, rgba(6,8,16,0.97) 25%, rgba(${leadRgb},0.11) 100%)`
                            : 'rgba(6,8,16,0.97)',
                    }}
                >
                    {/* Team row */}
                    <div className="right-team">
                        {leadingTeam ? (
                            <>
                                <TeamLogo team={leadingTeam} colour={leadColour} rgb={leadRgb} />
                                <div className="team-info">
                                    <div className="team-lead-row">
                                        <div className="tdot" style={{ background: leadColour }} />
                                        Leading
                                    </div>
                                    <div className="team-name-val" style={{ color: leadColour }}>{leadingTeam.name}</div>
                                </div>
                            </>
                        ) : (
                            <div className="no-bid">No bids yet</div>
                        )}
                    </div>

                    {/* Bid row */}
                    <div className="right-bid">
                        <div className="bid-header">Current Bid</div>
                        <div className="bid-amount" key={bidKey} style={{ color: leadColour || 'var(--acc)' }}>
                            {astate?.current_bid
                                ? fmtFull(astate.current_bid)
                                : currentPlayer?.base_price
                                    ? fmtFull(currentPlayer.base_price)
                                    : '—'}
                        </div>
                    </div>
                </div>
            </div>

            {/* ══ SOLD BANNER ══ */}
            {soldAnim && (() => {
                const colour = teamColour(soldAnim.team.id)
                const rgb = hexToRgb(colour)
                const price = soldAnim.player.sold_price || soldAnim.player.sold_amount
                const pcc = classCfg(soldAnim.player.cls)
                const parts = Array.from({ length: 18 }, (_, i) => {
                    const a = (i / 18) * 2 * Math.PI, d = 50 + Math.random() * 55
                    return { dx: Math.cos(a) * d, dy: Math.sin(a) * d, delay: i * 0.04, size: 3 + Math.random() * 5 }
                })
                return (
                    <div
                        className={`result-banner${soldAnim.leaving ? ' leaving' : ''}`}
                        style={{ borderBottomColor: colour, boxShadow: `0 20px 80px rgba(0,0,0,0.95), inset 0 0 0 1px rgba(${rgb},0.1)` }}
                    >
                        <div className="bn-scan" />
                        <div className="bn-photo" style={{ borderRightColor: `rgba(${rgb},0.15)` }}>
                            <img src={soldAnim.player.photo_url || `/images/players/${soldAnim.player.id}.jpg`} alt={soldAnim.player.name}
                                onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
                            <div className="photo-fb" style={{ display: 'none' }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={`rgba(${rgb},0.3)`} strokeWidth="1"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                            </div>
                            <div className="bn-stamp-wrap">
                                <div className="bn-stamp" style={{ borderColor: colour, color: colour }}>SOLD</div>
                            </div>
                            <div className="bn-particles">
                                {parts.map((p, i) => (
                                    <div key={i} className="bn-p" style={{ background: colour, width: p.size, height: p.size, top: '50%', left: '50%', '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, animationDelay: `${1.4 + p.delay}s` }} />
                                ))}
                            </div>
                        </div>
                        <div className="bn-info">
                            <div className="bn-result-lbl" style={{ color: '#4ADE80' }}>
                                SOLD <div className="bn-sweep" style={{ background: 'rgba(74,222,128,0.25)' }} />
                            </div>
                            <div className="bn-name">{soldAnim.player.name}</div>
                            <div className="bn-badges">
                                {soldAnim.player.position && <span className="bn-badge" style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'var(--sub)' }}>{normalisePos(soldAnim.player.position) || soldAnim.player.position}</span>}
                                {pcc.label && <span className="bn-badge" style={{ background: pcc.bg, borderColor: pcc.border, color: pcc.color }}>{pcc.label}</span>}
                            </div>
                        </div>
                        <div className="bn-team" style={{ borderLeftColor: `rgba(${rgb},0.15)` }}>
                            <div className="bn-team-lbl">Goes to</div>
                            <img className="bn-team-logo" src={`/images/teams/${soldAnim.team.id}.png`} alt=""
                                style={{ borderColor: `rgba(${rgb},0.6)`, boxShadow: `0 0 12px rgba(${rgb},0.3)` }}
                                onError={e => e.target.style.display = 'none'} />
                            <div className="bn-team-name" style={{ color: colour }}>{soldAnim.team.name}</div>
                        </div>
                        <div className="bn-price" style={{ borderLeftColor: `rgba(${rgb},0.15)` }}>
                            <div className="bn-price-lbl">Final Price</div>
                            <div className="bn-price-val" style={{ color: colour }}>{fmtFull(price)}</div>
                        </div>
                    </div>
                )
            })()}

            {/* ══ UNSOLD BANNER ══ */}
            {unsoldAnim && (() => {
                const pcc = classCfg(unsoldAnim.player.cls)
                return (
                    <div className={`result-banner is-unsold${unsoldAnim.leaving ? ' leaving' : ''}`}>
                        <div className="bn-scan" />
                        <div className="bn-photo" style={{ borderRightColor: 'rgba(248,113,113,0.15)' }}>
                            <img src={unsoldAnim.player.photo_url || `/images/players/${unsoldAnim.player.id}.jpg`} alt={unsoldAnim.player.name}
                                onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
                            <div className="photo-fb" style={{ display: 'none' }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(248,113,113,0.3)" strokeWidth="1"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                            </div>
                            <div className="bn-stamp-wrap">
                                <div className="bn-stamp" style={{ borderColor: '#F87171', color: '#F87171' }}>UNSOLD</div>
                            </div>
                        </div>
                        <div className="bn-info">
                            <div className="bn-result-lbl" style={{ color: '#F87171' }}>
                                UNSOLD <div className="bn-sweep" style={{ background: 'rgba(248,113,113,0.25)' }} />
                            </div>
                            <div className="bn-name">{unsoldAnim.player.name}</div>
                            <div className="bn-badges">
                                {unsoldAnim.player.position && <span className="bn-badge" style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'var(--sub)' }}>{normalisePos(unsoldAnim.player.position) || unsoldAnim.player.position}</span>}
                                {pcc.label && <span className="bn-badge" style={{ background: pcc.bg, borderColor: pcc.border, color: pcc.color }}>{pcc.label}</span>}
                                {unsoldAnim.player.base_price && <span className="bn-badge" style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'var(--muted)' }}>Base {fmtFull(unsoldAnim.player.base_price)}</span>}
                            </div>
                        </div>
                        <div className="bn-nosale">
                            <div className="bn-nosale-lbl">Returns to pool</div>
                            <div className="bn-nosale-val">No Bids</div>
                        </div>
                    </div>
                )
            })()}
        </>
    )
}