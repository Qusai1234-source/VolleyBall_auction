'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

function useIsMobile(breakpoint = 768) {
    const [isMobile, setIsMobile] = useState(false)
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < breakpoint)
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [breakpoint])
    return isMobile
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const fmt = (n) => (n == null ? '—' : n >= 1000 ? `₹${(n / 1000).toFixed(1)}K` : `₹${n}`)
const fmtFull = (n) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN')}`)

const normalisePos = (pos) => {
    if (!pos) return 'other'
    const p = pos.toLowerCase()
    if (p.includes('spike') || p.includes('outside') || p.includes('opposite') || p.includes('middle') || p.includes('oh') || p.includes('mb') || p.includes('op')) return 'spiker'
    if (p.includes('set')) return 'setter'
    if (p.includes('liber') || p.includes('lift')) return 'libero'
    return 'other'
}
const normaliseClass = (cls) => {
    if (!cls) return 'other'
    const c = cls.toLowerCase()
    if (c.includes('diamond') || c === 'a') return 'diamond'
    if (c.includes('gold') || c === 'b') return 'gold'
    if (c.includes('silver') || c === 'c') return 'silver'
    return 'other'
}
const POS_STYLE = {
    spiker: { bg: 'rgba(249,115,22,0.18)', border: 'rgba(249,115,22,0.6)', text: '#FB923C' },
    setter: { bg: 'rgba(234,179,8,0.18)', border: 'rgba(234,179,8,0.6)', text: '#FCD34D' },
    libero: { bg: 'rgba(6,182,212,0.18)', border: 'rgba(6,182,212,0.6)', text: '#22D3EE' },
    other: { bg: 'rgba(168,85,247,0.18)', border: 'rgba(168,85,247,0.6)', text: '#C084FC' },
}
const posStyle = (pos) => POS_STYLE[normalisePos(pos)] || POS_STYLE.other
const CLASS_CFG = {
    diamond: { color: '#67E8F9', border: 'rgba(103,232,249,0.5)', bg: 'rgba(103,232,249,0.12)', glow: 'rgba(103,232,249,0.35)' },
    gold: { color: '#FFD700', border: 'rgba(255,215,0,0.55)', bg: 'rgba(255,215,0,0.12)', glow: 'rgba(255,215,0,0.35)' },
    silver: { color: '#CBD5E1', border: 'rgba(203,213,225,0.5)', bg: 'rgba(203,213,225,0.12)', glow: 'rgba(203,213,225,0.25)' },
    other: { color: 'var(--sub)', border: 'var(--border2)', bg: 'transparent', glow: 'transparent' },
}
const classCfg = (cls) => CLASS_CFG[normaliseClass(cls)] || CLASS_CFG.other

const GOLD_BASE = 20000, SILVER_BASE = 10000, STARTING_WALLET = 200000

const calcMaxBid = (team, currentCls = null, squad = []) => {
    const goldHave = squad.filter(p => normaliseClass(p.cls) === 'gold').length
    const silverHave = squad.filter(p => normaliseClass(p.cls) === 'silver').length
    let gN = Math.max(0, 2 - goldHave)
    let sN = Math.max(0, 5 - silverHave)
    if (currentCls === 'gold') gN = Math.max(0, gN - 1)
    if (currentCls === 'silver') sN = Math.max(0, sN - 1)
    return Math.max(0, (team.wallet ?? 0) - (gN * GOLD_BASE + sN * SILVER_BASE))
}

const TEAM_BRAND = {
    '11111111-0001-0001-0001-000000000001': '#C47F17',
    '11111111-0002-0002-0002-000000000002': '#00a3c8ff',
    '11111111-0003-0003-0003-000000000003': '#1A8A3A',
    '11111111-0004-0004-0004-000000000004': '#7C3FAB',
    '11111111-0005-0005-0005-000000000005': '#A89B18',
    '11111111-0006-0006-0006-000000000006': '#CC2020',
}
const teamColour = (id) => TEAM_BRAND[id] || '#6B7280'
const hexToRgb = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
    return `${r},${g},${b}`
}

