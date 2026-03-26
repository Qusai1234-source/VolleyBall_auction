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
    const [initialised, setInitialised] = useState(false)

    // banner state
    const [soldAnim, setSoldAnim] = useState(null)
    const [unsoldAnim, setUnsoldAnim] = useState(null)
    const soldTimerRef = useRef(null)
    const soldLeaveRef = useRef(null)
    const unsoldTimerRef = useRef(null)
    const unsoldLeaveRef = useRef(null)
    const gavelRef = useRef(null)
    const unsoldRef = useRef(null)

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
            if (!unsoldRef.current) { unsoldRef.current = new Audio('/sounds/unsold.mp3'); unsoldRef.current.volume = 0.75 }
            unsoldRef.current.currentTime = 0
            unsoldRef.current.play().catch(() => { })
        } catch { }
    }, [])

    // ── Banners ────────────────────────────────────────────────────────────
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

    // ── Fast Sync ──────────────────────────────────────────────────────────
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
                if (prev?.current_bid !== stateRow.current_bid) setBidKey(k => k + 1)
                return { ...stateRow, phase, current_player: currentPlayer, current_bid_team_id: stateRow.current_bid_team }
            })
            setAllTeams(teams)
            setInitialised(true)
        } catch (err) { console.error('[Overlay] fast refresh error:', err) }
    }, [])

    // ── Realtime ───────────────────────────────────────────────────────────
    useEffect(() => {
        fastRefresh()

        const ch = supabase.channel('overlay-rt')
            .on('broadcast', { event: 'bid' }, ({ payload }) => {
                setAstate(prev => prev ? {
                    ...prev,
                    current_bid: payload.current_bid,
                    current_bid_team: payload.current_bid_team,
                    current_bid_team_id: payload.current_bid_team_id,
                } : prev)
                setBidKey(k => k + 1)
            })
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
          --bg:     #0B0E18;
          --acc:    #FFD700;
          --text:   #EEF2FF;
          --sub:    #9CA3AF;
          --muted:  #4B5563;
          --green:  #4ADE80;
          --red:    #F87171;
          --border: rgba(255,215,0,0.15);
          --border2:rgba(255,255,255,0.08);
          --fd: 'Bebas Neue', sans-serif;
          --fu: 'Libre Franklin', sans-serif;
        }

        html, body {
          background: transparent !important;
          overflow: hidden;
          width: 1920px;
          height: 1080px;
          display: flex; align-items: flex-end; justify-content: center;
          padding-bottom: 40px;
        }

        /* ── Three Part Broadcast Strip ── */
        .broadcast-strip {
          width: 1400px;
          height: 140px;
          background: rgba(11, 14, 24, 0.96);
          border: 1px solid var(--border);
          border-radius: 12px;
          display: grid;
          grid-template-columns: 360px 1fr 340px; /* Left | Center | Right */
          overflow: visible;
          box-shadow: 0 40px 100px rgba(0,0,0,0.8), 0 0 60px rgba(255, 215, 0, 0.05);
          animation: stripIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);
          position: relative;
        }
        .broadcast-strip.hidden { opacity:0; transform: translateY(100px); pointer-events: none; }

        @keyframes stripIn {
          from { opacity: 0; transform: translateY(100px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* ── LEFT PART: Team ── */
        .strip-left {
          padding: 0 30px;
          display: flex; align-items: center; gap: 20px;
          background: rgba(255,255,255,0.02);
          border-right: 1px solid var(--border2);
        }
        .team-logo {
          width: 75px; height: 75px;
          background: rgba(255,255,255,0.05);
          border: 2px solid;
          border-radius: 12px;
          object-fit: cover;
          box-shadow: 0 8px 16px rgba(0,0,0,0.4);
        }
        .team-info { display: flex; flex-direction: column; gap: 4px; }
        .team-lbl { font-family: var(--fu); font-size: 0.6rem; letter-spacing: 4px; color: var(--muted); text-transform: uppercase; font-weight: 800; }
        .team-name { font-family: var(--fd); font-size: 2.2rem; line-height: 1; letter-spacing: 1px; }

        /* ── CENTER PART: Player ── */
        .strip-center {
          position: relative;
          display: flex; align-items: center;
          padding: 0 40px;
        }
        .player-photo-wrap {
          width: 200px; height: 200px;
          position: absolute; left: 20px; bottom: 0;
          overflow: visible;
          z-index: 10;
        }
        .player-photo {
          width: 100%; height: 220px;
          object-fit: cover; object-position: center 10%;
          mask-image: linear-gradient(to top, black 85%, transparent 100%);
          filter: drop-shadow(0 10px 20px rgba(0,0,0,1));
        }
        .player-details {
          margin-left: 170px;
          display: flex; flex-direction: column; gap: 6px;
        }
        .player-name { font-family: var(--fd); font-size: 3.8rem; line-height: 1; color: var(--text); letter-spacing: 1px; }
        .player-badges { display: flex; gap: 8px; }
        .p-badge { font-family:var(--fu); font-size: 0.65rem; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; padding: 4px 12px; border: 1px solid; border-radius: 4px; }

        /* ── RIGHT PART: Bid ── */
        .strip-right {
          padding: 0 40px;
          display: flex; flex-direction: column; align-items: flex-end; justify-content: center;
          background: rgba(255,255,255,0.02);
          border-left: 1px solid var(--border2);
          text-align: right;
        }
        .bid-lbl { font-family: var(--fu); font-size: 0.65rem; letter-spacing: 5px; color: var(--sub); text-transform: uppercase; font-weight: 800; margin-bottom: 4px; }
        .bid-val { font-family: var(--fd); font-size: 4.5rem; line-height: 1; color: var(--acc); letter-spacing: 2px; }
        @keyframes bidPulse { 0% { transform: scale(1); } 50% { transform: scale(1.08); color: #FFF; } 100% { transform: scale(1); } }
        .bid-val.pulse { animation: bidPulse 0.3s ease; }

        /* ── SOLD/UNSOLD BANNER ── */
        .sold-banner {
          position: fixed; top: 40px; left: 50%; transform: translateX(-50%);
          width: 800px; height: 120px;
          display: grid; grid-template-columns: 120px 1fr auto auto;
          background: #0B0E18; border: 1px solid var(--border); border-bottom: 4px solid;
          box-shadow: 0 30px 60px rgba(0,0,0,0.9); z-index: 1000;
          animation: bannerIn 0.5s cubic-bezier(0.16,1,0.3,1);
        }
        .sold-banner.leaving { animation: bannerOut 0.4s ease-in forwards; }
        @keyframes bannerIn { from{opacity:0;transform: translate(-50%, -100%)} to{opacity:1;transform: translate(-50%, 0)} }
        @keyframes bannerOut{ from{opacity:1;transform: translate(-50%, 0)} to{opacity:0;transform: translate(-50%, -100%)} }
        .bn-photo { width: 120px; position: relative; border-right: 1px solid var(--border2); }
        .bn-photo img { width: 100%; height: 100%; object-fit: cover; }
        .bn-stamp { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); }
        .bn-stamp-inner { font-family:var(--fd); font-size: 2.2rem; border: 3px solid; padding: 4px 12px; transform: rotate(-8deg); }
      `}</style>

            <div className={`broadcast-strip ${(!initialised || (!isActive && !isPaused)) ? 'hidden' : ''}`}>
                {/* 1. LEFT: TEAM INFO */}
                <div className="strip-left">
                    <img 
                      className="team-logo" 
                      src={leadingTeam ? `/images/teams/${leadingTeam.id}.png` : '/images/teams/default.png'} 
                      style={{ borderColor: leadColour, boxShadow: `0 0 20px rgba(${leadRgb}, 0.2)` }}
                      alt=""
                    />
                    <div className="team-info">
                        <div className="team-lbl">Leading Bidder</div>
                        <div className="team-name" style={{ color: leadColour }}>
                            {leadingTeam ? leadingTeam.name : 'No Bids Yet'}
                        </div>
                    </div>
                </div>

                {/* 2. CENTER: PLAYER INFO */}
                <div className="strip-center">
                    {currentPlayer && (
                        <>
                            <div className="player-photo-wrap">
                                <img 
                                  className="player-photo" 
                                  src={currentPlayer.photo_url || `/images/players/${currentPlayer.id}.jpg`} 
                                  alt=""
                                />
                            </div>
                            <div className="player-details">
                                <div className="player-name">{currentPlayer.name}</div>
                                <div className="player-badges">
                                    <span className="p-badge" style={{ borderColor: 'rgba(255,255,255,0.2)', color: 'var(--sub)' }}>
                                        {normalisePos(currentPlayer.position)}
                                    </span>
                                    {cc && (
                                        <span className="p-badge" style={{ background: cc.bg, borderColor: cc.border, color: cc.color }}>
                                            {cc.label} Class
                                        </span>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* 3. RIGHT: BID INFO */}
                <div className="strip-right">
                    <div className="bid-lbl">Current Bid</div>
                    <div className={`bid-val ${bidKey > 0 ? 'pulse' : ''}`} key={bidKey}>
                        {astate?.current_bid ? fmtFull(astate.current_bid) : fmtFull(currentPlayer?.base_price || 0)}
                    </div>
                </div>
            </div>

            {/* ══ OVERLAY BANNERS ══ */}
            {soldAnim && (
                <div className={`sold-banner ${soldAnim.leaving ? 'leaving' : ''}`} style={{ borderBottomColor: teamColour(soldAnim.team.id) }}>
                    <div className="bn-photo">
                        <img src={soldAnim.player.photo_url || `/images/players/${soldAnim.player.id}.jpg`} alt="" />
                        <div className="bn-stamp">
                            <div className="bn-stamp-inner" style={{ borderColor: teamColour(soldAnim.team.id), color: teamColour(soldAnim.team.id) }}>SOLD</div>
                        </div>
                    </div>
                    <div style={{ padding: '0 24px', display:'flex', flexDirection:'column', justifyContent:'center' }}>
                        <div style={{ fontFamily: 'var(--fu)', fontSize: '0.6rem', color: '#4ADE80', letterSpacing: '4px', fontWeight: 800, textTransform: 'uppercase' }}>Auction Result</div>
                        <div style={{ fontFamily: 'var(--fd)', fontSize: '3rem', color: '#FFF' }}>{soldAnim.player.name}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', padding: '0 30px' }}>
                        <img src={`/images/teams/${soldAnim.team.id}.png`} alt="" style={{ width: 70, height: 70, borderRadius: 10, border: `2px solid ${teamColour(soldAnim.team.id)}` }} />
                    </div>
                    <div style={{ padding: '0 30px', borderLeft: '1px solid var(--border2)', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'right' }}>
                        <div style={{ fontFamily: 'var(--fu)', fontSize: '0.6rem', color: 'var(--sub)', letterSpacing: '4px', fontWeight: 800, textTransform: 'uppercase' }}>Final Bid</div>
                        <div style={{ fontFamily: 'var(--fd)', fontSize: '3.5rem', color: '#FFF' }}>{fmtFull(soldAnim.player.sold_price || soldAnim.player.sold_amount)}</div>
                    </div>
                </div>
            )}

            {unsoldAnim && (
                <div className={`sold-banner ${unsoldAnim.leaving ? 'leaving' : ''}`} style={{ borderBottomColor: '#F87171' }}>
                    <div className="bn-photo">
                        <img src={unsoldAnim.player.photo_url || `/images/players/${unsoldAnim.player.id}.jpg`} alt="" />
                        <div className="bn-stamp">
                            <div className="bn-stamp-inner" style={{ borderColor: '#F87171', color: '#F87171' }}>UNSOLD</div>
                        </div>
                    </div>
                    <div style={{ padding: '0 24px', display:'flex', flexDirection:'column', justifyContent:'center' }}>
                        <div style={{ fontFamily: 'var(--fu)', fontSize: '0.6rem', color: '#F87171', letterSpacing: '4px', fontWeight: 800, textTransform: 'uppercase' }}>Auction Result</div>
                        <div style={{ fontFamily: 'var(--fd)', fontSize: '3rem', color: '#FFF' }}>{unsoldAnim.player.name}</div>
                    </div>
                    <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(248,113,113,0.05)' }}>
                        <div style={{ fontFamily: 'var(--fd)', fontSize: '2.5rem', color: '#F87171', letterSpacing: '2px' }}>NO SALE</div>
                    </div>
                </div>
            )}
        </>
    )
}