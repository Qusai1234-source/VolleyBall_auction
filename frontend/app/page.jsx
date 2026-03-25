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
const supabase = createClient()

export default function ScoreboardPage() {
    const [astate, setAstate] = useState(null)
    const [allTeams, setAllTeams] = useState([])
    const [players, setPlayers] = useState([])
    const [rosters, setRosters] = useState({})
    const [activeRoster, setActiveRoster] = useState(null)
    const isMobile = useIsMobile()

    // ── sold animation state ─────────────────────────────────────────────
    const [soldAnim, setSoldAnim] = useState(null)     // { player, team, leaving } | null
    const [unsoldAnim, setUnsoldAnim] = useState(null)  // { player, leaving } | null
    const soldAnimRef = useRef(null)
    const soldLeaveRef = useRef(null)
    const unsoldAnimRef = useRef(null)
    const unsoldLeaveRef = useRef(null)
    const gavelAudioRef = useRef(null)
    const unsoldAudioRef = useRef(null)

    const playGavel = useCallback(() => {
        try {
            if (!gavelAudioRef.current) {
                gavelAudioRef.current = new Audio('/sounds/gavel.wav')
                gavelAudioRef.current.volume = 0.85
            }
            gavelAudioRef.current.currentTime = 0
            gavelAudioRef.current.play().catch(() => { })
        } catch (e) { }
    }, [])

    const playUnsold = useCallback(() => {
        try {
            if (!unsoldAudioRef.current) {
                const audio = new Audio('/sounds/unsold.mp3')
                audio.volume = 0.75
                audio.preload = 'auto'
                unsoldAudioRef.current = audio
            }
            unsoldAudioRef.current.currentTime = 0
            const playPromise = unsoldAudioRef.current.play()
            if (playPromise !== undefined) {
                playPromise.catch(err => {
                    console.warn("[Audio] Unsold sound failed to play:", err)
                })
            }
        } catch (e) {
            console.error("[Audio] Unsold sound error:", e)
        }
    }, [])

    const triggerSoldAnim = useCallback((playerRow, teamRow) => {
        clearTimeout(soldAnimRef.current)
        clearTimeout(soldLeaveRef.current)
        setSoldAnim({ player: playerRow, team: teamRow, leaving: false })
        playGavel()
        soldAnimRef.current = setTimeout(() => {
            setSoldAnim(prev => prev ? { ...prev, leaving: true } : null)
            soldLeaveRef.current = setTimeout(() => setSoldAnim(null), 400)
        }, 4200)
    }, [playGavel])

    const triggerUnsoldAnim = useCallback((playerRow) => {
        clearTimeout(unsoldAnimRef.current)
        clearTimeout(unsoldLeaveRef.current)
        setUnsoldAnim({ player: playerRow, leaving: false })
        playUnsold()
        unsoldAnimRef.current = setTimeout(() => {
            setUnsoldAnim(prev => prev ? { ...prev, leaving: true } : null)
            unsoldLeaveRef.current = setTimeout(() => setUnsoldAnim(null), 400)
        }, 3500)
    }, [playUnsold])

    // ── full load via FastAPI (initial only) ──────────────────────────────
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

    // ── fast direct Supabase reads — bypasses FastAPI entirely (~30-80ms) ─
    const fastRefreshAuction = useCallback(async () => {
        try {
            const { data: stateRow } = await supabase
                .from('auction_state').select('*').eq('id', 1).single()
            if (!stateRow) return

            let currentPlayer = null
            if (stateRow.current_player_id) {
                const { data: p } = await supabase
                    .from('players').select('*').eq('id', stateRow.current_player_id).single()
                if (p) { p.cls = p.class; p.sold_price = p.sold_amount; currentPlayer = p }
            }

            const { data: teamsRaw } = await supabase.from('teams').select('*').order('name')
            const teams = (teamsRaw || []).map(t => ({
                ...t, players_bought: t.roster_count ?? 0,
                max_players: t.max_slots ?? 0, max_wallet: 200000,
            }))

            let phase = stateRow.phase
            if (stateRow.is_paused && phase === 'active') phase = 'paused'

            setAstate({
                ...stateRow, phase, current_player: currentPlayer,
                current_bid_team_id: stateRow.current_bid_team, teams, action_log: []
            })
            setAllTeams(teams)
        } catch (err) { console.error('Scoreboard fast refresh error:', err) }
    }, [])

    const fastRefreshPlayers = useCallback(async () => {
        try {
            const { data } = await supabase.from('players').select('*')
            setPlayers((data || []).map(p => ({ ...p, cls: p.class, sold_price: p.sold_amount })))
        } catch (err) { console.error('Scoreboard fast players error:', err) }
    }, [])

    const fastRefreshRoster = useCallback(async (teamId) => {
        try {
            const { data } = await supabase.from('players').select('*')
                .eq('sold_to_team', teamId).eq('status', 'sold')
            const aliased = (data || []).map(p => ({ ...p, cls: p.class, sold_price: p.sold_amount }))
            setRosters(prev => ({ ...prev, [teamId]: aliased }))
        } catch (err) { console.error('Scoreboard fast roster error:', err) }
    }, [])

    useEffect(() => { fetchAll() }, [])
    useEffect(() => { allTeams.forEach(t => fetchRoster(t.id)) }, [allTeams.length])

    useEffect(() => {
        const ch = supabase.channel('scoreboard-rt')
            // bid placed → auction_state updated → read directly
            .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_state' },
                () => fastRefreshAuction())
            // wallet/roster count changed
            .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' },
                () => fastRefreshAuction())
            // player sold/pulled/unsold — also check for sold animation trigger
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players' },
                async (payload) => {
                    const row = payload?.new
                    fastRefreshAuction()
                    fastRefreshPlayers()
                    // trigger sold animation when a player just became sold
                    if (row?.status === 'sold' && row?.sold_to_team) {
                        fastRefreshRoster(row.sold_to_team)
                        // fetch team name for the animation banner
                        const { data: teamRow } = await supabase
                            .from('teams').select('*').eq('id', row.sold_to_team).single()
                        const playerRow = { ...row, cls: row.class, sold_price: row.sold_amount }
                        if (teamRow) triggerSoldAnim(playerRow, teamRow)
                    } else if (row?.status === 'unsold') {
                        // trigger unsold banner
                        const playerRow = { ...row, cls: row.class, sold_price: row.sold_amount }
                        triggerUnsoldAnim(playerRow)
                        Object.keys(rosters).forEach(tid => fastRefreshRoster(tid))
                    } else {
                        Object.keys(rosters).forEach(tid => fastRefreshRoster(tid))
                    }
                })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players' },
                () => fastRefreshPlayers())
            .subscribe()
        return () => supabase.removeChannel(ch)
    }, [fastRefreshAuction, fastRefreshPlayers, fastRefreshRoster, triggerSoldAnim, triggerUnsoldAnim, rosters])

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

        @keyframes soldIn   {from{opacity:0;transform:translateY(-100%)}to{opacity:1;transform:translateY(0)}}
        @keyframes soldOut  {from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-100%)}}
        @keyframes soldStamp{0%{opacity:0;transform:scale(2.4) rotate(-14deg)}55%{opacity:1;transform:scale(0.9) rotate(-6deg)}75%{transform:scale(1.06) rotate(-6deg)}100%{opacity:1;transform:scale(1) rotate(-6deg)}}
        @keyframes soldPriceIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes soldPhotoIn{from{opacity:0;transform:scale(1.06)}to{opacity:1;transform:scale(1)}}
        @keyframes soldParticle{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(0);opacity:0}}
        @keyframes soldSweep{from{transform:scaleX(0)}to{transform:scaleX(1)}}
        @keyframes bannerScan{0%{transform:translateY(-100%)}100%{transform:translateY(400%)}}

        .sold-banner{
          position:fixed;top:0;left:0;right:0;z-index:500;
          display:grid;grid-template-columns:120px 1fr auto auto;
          align-items:stretch;gap:0;
          background:linear-gradient(180deg,#0a0d1a 0%,#060810 100%);
          border-bottom:3px solid;
          animation:soldIn 0.45s cubic-bezier(0.16,1,0.3,1);
          overflow:hidden;
          box-shadow:0 12px 60px rgba(0,0,0,0.9);
        }
        .sold-banner.leaving{animation:soldOut 0.35s ease-in forwards}

        .unsold-banner{
          position:fixed;top:0;left:0;right:0;z-index:500;
          display:grid;grid-template-columns:120px 1fr auto;
          align-items:stretch;gap:0;
          background:linear-gradient(180deg,#0a0d1a 0%,#060810 100%);
          border-bottom:3px solid rgba(248,113,113,0.7);
          animation:soldIn 0.45s cubic-bezier(0.16,1,0.3,1);
          overflow:hidden;
          box-shadow:0 12px 60px rgba(0,0,0,0.9);
        }
        .unsold-banner.leaving{animation:soldOut 0.35s ease-in forwards}

        /* scanline sweep across entire banner */
        .banner-scanline{
          position:absolute;top:0;left:0;right:0;bottom:0;
          pointer-events:none;z-index:10;overflow:hidden;
        }
        .banner-scanline::after{
          content:'';
          position:absolute;left:0;right:0;
          height:25%;
          background:linear-gradient(180deg,transparent,rgba(255,255,255,0.025),transparent);
          animation:bannerScan 2.5s linear 0.5s infinite;
        }

        .sb-photo{width:120px;height:120px;flex-shrink:0;overflow:hidden;position:relative;border-right:1px solid rgba(255,255,255,0.06)}
        .sb-photo img{width:100%;height:100%;object-fit:cover;object-position:center 15%;animation:soldPhotoIn 0.5s ease}
        .sb-photo-fallback{width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#0F1320}
        .sb-photo-stamp{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;background:rgba(6,8,16,0.5)}
        .sb-photo-stamp-inner{font-family:var(--fd);font-size:1.9rem;letter-spacing:4px;padding:5px 10px;border:3px solid;line-height:1;animation:soldStamp 0.55s 1.5s cubic-bezier(0.16,1,0.3,1) both}

        .sb-player{padding:16px 22px;min-width:0;display:flex;flex-direction:column;justify-content:center}
        .sb-eyebrow{font-family:var(--fu);font-size:0.52rem;font-weight:800;letter-spacing:5px;text-transform:uppercase;margin-bottom:5px;display:flex;align-items:center;gap:8px}
        .sb-eyebrow.sold-lbl{color:#4ADE80}
        .sb-eyebrow.unsold-lbl{color:#F87171}
        .sb-eye-line{flex:1;height:1px;transform-origin:left;animation:soldSweep 0.6s 0.2s ease forwards;transform:scaleX(0)}
        .sb-eye-line.sold-lbl{background:rgba(74,222,128,0.2)}
        .sb-eye-line.unsold-lbl{background:rgba(248,113,113,0.2)}
        .sb-name{font-family:var(--fd);font-size:3rem;letter-spacing:1px;line-height:1;color:#EEF2FF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .sb-badges{display:flex;gap:6px;margin-top:7px;flex-wrap:wrap}
        .sb-badge{font-family:var(--fu);font-size:0.55rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:3px 9px;border:1px solid}

        .sb-team{padding:16px 26px;border-left:1px solid rgba(255,255,255,0.06);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;flex-shrink:0;min-width:160px}
        .sb-to-lbl{font-family:var(--fu);font-size:0.52rem;font-weight:800;letter-spacing:4px;text-transform:uppercase;color:var(--muted)}
        .sb-team-logo{width:44px;height:44px;border-radius:8px;object-fit:cover;border:1.5px solid;display:block}
        .sb-team-name{font-family:var(--fd);font-size:1.9rem;letter-spacing:1px;line-height:1;text-align:center}

        .sb-price{padding:16px 30px;border-left:1px solid rgba(255,255,255,0.06);display:flex;flex-direction:column;align-items:flex-end;justify-content:center;flex-shrink:0;position:relative}
        .sb-price-lbl{font-family:var(--fu);font-size:0.52rem;font-weight:800;letter-spacing:4px;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
        .sb-price-val{font-family:var(--fd);font-size:3.2rem;letter-spacing:2px;line-height:1;animation:soldPriceIn 0.4s 0.15s ease both}

        .sb-unsold-note{padding:16px 34px;border-left:1px solid rgba(248,113,113,0.15);display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0}
        .sb-unsold-note-lbl{font-family:var(--fu);font-size:0.52rem;font-weight:800;letter-spacing:4px;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
        .sb-unsold-note-val{font-family:var(--fd);font-size:2.2rem;letter-spacing:1px;color:#F87171;line-height:1;animation:soldPriceIn 0.4s 0.15s ease both}

        .sb-particles{position:absolute;inset:0;pointer-events:none;overflow:visible}
        .sb-p{position:absolute;border-radius:50%;animation:soldParticle 0.9s ease-out both}

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
        .idle-img{opacity:0.17}
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
        .mob-page{display:flex;flex-direction:column;min-height:100dvh;padding-bottom:76px;background:var(--bg);scroll-behavior: smooth;}
        .mob-hdr{position:sticky;top:0;z-index:50;display:flex;align-items:center;justify-content:space-between;padding:0 16px;height:52px;background:rgba(6,8,16,0.97);border-bottom:1px solid var(--border);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
        .mob-player{animation:fadeUp 0.35s ease}

        /* photo: taller on phones for better player visibility */
        .mob-photo-wrap{position:relative;width:100%;height:72vw;min-height:260px;max-height:460px;background:var(--bg-card);overflow:hidden}
        .mob-photo{width:100%;height:100%;object-fit:cover;object-position:center top;display:block}
        .mob-photo-overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(6,8,16,0.1) 30%,rgba(6,8,16,0.92) 100%);pointer-events:none}
        .mob-otb{position:absolute;top:10px;left:10px;font-family:var(--fu);font-size:0.58rem;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:var(--green);background:rgba(6,8,16,0.85);padding:4px 10px;border:1px solid rgba(74,222,128,0.4)}
        .mob-player-info{position:absolute;bottom:0;left:0;right:0;padding:0 14px 12px}
        .mob-player-name{font-family:var(--fd);font-size:clamp(2rem,7vw,2.8rem);line-height:0.92;letter-spacing:1px;color:#EEF2FF}
        .mob-player-meta{display:flex;align-items:center;gap:8px;margin-top:5px;flex-wrap:wrap}
        .mob-meta-chip{font-family:var(--fu);font-size:0.58rem;font-weight:700;letter-spacing:1.5px;color:var(--sub)}

        /* bid card: flat, no radius, no overlap */
        .mob-bid{
          margin:0;padding:14px 16px;
          background:var(--bg-card);
          border-bottom:1px solid var(--border2);
          display:flex;align-items:center;justify-content:space-between;gap:12px;
        }
        .mob-bid-divider{width:1px;height:36px;background:var(--border2);flex-shrink:0}

        /* leading team highlight strip */
        .mob-lead-strip{
          padding:9px 16px;
          display:flex;align-items:center;justify-content:space-between;
          border-bottom:1px solid var(--border2);
        }

        .mob-section{
          display:flex;align-items:center;gap:10px;
          font-family:var(--fu);font-size:0.58rem;font-weight:800;letter-spacing:4px;text-transform:uppercase;
          color:var(--muted);padding:12px 16px 8px;
        }
        .mob-section-line{flex:1;height:1px;background:var(--border2)}
        .mob-idle{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:60px 24px;text-align:center;min-height:48dvh}
        .mob-footer{position:fixed;bottom:0;left:0;right:0;z-index:50;display:flex;align-items:stretch;height:40px;background:rgba(6,8,16,0.98);border-top:1px solid var(--border);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);margin-top:500px}
        .mob-f-stat{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border-right:1px solid var(--border2)}
        .mob-f-stat:last-child{border-right:none}
        .mob-f-val{font-family:var(--fd);font-size:1.5rem;letter-spacing:1px;line-height:1}
        .mob-f-lbl{font-family:var(--fu);font-size:0.5rem;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:var(--sub)}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        /* sold/unsold banners: ensure they clear mobile header */
        @media(max-width:600px){
          .sold-banner,.unsold-banner{grid-template-columns:80px 1fr auto}
          .sb-photo{width:80px;height:80px}
          .sb-name{font-size:1.9rem}
          .sb-price-val{font-size:2rem}
          .sb-team-name{font-size:1.3rem}
          .sb-unsold-note-val{font-size:1.4rem}
          .sb-photo-stamp-inner{font-size:1.2rem}
          .sb-team{padding:10px 14px;min-width:unset}
          .sb-price{padding:10px 16px}
          .sb-team-logo{width:32px;height:32px}
        }
      `}</style>

            {isMobile ? (
                /* ═══ MOBILE LAYOUT ═══ */
                <>
                    <div className="mob-page">

                        {/* sticky header */}
                        <header className="mob-hdr">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                <img src="/images/tournament-logo.png" alt="" style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(255,215,0,0.3)', objectFit: 'cover', flexShrink: 0 }} onError={e => e.target.style.display = 'none'} />
                                <div style={{ fontFamily: 'var(--fd)', fontSize: '1.2rem', letterSpacing: '2px', color: 'var(--text)' }}>TKM VOLLEYBALL</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', border: `1px solid ${isActive ? 'rgba(74,222,128,0.3)' : isPaused ? 'rgba(251,146,60,0.3)' : 'var(--border2)'}`, background: isActive ? 'rgba(74,222,128,0.06)' : 'transparent' }}>
                                <div style={{ width: 5, height: 5, borderRadius: '50%', background: isActive ? 'var(--green)' : isPaused ? '#FB923C' : 'var(--muted)', animation: isActive ? 'pulse 2s infinite' : 'none', flexShrink: 0 }} />
                                <span style={{ fontFamily: 'var(--fu)', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: isActive ? 'var(--green)' : isPaused ? '#FB923C' : 'var(--muted)' }}>
                                    {isActive ? 'Live' : isPaused ? 'Paused' : 'Standby'}
                                </span>
                            </div>
                        </header>

                        {currentPlayer ? (
                            <div className="mob-player" key={currentPlayer.id}>

                                {/* player photo — taller, overlay fades bottom */}
                                <div className="mob-photo-wrap" style={{ borderBottom: `3px solid ${cc?.color || 'rgba(255,255,255,0.08)'}` }}>
                                    <img className="mob-photo"
                                        src={currentPlayer.photo_url || `/images/players/${currentPlayer.id}.jpg`}
                                        alt={currentPlayer.name}
                                        onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
                                    />
                                    <div style={{ display: 'none', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', background: 'var(--bg-panel)' }}>
                                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,215,0,0.05)" strokeWidth="1"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                                    </div>
                                    <div className="mob-photo-overlay" />
                                    <div className="mob-otb">On the Block</div>
                                    {/* player name + badges over photo */}
                                    <div className="mob-player-info">
                                        <div style={{ display: 'flex', gap: 5, marginBottom: 5, flexWrap: 'wrap' }}>
                                            {cc && <span style={{ fontFamily: 'var(--fu)', fontSize: '0.58rem', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', padding: '3px 9px', background: cc.bg, border: `1px solid ${cc.border}`, color: cc.color }}>{currentPlayer.cls}</span>}
                                            {ps && <span style={{ fontFamily: 'var(--fu)', fontSize: '0.58rem', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', padding: '3px 9px', background: ps.bg, border: `1px solid ${ps.border}`, color: ps.text }}>{currentPlayer.position}</span>}
                                        </div>
                                        <div className="mob-player-name">{currentPlayer.name}</div>
                                        <div className="mob-player-meta">
                                            {currentPlayer.college && <span className="mob-meta-chip">{currentPlayer.college}</span>}
                                            {currentPlayer.college && currentPlayer.base_price && <span className="mob-meta-chip" style={{ color: 'var(--border2)' }}>·</span>}
                                            {currentPlayer.base_price && <span className="mob-meta-chip">Base {fmtFull(currentPlayer.base_price)}</span>}
                                        </div>
                                    </div>
                                </div>

                                {/* bid row — flat, full width, no overlap */}
                                <div className="mob-bid" style={{ background: leadRgb ? `linear-gradient(135deg, var(--bg-card) 40%, rgba(${leadRgb},0.07) 100%)` : 'var(--bg-card)' }}>
                                    <div>
                                        <div style={{ fontFamily: 'var(--fu)', fontSize: '0.52rem', fontWeight: 800, letterSpacing: '4px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 3 }}>Current Bid</div>
                                        <div key={astate?.current_bid} style={{ fontFamily: 'var(--fd)', fontSize: 'clamp(2rem,8vw,2.8rem)', lineHeight: 0.9, letterSpacing: '2px', color: 'var(--acc)', animation: 'bidIn 0.3s ease' }}>
                                            {astate?.current_bid ? fmtFull(astate.current_bid) : fmtFull(currentPlayer.base_price)}
                                        </div>
                                    </div>
                                    <div className="mob-bid-divider" />
                                    {leadingTeam ? (
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginBottom: 3, fontFamily: 'var(--fu)', fontSize: '0.52rem', fontWeight: 800, letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--muted)' }}>
                                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: leadColour, animation: 'leadPulse 1.2s ease-in-out infinite', flexShrink: 0 }} />
                                                Leading
                                            </div>
                                            <div style={{ fontFamily: 'var(--fd)', fontSize: 'clamp(1.2rem,5vw,1.6rem)', letterSpacing: '1px', color: leadColour, lineHeight: 1 }}>{leadingTeam.name}</div>
                                        </div>
                                    ) : (
                                        <div style={{ fontFamily: 'var(--fu)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '2px', color: 'var(--muted)', textAlign: 'right' }}>No bids yet</div>
                                    )}
                                </div>

                            </div>
                        ) : (
                            <div className="mob-idle">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,215,0,0.07)" strokeWidth="1"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                <div style={{ fontFamily: 'var(--fd)', fontSize: '2.6rem', letterSpacing: '3px', color: 'var(--muted)', lineHeight: 1 }}>{isPaused ? 'PAUSED' : 'STANDING BY'}</div>
                                <div style={{ fontFamily: 'var(--fu)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '3px', color: 'var(--muted)', textTransform: 'uppercase' }}>{isPaused ? 'Auctioneer will resume shortly' : 'Next player coming up'}</div>
                            </div>
                        )}

                        {/* teams section header */}
                        <div className="mob-section">
                            Teams
                            <div className="mob-section-line" />
                            <span style={{ fontFamily: 'var(--fu)', fontSize: '0.52rem', letterSpacing: '2px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{sortedTeams.length} competing</span>
                        </div>
                        <div>
                            {sortedTeams.map(team => (
                                <MobileTeamRow key={team.id} team={team} isLeading={team.id === astate?.current_bid_team_id}
                                    onViewRoster={() => setActiveRoster({ team })} currentPlayer={currentPlayer} players={players} />
                            ))}
                        </div>
                    </div>

                    {/* fixed stats footer */}
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
                                <img src="/images/court-graphic.png" alt="" width="200" height="200" className="idle-img" onError={e => e.target.style.display = 'none'} />
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

            {/* ── SOLD ANIMATION BANNER ── */}
            {soldAnim && (() => {
                const colour = teamColour(soldAnim.team.id)
                const rgb = hexToRgb(colour)
                const ps = soldAnim.player.position ? posStyle(soldAnim.player.position) : null
                const cc = soldAnim.player.cls ? classCfg(soldAnim.player.cls) : null
                const price = soldAnim.player.sold_price || soldAnim.player.sold_amount
                const particles = Array.from({ length: 18 }, (_, i) => {
                    const angle = (i / 18) * 2 * Math.PI
                    const dist = 55 + Math.random() * 55
                    const dx = Math.cos(angle) * dist
                    const dy = Math.sin(angle) * dist
                    return { dx, dy, delay: i * 0.04, size: 4 + Math.random() * 5 }
                })
                return (
                    <div className={`sold-banner${soldAnim.leaving ? ' leaving' : ''}`}
                        style={{ borderBottomColor: colour, boxShadow: `0 12px 60px rgba(0,0,0,0.9), 0 0 0 1px rgba(${rgb},0.15) inset` }}>

                        {/* scanline sweep */}
                        <div className="banner-scanline" />

                        {/* player photo + SOLD stamp */}
                        <div className="sb-photo" style={{ borderRightColor: `rgba(${rgb},0.15)` }}>
                            <img
                                src={soldAnim.player.photo_url || `/images/players/${soldAnim.player.id}.jpg`}
                                alt={soldAnim.player.name}
                                onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
                            />
                            <div className="sb-photo-fallback" style={{ display: 'none' }}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={`rgba(${rgb},0.3)`} strokeWidth="1">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                                </svg>
                            </div>
                            <div className="sb-photo-stamp">
                                <div className="sb-photo-stamp-inner" style={{ borderColor: colour, color: colour }}>SOLD</div>
                            </div>
                            <div className="sb-particles">
                                {particles.map((p, i) => (
                                    <div key={i} className="sb-p" style={{
                                        background: colour, width: p.size, height: p.size,
                                        top: '50%', left: '50%',
                                        '--dx': `${p.dx}px`, '--dy': `${p.dy}px`,
                                        animationDelay: `${1.5 + p.delay}s`, opacity: 0.85,
                                    }} />
                                ))}
                            </div>
                        </div>

                        {/* player info */}
                        <div className="sb-player">
                            <div className="sb-eyebrow sold-lbl">
                                SOLD
                                <div className="sb-eye-line sold-lbl" />
                            </div>
                            <div className="sb-name">{soldAnim.player.name}</div>
                            <div className="sb-badges">
                                {ps && <span className="sb-badge" style={{ background: ps.bg, borderColor: ps.border, color: ps.text }}>{soldAnim.player.position}</span>}
                                {cc && <span className="sb-badge" style={{ background: cc.bg, borderColor: cc.border, color: cc.color }}>{soldAnim.player.cls}</span>}
                            </div>
                        </div>

                        {/* team: logo + name */}
                        <div className="sb-team" style={{ borderLeftColor: `rgba(${rgb},0.15)` }}>
                            <div className="sb-to-lbl">Goes to</div>
                            <img
                                className="sb-team-logo"
                                src={`/images/teams/${soldAnim.team.id}.png`}
                                alt=""
                                style={{ borderColor: `rgba(${rgb},0.5)`, boxShadow: `0 0 12px rgba(${rgb},0.25)` }}
                                onError={e => e.target.style.display = 'none'}
                            />
                            <div className="sb-team-name" style={{ color: colour }}>{soldAnim.team.name}</div>
                        </div>

                        {/* price */}
                        <div className="sb-price" style={{ borderLeftColor: `rgba(${rgb},0.15)` }}>
                            <div className="sb-price-lbl">Final Price</div>
                            <div className="sb-price-val" style={{ color: colour }}>{fmtFull(price)}</div>
                        </div>

                    </div>
                )
            })()}

            {/* ── UNSOLD ANIMATION BANNER ── */}
            {unsoldAnim && (() => {
                const ps = unsoldAnim.player.position ? posStyle(unsoldAnim.player.position) : null
                const cc = unsoldAnim.player.cls ? classCfg(unsoldAnim.player.cls) : null
                return (
                    <div className={`unsold-banner${unsoldAnim.leaving ? ' leaving' : ''}`}>

                        {/* scanline sweep */}
                        <div className="banner-scanline" />

                        {/* player photo + UNSOLD stamp */}
                        <div className="sb-photo" style={{ borderRightColor: 'rgba(248,113,113,0.15)' }}>
                            <img
                                src={unsoldAnim.player.photo_url || `/images/players/${unsoldAnim.player.id}.jpg`}
                                alt={unsoldAnim.player.name}
                                onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
                            />
                            <div className="sb-photo-fallback" style={{ display: 'none' }}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(248,113,113,0.3)" strokeWidth="1">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                                </svg>
                            </div>
                            <div className="sb-photo-stamp">
                                <div className="sb-photo-stamp-inner" style={{ borderColor: '#F87171', color: '#F87171' }}>UNSOLD</div>
                            </div>
                        </div>

                        {/* player info */}
                        <div className="sb-player">
                            <div className="sb-eyebrow unsold-lbl">
                                UNSOLD
                                <div className="sb-eye-line unsold-lbl" />
                            </div>
                            <div className="sb-name">{unsoldAnim.player.name}</div>
                            <div className="sb-badges">
                                {ps && <span className="sb-badge" style={{ background: ps.bg, borderColor: ps.border, color: ps.text }}>{unsoldAnim.player.position}</span>}
                                {cc && <span className="sb-badge" style={{ background: cc.bg, borderColor: cc.border, color: cc.color }}>{unsoldAnim.player.cls}</span>}
                                {unsoldAnim.player.base_price && (
                                    <span className="sb-badge" style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'var(--muted)' }}>
                                        Base {fmtFull(unsoldAnim.player.base_price)}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* right note */}
                        <div className="sb-unsold-note">
                            <div className="sb-unsold-note-lbl">Returns to pool</div>
                            <div className="sb-unsold-note-val">No bids</div>
                        </div>

                    </div>
                )
            })()}
        </>
    )
}