// ── Roster Modal ──────────────────────────────────────────────────────────────
function RosterModal({ team, roster, onClose }) {
    const totalSpent = (roster || []).reduce((s, p) => normaliseClass(p.cls) === 'diamond' ? s : s + (p.sold_price || 0), 0)
    const colour = teamColour(team.id), rgb = hexToRgb(colour)
    const [imgErr, setImgErr] = useState(false)
    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(6,8,16,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#0D1117', border: `1px solid rgba(${rgb},0.25)`, width: 560, maxWidth: '90vw', maxHeight: '82vh', display: 'flex', flexDirection: 'column', boxShadow: `0 20px 80px rgba(0,0,0,0.9),0 0 40px rgba(${rgb},0.1)` }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: `linear-gradient(90deg,transparent 40%,rgba(${rgb},0.1) 100%)` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', border: `2px solid rgba(${rgb},0.5)`, boxShadow: `0 0 16px rgba(${rgb},0.3)`, background: `rgba(${rgb},0.15)` }}>
                            {!imgErr
                                ? <img src={`/images/teams/${team.id}.png`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setImgErr(true)} />
                                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--fd)', fontSize: '1.5rem', color: colour }}>{team.name.charAt(0)}</div>
                            }
                        </div>
                        <div>
                            <div style={{ fontFamily: 'var(--fd)', fontSize: '1.7rem', letterSpacing: '1px', color: 'var(--text)', lineHeight: 1 }}>{team.name}</div>
                            <div style={{ fontFamily: 'var(--fu)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '2px', color: 'var(--sub)', marginTop: 5 }}>{(roster || []).length} players · {fmtFull(team.wallet)} remaining</div>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border2)', cursor: 'pointer', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(248,113,113,0.5)'; e.currentTarget.style.color = 'var(--red)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--muted)' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                    {(!roster || roster.length === 0)
                        ? <div style={{ padding: '32px', textAlign: 'center', fontFamily: 'var(--fu)', fontSize: '0.7rem', letterSpacing: '3px', color: 'var(--muted)', textTransform: 'uppercase' }}>No players yet</div>
                        : roster.map(p => {
                            const ps = posStyle(p.position), cc = classCfg(p.cls)
                            return (
                                <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    <div style={{ background: 'var(--bg-panel)', overflow: 'hidden' }}>
                                        <img src={p.photo_url || `/images/players/${p.id}.jpg`} alt="" style={{ width: 80, height: 96, objectFit: 'cover', objectPosition: 'top', display: 'block' }} onError={e => e.target.style.display = 'none'} />
                                    </div>
                                    <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
                                        <div style={{ fontFamily: 'var(--fd)', fontSize: '1.2rem', color: 'var(--text)' }}>{p.name}</div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <span style={{ fontFamily: 'var(--fu)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', padding: '2px 8px', background: ps.bg, border: `1px solid ${ps.border}`, color: ps.text }}>{p.position || '—'}</span>
                                            <span style={{ fontFamily: 'var(--fu)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', padding: '2px 8px', background: cc.bg, border: `1px solid ${cc.border}`, color: cc.color }}>{p.cls || '—'}</span>
                                        </div>
                                    </div>
                                    <div style={{ padding: '10px 16px', borderLeft: '1px solid var(--border2)', display: 'flex', alignItems: 'center' }}>
                                        <div style={{ fontFamily: 'var(--fd)', fontSize: '1.15rem', color: normaliseClass(p.cls) === 'diamond' ? '#67E8F9' : 'var(--acc)' }}>{normaliseClass(p.cls) === 'diamond' ? 'Retained' : fmt(p.sold_price)}</div>
                                    </div>
                                </div>
                            )
                        })
                    }
                </div>
                <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border2)', display: 'flex', justifyContent: 'space-between', background: `rgba(${rgb},0.04)` }}>
                    <div style={{ fontFamily: 'var(--fu)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '3px', color: 'var(--muted)', textTransform: 'uppercase' }}>Total Spent</div>
                    <div style={{ fontFamily: 'var(--fd)', fontSize: '1.3rem', color: 'var(--acc)' }}>{fmtFull(totalSpent)}</div>
                </div>
            </div>
        </div>
    )
}

// ── Style 4 Team Card: thick left stripe + logo + stats ───────────────────────
function TeamCard({ team, isLeading, onViewRoster, currentPlayer, players }) {
    const [imgErr, setImgErr] = useState(false)
    const colour = teamColour(team.id)
    const rgb = hexToRgb(colour)
    const letter = team.name?.charAt(0)?.toUpperCase() || '?'
    const walletPct = Math.min(100, Math.round((team.wallet / STARTING_WALLET) * 100))
    const maxBid = calcMaxBid(
        team,
        currentPlayer ? normaliseClass(currentPlayer.cls) : null,
        players.filter(p => p.status === 'sold' && p.sold_to_team === team.id)
    )

    return (
        <div style={{
            flex: 1,
            position: 'relative',
            display: 'flex',
            overflow: 'hidden',
            borderRight: '1px solid var(--border2)',
            background: isLeading ? `rgba(${rgb},0.07)` : 'var(--bg-card)',
            transition: 'background 0.3s',
            cursor: 'default',
        }}>
            {/* thick left colour stripe */}
            <div style={{
                width: 7, flexShrink: 0,
                background: colour,
                opacity: isLeading ? 1 : 0.55,
                transition: 'opacity 0.3s',
            }} />

            {/* subtle colour wash on the right */}
            <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                background: `linear-gradient(90deg, transparent 30%, rgba(${rgb},0.08) 100%)`,
            }} />

            {/* content */}
            <div style={{ flex: 1, padding: '10px 10px 10px 12px', display: 'flex', flexDirection: 'column', gap: 0, position: 'relative', zIndex: 1, minWidth: 0 }}>

                {/* top: logo + name + leading badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
                    {/* logo circle */}
                    <div style={{
                        width: 55, height: 55, borderRadius: '10%', overflow: 'hidden', flexShrink: 0,
                        border: `1.5px solid rgba(${rgb},${isLeading ? 0.7 : 0.4})`,
                        boxShadow: isLeading ? `0 0 12px rgba(${rgb},0.5)` : 'none',
                        background: `rgba(${rgb},0.15)`,
                        transition: 'box-shadow 0.3s',
                    }}>
                        {!imgErr
                            ? <img src={`/images/teams/${team.id}.png`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={() => setImgErr(true)} />
                            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--fd)', fontSize: '1.1rem', color: colour }}>{letter}</div>
                        }
                    </div>
                    <div style={{ minWidth: 0 }}>
                        {isLeading && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                                <div style={{ width: 5, height: 5, borderRadius: '50%', background: colour, animation: 'leadPulse 1.2s ease-in-out infinite', flexShrink: 0 }} />
                                <span style={{ fontFamily: 'var(--fu)', fontSize: '0.55rem', fontWeight: 800, letterSpacing: '3px', textTransform: 'uppercase', color: colour }}>Leading</span>
                            </div>
                        )}
                        <div style={{
                            fontFamily: 'var(--fd)', fontSize: '1.05rem', letterSpacing: '0.5px',
                            color: isLeading ? colour : 'var(--text)',
                            lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{team.name}</div>
                    </div>
                </div>

                {/* divider */}
                <div style={{ height: 1, background: 'var(--border2)', marginBottom: 8 }} />

                {/* stats: wallet + max bid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, marginBottom: 8 }}>
                    <div style={{ paddingRight: 8, borderRight: '1px solid var(--border2)' }}>
                        <div style={{ fontFamily: 'var(--fd)', fontSize: '1.1rem', letterSpacing: '1px', color: 'var(--acc)', lineHeight: 1 }}>{fmt(team.wallet)}</div>
                        <div style={{ fontFamily: 'var(--fu)', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '2px', color: 'var(--sub)', textTransform: 'uppercase', marginTop: 3 }}>Wallet</div>
                    </div>
                    <div style={{ paddingLeft: 8 }}>
                        <div style={{ fontFamily: 'var(--fd)', fontSize: '1.1rem', letterSpacing: '1px', color: 'var(--green)', lineHeight: 1 }}>{fmt(maxBid)}</div>
                        <div style={{ fontFamily: 'var(--fu)', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '2px', color: 'var(--sub)', textTransform: 'uppercase', marginTop: 3 }}>Max Bid</div>
                    </div>
                </div>

                {/* wallet bar */}
                <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{
                        height: '100%', borderRadius: 2,
                        width: `${walletPct}%`,
                        background: `linear-gradient(90deg, rgba(${rgb},0.5), ${colour})`,
                        transition: 'width 0.6s',
                    }} />
                </div>

                {/* players + roster btn */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontFamily: 'var(--fu)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '1px', color: 'var(--sub)' }}>
                        {team.players_bought ?? 0}<span style={{ color: 'var(--muted)' }}>/{team.max_players ?? '—'}</span> players
                    </div>
                    <button
                        onClick={onViewRoster}
                        style={{
                            background: 'none', border: `1px solid rgba(${rgb},0.3)`, cursor: 'pointer',
                            fontFamily: 'var(--fu)', fontSize: '0.58rem', fontWeight: 700,
                            letterSpacing: '2px', textTransform: 'uppercase',
                            color: 'var(--sub)', padding: '3px 8px', transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = colour; e.currentTarget.style.color = colour }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = `rgba(${rgb},0.3)`; e.currentTarget.style.color = 'var(--sub)' }}
                    >Roster</button>
                </div>
            </div>
        </div>
    )
}

// ── Mobile Team Row ─────────────────────────────────────────────────────────
function MobileTeamRow({ team, isLeading, onViewRoster, currentPlayer, players }) {
    const [imgErr, setImgErr] = useState(false)
    const colour = teamColour(team.id)
    const rgb = hexToRgb(colour)
    const walletPct = Math.min(100, Math.round((team.wallet / STARTING_WALLET) * 100))
    const maxBid = calcMaxBid(
        team,
        currentPlayer ? normaliseClass(currentPlayer.cls) : null,
        players.filter(p => p.status === 'sold' && p.sold_to_team === team.id)
    )
    return (
        <div onClick={onViewRoster} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 16px',
            background: isLeading ? `rgba(${rgb},0.08)` : 'var(--bg-card)',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            borderLeft: `4px solid ${isLeading ? colour : 'transparent'}`,
            transition: 'all 0.3s', cursor: 'pointer', position: 'relative',
        }}>
            {isLeading && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `linear-gradient(90deg, rgba(${rgb},0.06) 0%, transparent 60%)` }} />}
            <div style={{
                width: 55, height: 55, borderRadius: '10%', flexShrink: 0, overflow: 'hidden',
                border: `1.5px solid rgba(${rgb},${isLeading ? 0.7 : 0.35})`,
                boxShadow: isLeading ? `0 0 14px rgba(${rgb},0.4)` : 'none',
                background: `rgba(${rgb},0.15)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                {!imgErr ? (
                    <img src={`/images/teams/${team.id}.png`} alt={team.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={() => setImgErr(true)} />
                ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--fd)', fontSize: '1.2rem', color: colour }}>
                        {team.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                )}
            </div>
            <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{
                        fontFamily: 'var(--fd)', fontSize: '1.1rem', letterSpacing: '0.5px',
                        color: isLeading ? colour : 'var(--text)', lineHeight: 1,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{team.name}</div>
                    {isLeading && (
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            fontFamily: 'var(--fu)', fontSize: '0.5rem', fontWeight: 800,
                            letterSpacing: '2px', textTransform: 'uppercase', color: colour,
                            background: `rgba(${rgb},0.15)`, border: `1px solid rgba(${rgb},0.3)`,
                            padding: '2px 7px', borderRadius: 3, flexShrink: 0,
                        }}>
                            <div style={{ width: 4, height: 4, borderRadius: '50%', background: colour, animation: 'leadPulse 1.2s ease-in-out infinite' }} />
                            Leading
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div>
                        <span style={{ fontFamily: 'var(--fd)', fontSize: '1rem', color: 'var(--acc)', letterSpacing: '1px' }}>{fmt(team.wallet)}</span>
                        <span style={{ fontFamily: 'var(--fu)', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '1px', color: 'var(--muted)', marginLeft: 4 }}>WALLET</span>
                    </div>
                    <div style={{ width: 1, height: 14, background: 'var(--border2)' }} />
                    <div>
                        <span style={{ fontFamily: 'var(--fd)', fontSize: '1rem', color: 'var(--green)', letterSpacing: '1px' }}>{fmt(maxBid)}</span>
                        <span style={{ fontFamily: 'var(--fu)', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '1px', color: 'var(--muted)', marginLeft: 4 }}>MAX</span>
                    </div>
                    <div style={{ width: 1, height: 14, background: 'var(--border2)' }} />
                    <span style={{ fontFamily: 'var(--fu)', fontSize: '0.6rem', fontWeight: 700, color: 'var(--sub)' }}>{team.players_bought ?? 0}<span style={{ color: 'var(--muted)' }}>/{team.max_players ?? '—'}</span></span>
                </div>
                <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
                    <div style={{ height: '100%', borderRadius: 2, width: `${walletPct}%`, background: isLeading ? `linear-gradient(90deg, rgba(${rgb},0.5), ${colour})` : 'rgba(255,255,255,0.18)', transition: 'width 0.6s' }} />
                </div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.5 }}><polyline points="9 18 15 12 9 6" /></svg>
        </div>
    )
}

// ══════════════════════════════════════════════════════════════════════════════
export default function ScoreboardPage() {
    const [astate, setAstate] = useState(null)
    const [allTeams, setAllTeams] = useState([])
    const [players, setPlayers] = useState([])
    const [rosters, setRosters] = useState({})
    const [activeRoster, setActiveRoster] = useState(null)
    const isMobile = useIsMobile()
    const supabase = createClient()

    const fetchAll = useCallback(async () => {
        try {
            const [sr, pr] = await Promise.all([fetch(`${API}/auction/state`), fetch(`${API}/players/`)])
            if (sr.ok) { const d = await sr.json(); setAstate(d); setAllTeams(d.teams || []) }
            if (pr.ok) setPlayers(await pr.json())
        } catch { }
    }, [])

    const fetchRoster = useCallback(async (teamId, force = false) => {
        if (rosters[teamId] && !force) return
        try {
            const r = await fetch(`${API}/teams/${teamId}/roster`)
            if (r.ok) { const d = await r.json(); setRosters(p => ({ ...p, [teamId]: d })) }
        } catch { }
    }, [rosters])

    const fetchAllRef = useRef(fetchAll)
    useEffect(() => { fetchAllRef.current = fetchAll }, [fetchAll])

    const debounceRef = useRef(null)
    const debouncedFetchRef = useRef(null)
    debouncedFetchRef.current = () => {
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => fetchAllRef.current(), 120)
    }

    const handlePlayerChange = useCallback((payload) => {
        debouncedFetchRef.current()
        const soldTeam = payload?.new?.sold_to_team
        if (soldTeam) fetchRoster(soldTeam, true)
        else allTeams.forEach(t => fetchRoster(t.id, true))
    }, [fetchRoster, allTeams])

    useEffect(() => { fetchAll() }, [])
    useEffect(() => { allTeams.forEach(t => fetchRoster(t.id)) }, [allTeams.length])

    useEffect(() => {
        const ch = supabase.channel('scoreboard')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_state' }, () => debouncedFetchRef.current())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => debouncedFetchRef.current())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, handlePlayerChange)
            .subscribe()
        return () => supabase.removeChannel(ch)
    }, [])

    const phase = astate?.phase || 'idle'
    const isActive = phase === 'active'
    const isPaused = phase === 'paused'
    const currentPlayer = astate?.current_player
    const leadingTeam = allTeams.find(t => t.id === astate?.current_bid_team_id)
    const availableCount = players.filter(p => p.status === 'upcoming').length
    const soldCount = players.filter(p => p.status === 'sold').length
    const unsoldCount = players.filter(p => p.status === 'unsold').length
    const totalCount = players.length
    const sortedTeams = [...allTeams].sort((a, b) => b.wallet - a.wallet)
    const cc = currentPlayer ? classCfg(currentPlayer.cls) : null
    const ps = currentPlayer ? posStyle(currentPlayer.position) : null
    const leadColour = leadingTeam ? teamColour(leadingTeam.id) : '#FFD700'
    const leadRgb = leadingTeam ? hexToRgb(leadColour) : null

    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Libre+Franklin:wght@400;600;700;800;900&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        :root{
          --bg:#060810;--bg-card:#0B0E18;--bg-panel:#0F1320;
          --acc:#FFD700;--acc2:#FF6B35;--green:#4ADE80;--red:#F87171;--orange:#FB923C;
          --border:rgba(255,215,0,0.09);--border2:rgba(255,255,255,0.07);
          --text:#EEF2FF;--sub:#9CA3AF;--muted:#6B7280;
          --fd:'Bebas Neue',sans-serif;--fu:'Libre Franklin',sans-serif;
        }
        html,body{height:100%;background:var(--bg);color:var(--text)}
        body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;
          background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.004) 3px,rgba(255,255,255,0.004) 6px)}
        ::-webkit-scrollbar{width:0;height:0}
        .court-bg{position:fixed;inset:0;pointer-events:none;z-index:0;overflow:hidden}

        @keyframes pulse    {0%,100%{box-shadow:0 0 0 0 rgba(74,222,128,.5)}70%{box-shadow:0 0 0 8px rgba(74,222,128,0)}}
        @keyframes leadPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(1.6)}}
        @keyframes bidIn    {from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
        @keyframes cardIn   {from{opacity:0;transform:scale(0.99)}to{opacity:1;transform:scale(1)}}

        /* page: header | player zone | team strip | footer */
        .page{
          position:relative;z-index:1;height:100vh;
          display:grid;
          grid-template-rows:125px 1fr 180px 58px;
          overflow:hidden;
        }

        /* ── HEADER ── */
        .hdr{display:flex;align-items:center;justify-content:space-between;padding:0 24px;border-bottom:1px solid var(--border);background:rgba(6,8,16,0.98)}
        .logo-wrap{display:flex;align-items:center;gap:14px;padding:8px 0}
        .logo-img{width:95px;height:95px;border-radius:50%;border:1.5px solid rgba(255,215,0,0.3);object-fit:cover}
        .logo-name{font-family:var(--fd);font-size:2.2rem;letter-spacing:2px;color:var(--text);line-height:1}
        .logo-sub{font-family:var(--fu);font-size:0.68rem;font-weight:700;letter-spacing:4px;color:var(--acc);text-transform:uppercase;margin-top:2px}
        .phase-pill{display:flex;align-items:center;gap:6px;padding:5px 14px;border:1px solid}
        .ph-dot{width:6px;height:6px;border-radius:50%}
        .ph-txt{font-family:var(--fu);font-size:0.68rem;font-weight:700;letter-spacing:3px;text-transform:uppercase}
        .hdr-link{font-family:var(--fu);font-size:0.62rem;font-weight:700;letter-spacing:3px;color:var(--sub);text-decoration:none;text-transform:uppercase;transition:color 0.15s}
        .hdr-link:hover{color:var(--acc)}

        /* ── PLAYER ZONE ── */
        .player-zone{
          display:grid;
          grid-template-columns:38% 62%;
          min-height:0;overflow:hidden;
          border-bottom:1px solid var(--border2);
          animation:cardIn 0.4s ease;
        }

        /* photo half */
        .photo-half{
          position:relative;
          background:var(--bg-card);
          display:flex;align-items:center;
          padding:14px 0 14px 14px;
          overflow:hidden;
        }
        .photo-rounded{
          position:relative;overflow:hidden;
          border-radius:14px;
          flex:1;
          max-height:100%;
          border:3px solid transparent;
          transition:border-color 0.4s, box-shadow 0.4s;
        }
        .player-img{
          width:100%;height:100%;
          object-fit:cover;object-position:center 15%;
          display:block;
          border-radius:11px;
          max-height:100%;
        }
        /* right-edge fade */
        .photo-rounded::after{
          content:'';position:absolute;inset:0;
          background:linear-gradient(90deg,transparent 55%,rgba(6,8,16,0.75) 100%);
          pointer-events:none;
          border-radius:11px;
        }
        .otb-tag{
          position:absolute;top:26px;left:26px;z-index:2;
          font-family:var(--fu);font-size:0.72rem;font-weight:800;
          letter-spacing:4px;text-transform:uppercase;color:var(--green);
          background:rgba(6,8,16,0.82);padding:5px 13px;
          border:1px solid rgba(74,222,128,0.4);
          border-radius:4px;
        }

        /* details half */
        .details-half{
          display:flex;flex-direction:column;justify-content:center;
          padding:28px 36px 24px 28px;
          position:relative;overflow:hidden;
          background:var(--bg-card);
        }
        .details-half::before{
          content:'';position:absolute;
          left:0;top:12%;bottom:12%;
          width:4px;border-radius:2px;
        }
        .badge-row{display:flex;align-items:center;gap:8px;margin-bottom:12px}
        .p-badge{
          font-family:var(--fu);font-size:0.75rem;font-weight:800;
          letter-spacing:2px;text-transform:uppercase;
          padding:5px 16px;
          display:inline-flex;align-items:center;justify-content:center;
        }
        .p-name{
          font-family:var(--fd);
          font-size:clamp(2.4rem,3.8vw,4.2rem);
          line-height:0.9;letter-spacing:1.5px;
          color:var(--text);
          margin-bottom:14px;
        }
        .chip-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}
        .p-chip{
          font-family:var(--fu);font-size:0.68rem;font-weight:600;
          letter-spacing:2px;text-transform:uppercase;
          padding:4px 12px;border:1px solid var(--border2);color:var(--sub);
        }
        .base-row{
          display:flex;align-items:baseline;gap:8px;
          padding-top:14px;border-top:1px solid var(--border2);
          margin-bottom:22px;
        }
        .base-lbl{font-family:var(--fu);font-size:0.72rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--sub)}
        .base-val{font-family:var(--fd);font-size:1.6rem;color:var(--sub)}

        /* bid block inside details half */
        .bid-block{
          padding:16px 20px;
          background:var(--bg-panel);
          border:1px solid var(--border2);
          display:flex;align-items:center;justify-content:space-between;gap:20px;
        }
        .bid-lbl{font-family:var(--fu);font-size:0.72rem;font-weight:800;letter-spacing:5px;text-transform:uppercase;color:var(--sub);margin-bottom:3px}
        .bid-num{
          font-family:var(--fd);
          font-size:clamp(2.6rem,4.5vw,4.8rem);
          line-height:0.9;letter-spacing:3px;color:var(--acc);
          animation:bidIn 0.3s ease;
        }
        .lead-lbl{
          font-family:var(--fu);font-size:0.68rem;font-weight:800;
          letter-spacing:4px;text-transform:uppercase;
          display:flex;align-items:center;justify-content:flex-end;gap:6px;
          color:var(--sub);margin-bottom:5px;
        }
        .lead-dot{width:8px;height:8px;border-radius:50%;animation:leadPulse 1.2s ease-in-out infinite;flex-shrink:0}
        .lead-name{
          font-family:var(--fd);
          font-size:clamp(1.5rem,2.5vw,2.2rem);
          letter-spacing:1px;line-height:1;
          text-align:right;
        }

        /* idle */
        .idle-zone{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:40px;text-align:center}
        .idle-img{opacity:0.05}
        .idle-title{font-family:var(--fd);font-size:clamp(3rem,5vw,5.5rem);letter-spacing:4px;color:var(--muted);white-space:pre-line;line-height:1}
        .idle-sub{font-family:var(--fu);font-size:0.8rem;font-weight:700;letter-spacing:4px;color:var(--muted);text-transform:uppercase}

        /* ── TEAM STRIP ── */
        .team-strip{
          display:flex;
          border-top:1px solid var(--border);
          overflow:hidden;
        }

        /* ── FOOTER ── */
        .footer{
          display:flex;align-items:stretch;
          border-top:1px solid var(--border);
          background:rgba(6,8,16,0.98);
        }
        .f-stat{
          flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
          gap:2px;padding:6px 0;
          border-right:1px solid var(--border2);
        }
        .f-stat:last-child{border-right:none}
        .f-val{font-family:var(--fd);font-size:1.8rem;letter-spacing:2px;line-height:1}
        .f-lbl{font-family:var(--fu);font-size:0.65rem;font-weight:800;letter-spacing:4px;text-transform:uppercase;color:var(--sub)}

        /* ── MOBILE ── */
        .mob-page{display:flex;flex-direction:column;min-height:100dvh;padding-bottom:52px}
        .mob-hdr{position:sticky;top:0;z-index:50;display:flex;align-items:center;justify-content:space-between;padding:0 16px;height:48px;background:rgba(6,8,16,0.97);border-bottom:1px solid var(--border);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
        .mob-player{animation:fadeUp 0.35s ease}
        .mob-photo-wrap{position:relative;width:100%;aspect-ratio:4/3;background:var(--bg-card);overflow:hidden}
        .mob-photo{width:100%;height:100%;object-fit:cover;object-position:center 15%;display:block}
        .mob-photo-overlay{position:absolute;inset:0;background:linear-gradient(180deg,transparent 40%,rgba(6,8,16,0.85) 100%);pointer-events:none}
        .mob-otb{position:absolute;top:12px;left:12px;font-family:var(--fu);font-size:0.62rem;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:var(--green);background:rgba(6,8,16,0.82);padding:4px 10px;border:1px solid rgba(74,222,128,0.4);border-radius:4px}
        .mob-player-info{position:absolute;bottom:0;left:0;right:0;padding:0 16px 14px}
        .mob-bid{margin:0 12px;padding:14px 16px;background:var(--bg-panel);border:1px solid var(--border2);border-radius:8px;transform:translateY(-20px);display:flex;align-items:center;justify-content:space-between;gap:16px;position:relative;z-index:2}
        .mob-section{font-family:var(--fu);font-size:0.6rem;font-weight:800;letter-spacing:4px;text-transform:uppercase;color:var(--muted);padding:12px 16px 8px}
        .mob-idle{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:60px 24px;text-align:center;min-height:50dvh}
        .mob-footer{position:fixed;bottom:0;left:0;right:0;z-index:50;display:flex;align-items:stretch;height:52px;background:rgba(6,8,16,0.97);border-top:1px solid var(--border);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
        .mob-f-stat{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;border-right:1px solid var(--border2)}
        .mob-f-stat:last-child{border-right:none}
        .mob-f-val{font-family:var(--fd);font-size:1.4rem;letter-spacing:1px;line-height:1}
        .mob-f-lbl{font-family:var(--fu);font-size:0.5rem;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:var(--sub)}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

            {isMobile ? (
                /* ═══ MOBILE LAYOUT ═══ */
                <>
                    <div className="mob-page">
                        <header className="mob-hdr" style={{ height: '56px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <img src="/images/tournament-logo.png" alt="" style={{ width: 38, height: 38, borderRadius: '50%', border: '1px solid rgba(255,215,0,0.3)', objectFit: 'cover' }} onError={e => e.target.style.display = 'none'} />
                                <div style={{ fontFamily: 'var(--fd)', fontSize: '1.3rem', letterSpacing: '2px', color: 'var(--text)', paddingTop: 2 }}>TKM VOLLEYBALL</div>
                                <div style={{ fontFamily: 'var(--fu)', fontSize: '0.48rem', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--acc)', padding: '2px 6px', border: '1px solid rgba(255,215,0,0.25)', background: 'rgba(255,215,0,0.06)' }}>LIVE</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', border: `1px solid ${isActive ? 'rgba(74,222,128,0.3)' : isPaused ? 'rgba(251,146,60,0.3)' : 'var(--border2)'}`, background: isActive ? 'rgba(74,222,128,0.06)' : 'transparent', borderRadius: 4 }}>
                                <div style={{ width: 5, height: 5, borderRadius: '50%', background: isActive ? 'var(--green)' : isPaused ? '#FB923C' : 'var(--muted)', animation: isActive ? 'pulse 2s infinite' : 'none' }} />
                                <span style={{ fontFamily: 'var(--fu)', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: isActive ? 'var(--green)' : isPaused ? '#FB923C' : 'var(--muted)' }}>
                                    {isActive ? 'Live' : isPaused ? 'Paused' : 'Standby'}
                                </span>
                            </div>
                        </header>

                        {currentPlayer ? (
                            <div className="mob-player" key={currentPlayer.id}>
                                <div className="mob-photo-wrap" style={{ borderBottom: `3px solid ${cc?.color || 'rgba(255,255,255,0.1)'}`, boxShadow: cc ? `inset 0 -2px 20px ${cc.glow}` : 'none' }}>
                                    <img className="mob-photo" src={currentPlayer.photo_url || `/images/players/${currentPlayer.id}.jpg`} alt={currentPlayer.name}
                                        onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
                                    <div style={{ display: 'none', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', background: 'var(--bg-panel)' }}>
                                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,215,0,0.06)" strokeWidth="1"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                                    </div>
                                    <div className="mob-photo-overlay" />
                                    <div className="mob-otb">On the Block</div>
                                    <div className="mob-player-info">
                                        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                                            {cc && <span style={{ fontFamily: 'var(--fu)', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', padding: '3px 10px', background: cc.bg, border: `1px solid ${cc.border}`, color: cc.color, boxShadow: `0 0 10px ${cc.glow}` }}>{currentPlayer.cls}</span>}
                                            {ps && <span style={{ fontFamily: 'var(--fu)', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', padding: '3px 10px', background: ps.bg, border: `1px solid ${ps.border}`, color: ps.text }}>{currentPlayer.position}</span>}
                                        </div>
                                        <div style={{ fontFamily: 'var(--fd)', fontSize: '2.4rem', lineHeight: 0.9, letterSpacing: '1px', color: 'var(--text)' }}>{currentPlayer.name}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                                            {currentPlayer.college && <span style={{ fontFamily: 'var(--fu)', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '1px', color: 'var(--sub)' }}>{currentPlayer.college}</span>}
                                            <span style={{ fontFamily: 'var(--fu)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '1px', color: 'var(--muted)' }}>Base {fmtFull(currentPlayer.base_price)}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="mob-bid" style={{ borderColor: leadRgb ? `rgba(${leadRgb},0.25)` : 'var(--border2)', background: leadRgb ? `linear-gradient(135deg, var(--bg-panel) 40%, rgba(${leadRgb},0.08) 100%)` : 'var(--bg-panel)' }}>
                                    <div>
                                        <div style={{ fontFamily: 'var(--fu)', fontSize: '0.58rem', fontWeight: 800, letterSpacing: '4px', textTransform: 'uppercase', color: 'var(--sub)', marginBottom: 2 }}>Current Bid</div>
                                        <div key={astate?.current_bid} style={{ fontFamily: 'var(--fd)', fontSize: '2.6rem', lineHeight: 0.9, letterSpacing: '2px', color: 'var(--acc)', animation: 'bidIn 0.3s ease' }}>
                                            {astate?.current_bid ? fmtFull(astate.current_bid) : fmtFull(currentPlayer.base_price)}
                                        </div>
                                    </div>
                                    {leadingTeam ? (
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginBottom: 4, fontFamily: 'var(--fu)', fontSize: '0.55rem', fontWeight: 800, letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--sub)' }}>
                                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: leadColour, animation: 'leadPulse 1.2s ease-in-out infinite' }} />
                                                Leading
                                            </div>
                                            <div style={{ fontFamily: 'var(--fd)', fontSize: '1.5rem', letterSpacing: '1px', color: leadColour, lineHeight: 1 }}>{leadingTeam.name}</div>
                                        </div>
                                    ) : (
                                        <div style={{ fontFamily: 'var(--fu)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '2px', color: 'var(--muted)' }}>No bids yet</div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="mob-idle">
                                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="rgba(255,215,0,0.08)" strokeWidth="1"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                <div style={{ fontFamily: 'var(--fd)', fontSize: '2.8rem', letterSpacing: '3px', color: 'var(--muted)', lineHeight: 1 }}>{isPaused ? 'PAUSED' : 'STANDING BY'}</div>
                                <div style={{ fontFamily: 'var(--fu)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '3px', color: 'var(--muted)', textTransform: 'uppercase' }}>{isPaused ? 'Auctioneer will resume shortly' : 'Next player coming up'}</div>
                            </div>
                        )}

                        <div className="mob-section">Teams</div>
                        <div>
                            {sortedTeams.map(team => (
                                <MobileTeamRow key={team.id} team={team} isLeading={team.id === astate?.current_bid_team_id}
                                    onViewRoster={() => setActiveRoster({ team })} currentPlayer={currentPlayer} players={players} />
                            ))}
                        </div>
                    </div>
                    <footer className="mob-footer">
                        <div className="mob-f-stat"><div className="mob-f-val">{availableCount}</div><div className="mob-f-lbl">Avail</div></div>
                        <div className="mob-f-stat"><div className="mob-f-val" style={{ color: 'var(--acc)' }}>{soldCount}</div><div className="mob-f-lbl">Sold</div></div>
                        <div className="mob-f-stat"><div className="mob-f-val" style={{ color: 'var(--red)' }}>{unsoldCount}</div><div className="mob-f-lbl">Unsold</div></div>
                        <div className="mob-f-stat"><div className="mob-f-val">{totalCount}</div><div className="mob-f-lbl">Total</div></div>
                    </footer>
                </>
            ) : (
                /* ═══ DESKTOP LAYOUT ═══ */
                <>
                    {/* court lines bg */}
                    <div className="court-bg">
                        <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
                            <defs>
                                <linearGradient id="gf" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#FFD700" stopOpacity=".03" />
                                    <stop offset="100%" stopColor="#FFD700" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <rect x="100" y="70" width="1240" height="760" fill="none" stroke="url(#gf)" strokeWidth="1" />
                            <line x1="720" y1="70" x2="720" y2="830" stroke="url(#gf)" strokeWidth="1" />
                            <line x1="100" y1="300" x2="1340" y2="300" stroke="url(#gf)" strokeWidth="0.8" />
                            <line x1="100" y1="600" x2="1340" y2="600" stroke="url(#gf)" strokeWidth="0.8" />
                        </svg>
                    </div>

                    <div className="page" style={{ overflow: 'hidden' }}>
                        <header className="hdr">
                            <div className="logo-wrap">
                                <img className="logo-img" src="/images/tournament-logo.png" alt="" onError={e => e.target.style.display = 'none'} />
                                <div>
                                    <div className="logo-name">TKM VOLLEYBALL</div>
                                    <div className="logo-sub">Live Auction</div>
                                </div>
                            </div>
                            <div className="phase-pill" style={{
                                borderColor: isActive ? 'rgba(74,222,128,0.35)' : isPaused ? 'rgba(251,146,60,0.35)' : 'var(--border2)',
                                background: isActive ? 'rgba(74,222,128,0.06)' : 'transparent',
                            }}>
                                <div className="ph-dot" style={{ background: isActive ? 'var(--green)' : isPaused ? '#FB923C' : 'var(--muted)', animation: isActive ? 'pulse 2s infinite' : 'none' }} />
                                <span className="ph-txt" style={{ color: isActive ? 'var(--green)' : isPaused ? '#FB923C' : 'var(--muted)' }}>
                                    {isActive ? 'Auction Live' : isPaused ? 'Paused' : 'Standby'}
                                </span>
                            </div>
                            <a href="/admin" className="hdr-link">Auctioneer</a>
                        </header>

                        {currentPlayer ? (
                            <div className="player-zone" key={currentPlayer.id}>
                                <div className="photo-half" style={{ background: 'var(--bg-card)' }}>
                                    <div className="photo-rounded" style={{ borderColor: cc?.color || 'rgba(255,255,255,0.1)', boxShadow: cc ? `0 0 22px ${cc.glow}` : 'none' }}>
                                        <img className="player-img" src={currentPlayer.photo_url || `/images/players/${currentPlayer.id}.jpg`} alt={currentPlayer.name}
                                            onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
                                        <div style={{ display: 'none', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', background: 'var(--bg-panel)', borderRadius: 11 }}>
                                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(255,215,0,0.06)" strokeWidth="1"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                                        </div>
                                        <div className="otb-tag">On the Block</div>
                                    </div>
                                </div>
                                <div className="details-half" style={{ background: cc ? `linear-gradient(160deg, var(--bg-card) 35%, ${cc.bg} 100%)` : 'var(--bg-card)' }}>
                                    <style>{`.details-half::before { background: ${cc?.color || 'transparent'}; }`}</style>
                                    <div className="badge-row">
                                        {cc && <span className="p-badge" style={{ background: cc.bg, border: `1px solid ${cc.border}`, color: cc.color, boxShadow: `0 0 14px ${cc.glow}` }}>{currentPlayer.cls}</span>}
                                        {ps && <span className="p-badge" style={{ background: ps.bg, border: `1px solid ${ps.border}`, color: ps.text }}>{currentPlayer.position}</span>}
                                    </div>
                                    <div className="p-name">{currentPlayer.name}</div>
                                    {(currentPlayer.college || currentPlayer.height) && (
                                        <div className="chip-row">
                                            {currentPlayer.college && <span className="p-chip">{currentPlayer.college}</span>}
                                            {currentPlayer.height && <span className="p-chip">{currentPlayer.height}</span>}
                                        </div>
                                    )}
                                    <div className="base-row">
                                        <span className="base-lbl">Base Price</span>
                                        <span className="base-val">{fmtFull(currentPlayer.base_price)}</span>
                                    </div>
                                    <div className="bid-block" style={{ borderColor: leadRgb ? `rgba(${leadRgb},0.25)` : 'var(--border2)', background: leadRgb ? `linear-gradient(135deg, var(--bg-panel) 40%, rgba(${leadRgb},0.1) 100%)` : 'var(--bg-panel)' }}>
                                        <div>
                                            <div className="bid-lbl">Current Bid</div>
                                            <div className="bid-num" key={astate?.current_bid}>{astate?.current_bid ? fmtFull(astate.current_bid) : fmtFull(currentPlayer.base_price)}</div>
                                        </div>
                                        {leadingTeam ? (
                                            <div style={{ textAlign: 'right' }}>
                                                <div className="lead-lbl"><div className="lead-dot" style={{ background: leadColour }} />Leading</div>
                                                <div className="lead-name" style={{ color: leadColour }}>{leadingTeam.name}</div>
                                            </div>
                                        ) : (
                                            <div style={{ fontFamily: 'var(--fu)', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '2px', color: 'var(--muted)' }}>No bids yet</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="idle-zone">
                                <img src="/images/court-graphic.png" alt="" width="130" className="idle-img" onError={e => e.target.style.display = 'none'} />
                                <div className="idle-title">{isPaused ? 'AUCTION\nPAUSED' : 'STANDING\nBY'}</div>
                                <div className="idle-sub">{isPaused ? 'Auctioneer will resume shortly' : 'Next player coming up'}</div>
                            </div>
                        )}

                        <div className="team-strip">
                            {sortedTeams.map(team => (
                                <TeamCard key={team.id} team={team} isLeading={team.id === astate?.current_bid_team_id}
                                    onViewRoster={() => setActiveRoster({ team })} currentPlayer={currentPlayer} players={players} />
                            ))}
                        </div>

                        <footer className="footer">
                            <div className="f-stat"><div className="f-val">{availableCount}</div><div className="f-lbl">Available</div></div>
                            <div className="f-stat"><div className="f-val" style={{ color: 'var(--acc)' }}>{soldCount}</div><div className="f-lbl">Sold</div></div>
                            <div className="f-stat"><div className="f-val" style={{ color: 'var(--red)' }}>{unsoldCount}</div><div className="f-lbl">Unsold</div></div>
                            <div className="f-stat"><div className="f-val">{totalCount}</div><div className="f-lbl">Total Players</div></div>
                        </footer>
                    </div>
                </>
            )}

            {activeRoster && (
                <RosterModal
                    team={activeRoster.team}
                    roster={rosters[activeRoster.team.id] || []}
                    onClose={() => setActiveRoster(null)}
                />
            )}
        </>
    )
}