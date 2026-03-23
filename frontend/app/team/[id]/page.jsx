'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

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
    spiker: { bg: 'rgba(249,115,22,0.14)', border: 'rgba(249,115,22,0.5)', text: '#FB923C', label: 'Spiker' },
    setter: { bg: 'rgba(234,179,8,0.14)', border: 'rgba(234,179,8,0.5)', text: '#FCD34D', label: 'Setter' },
    libero: { bg: 'rgba(6,182,212,0.14)', border: 'rgba(6,182,212,0.5)', text: '#22D3EE', label: 'Lifter' },
    other: { bg: 'rgba(168,85,247,0.14)', border: 'rgba(168,85,247,0.5)', text: '#C084FC', label: 'Other' },
}
const posStyle = (pos) => POS_STYLE[normalisePos(pos)] || POS_STYLE.other
const CLASS_CFG = {
    diamond: { label: 'Diamond', color: '#67E8F9', border: 'rgba(103,232,249,0.45)', bg: 'rgba(103,232,249,0.08)' },
    gold: { label: 'Gold', color: '#FFD700', border: 'rgba(255,215,0,0.5)', bg: 'rgba(255,215,0,0.08)' },
    silver: { label: 'Silver', color: '#CBD5E1', border: 'rgba(203,213,225,0.5)', bg: 'rgba(203,213,225,0.08)' },
    other: { label: '—', color: 'var(--sub)', border: 'var(--border2)', bg: 'transparent' },
}
const classCfg = (cls) => CLASS_CFG[normaliseClass(cls)] || CLASS_CFG.other

const GOLD_BASE = 20000
const SILVER_BASE = 10000
const STARTING_WALLET = 200000

// currentCls: class of player on the block; squad: acquired players for this team
const calcMaxBid = (team, currentCls = null, squad = []) => {
    const goldHave = squad.filter(p => normaliseClass(p.cls) === 'gold').length
    const silverHave = squad.filter(p => normaliseClass(p.cls) === 'silver').length
    let goldNeed = Math.max(0, 2 - goldHave)
    let silverNeed = Math.max(0, 5 - silverHave)
    if (currentCls === 'gold') goldNeed = Math.max(0, goldNeed - 1)
    if (currentCls === 'silver') silverNeed = Math.max(0, silverNeed - 1)
    const reserve = goldNeed * GOLD_BASE + silverNeed * SILVER_BASE
    return Math.max(0, (team.wallet ?? 0) - reserve)
}

const REQUIRED = { gold: 2, silver: 5, setter: 1, spiker: 2, libero: 3 }

function getRosterNeeds(squad) {
    const goldHave = squad.filter(p => normaliseClass(p.cls) === 'gold').length
    const silverHave = squad.filter(p => normaliseClass(p.cls) === 'silver').length
    const setterHave = squad.filter(p => normalisePos(p.position) === 'setter').length
    const spikerHave = squad.filter(p => normalisePos(p.position) === 'spiker').length
    const liberoHave = squad.filter(p => normalisePos(p.position) === 'libero').length
    return {
        classes: [
            { key: 'gold', label: 'Gold', have: goldHave, need: Math.max(0, REQUIRED.gold - goldHave), req: REQUIRED.gold, color: '#FFD700', border: 'rgba(255,215,0,0.4)', bg: 'rgba(255,215,0,0.08)' },
            { key: 'silver', label: 'Silver', have: silverHave, need: Math.max(0, REQUIRED.silver - silverHave), req: REQUIRED.silver, color: '#CBD5E1', border: 'rgba(203,213,225,0.4)', bg: 'rgba(203,213,225,0.08)' },
        ],
        positions: [
            { key: 'setter', label: 'Setter', have: setterHave, need: Math.max(0, REQUIRED.setter - setterHave), req: REQUIRED.setter, ...POS_STYLE.setter },
            { key: 'spiker', label: 'Spiker', have: spikerHave, need: Math.max(0, REQUIRED.spiker - spikerHave), req: REQUIRED.spiker, ...POS_STYLE.spiker },
            { key: 'libero', label: 'Lifter', have: liberoHave, need: Math.max(0, REQUIRED.libero - liberoHave), req: REQUIRED.libero, ...POS_STYLE.libero },
        ],
    }
}

// ── Team Logo with letter fallback ──────────────────────────────────────────
function TeamLogo({ team, size = 55, fontSize = '1rem' }) {
    const [imgError, setImgError] = useState(false)
    const letter = team?.name?.charAt(0)?.toUpperCase() || '?'
    if (!imgError) {
        return (
            <img
                src={`/images/teams/${team?.id}.png`}
                alt={team?.name || ''}
                width={size} height={size}
                style={{ borderRadius: '10%', objectFit: 'cover', display: 'block', flexShrink: 0 }}
                onError={() => setImgError(true)}
            />
        )
    }
    return (
        <div style={{
            width: size, height: size, borderRadius: '50%', flexShrink: 0,
            background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--fd)', fontSize, color: 'var(--acc)', letterSpacing: 1,
        }}>
            {letter}
        </div>
    )
}

// ── Badges ───────────────────────────────────────────────────────────────────
function ClassBadge({ cls }) {
    const c = classCfg(cls)
    return (
        <span style={{
            fontFamily: 'var(--fu)', fontSize: '0.65rem', letterSpacing: '2px',
            textTransform: 'uppercase', padding: '3px 9px',
            background: c.bg, border: `1px solid ${c.border}`, color: c.color,
        }}>{cls || '—'}</span>
    )
}
function PosBadge({ position }) {
    const s = posStyle(position)
    return (
        <span style={{
            fontFamily: 'var(--fu)', fontSize: '0.65rem', letterSpacing: '2px',
            textTransform: 'uppercase', padding: '3px 9px',
            background: s.bg, border: `1px solid ${s.border}`, color: s.text,
        }}>{position || '—'}</span>
    )
}

// ── Star button ───────────────────────────────────────────────────────────────
function StarBtn({ active, onClick, size = 18 }) {
    const [hov, setHov] = useState(false)
    return (
        <button
            onClick={e => { e.stopPropagation(); onClick() }}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                color: active ? '#FFD700' : hov ? 'rgba(255,215,0,0.5)' : 'rgba(255, 208, 0, 1)',
                transition: 'color 0.15s, transform 0.15s',
                transform: hov ? 'scale(1.2)' : 'scale(1)', lineHeight: 1,
            }}
        >
            <svg width={size} height={size} viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
        </button>
    )
}

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ status }) {
    const cfg = {
        upcoming: { c: 'var(--sub)', b: 'var(--border2)', bg: 'transparent', l: 'Available' },
        available: { c: 'var(--sub)', b: 'var(--border2)', bg: 'transparent', l: 'Available' },
        onblock: { c: 'var(--green)', b: 'rgba(74,222,128,0.35)', bg: 'rgba(74,222,128,0.07)', l: 'On Block' },
        sold: { c: 'var(--red)', b: 'rgba(248,113,113,0.35)', bg: 'rgba(248,113,113,0.07)', l: 'Sold' },
        unsold: { c: 'var(--orange)', b: 'rgba(251,146,60,0.35)', bg: 'rgba(251,146,60,0.07)', l: 'Unsold' },
    }
    const s = cfg[status] || cfg.upcoming
    return (
        <span style={{
            fontFamily: 'var(--fu)', fontSize: '0.65rem', letterSpacing: '2px',
            textTransform: 'uppercase', padding: '3px 9px',
            border: `1px solid ${s.b}`, color: s.c, background: s.bg,
        }}>{s.l}</span>
    )
}

// ── Watchlist row ──────────────────────────────────────────────────────────
function WatchRow({ player, currentPlayerId, allTeams, onRemove }) {
    const isOnBlock = player.id === currentPlayerId
    const status = isOnBlock ? 'onblock' : player.status === 'sold' ? 'sold' : player.status === 'unsold' ? 'unsold' : 'upcoming'
    const soldTeam = player.status === 'sold' ? allTeams.find(t => t.id === player.sold_to_team) : null

    return (
        <div style={{
            display: 'grid', gridTemplateColumns: '60px 1fr auto',
            border: `1px solid ${isOnBlock ? 'rgba(74,222,128,0.25)' : 'var(--border2)'}`,
            marginBottom: 3, background: 'var(--bg-card)', overflow: 'hidden',
            transition: 'border-color 0.2s',
            ...(isOnBlock ? { boxShadow: '0 0 12px rgba(74,222,128,0.08)' } : {}),
        }}>
            <div style={{ background: 'var(--bg-panel)', borderRight: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <img
                    src={player.photo_url || `/images/players/${player.id}.jpg`} alt=""
                    style={{ width: 60, height: 72, objectFit: 'cover', objectPosition: 'top', display: 'block' }}
                    onError={e => e.target.style.display = 'none'}
                />
                {isOnBlock && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'var(--green)' }} />}
            </div>
            <div style={{ padding: '11px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
                <div style={{ fontFamily: 'var(--fd)', fontSize: '1.15rem', letterSpacing: '1px', color: 'var(--text)', lineHeight: 1 }}>{player.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <PosBadge position={player.position} />
                    <ClassBadge cls={player.cls} />
                    <StatusPill status={status} />
                </div>
                {soldTeam && (
                    <div style={{ fontFamily: 'var(--fu)', fontSize: '0.65rem', letterSpacing: '1.5px', color: 'var(--sub)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                        Sold to {soldTeam.name} · {fmtFull(player.sold_price)}
                    </div>
                )}
            </div>
            <div style={{ padding: '11px 16px', borderLeft: '1px solid var(--border2)', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', gap: 8 }}>
                <div style={{ fontFamily: 'var(--fd)', fontSize: '1.2rem', color: player.status === 'sold' ? 'var(--acc)' : 'var(--sub)', letterSpacing: '1px' }}>
                    {player.status === 'sold' ? fmtFull(player.sold_price) : fmt(player.base_price)}
                </div>
                <button
                    onClick={onRemove}
                    style={{ background: 'none', border: '1px solid var(--border2)', cursor: 'pointer', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--fu)', fontSize: '0.6rem', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--muted)', transition: 'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(248,113,113,0.4)'; e.currentTarget.style.color = 'var(--red)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--muted)' }}
                >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    Remove
                </button>
            </div>
        </div>
    )
}

// ── Available player card ───────────────────────────────────────────────────
// Glow colours per class (used for hover afterglow + border tint)
const CLASS_GLOW = {
    diamond: { shadow: '0 8px 32px rgba(103,232,249,0.28), 0 2px 8px rgba(103,232,249,0.15)', border: 'rgba(103,232,249,0.45)', label: '#67E8F9' },
    gold: { shadow: '0 8px 32px rgba(255,215,0,0.30),   0 2px 8px rgba(255,215,0,0.18)', border: 'rgba(255,215,0,0.5)', label: '#FFD700' },
    silver: { shadow: '0 8px 32px rgba(203,213,225,0.22), 0 2px 8px rgba(203,213,225,0.12)', border: 'rgba(203,213,225,0.4)', label: '#CBD5E1' },
    other: { shadow: '0 8px 24px rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.12)', label: 'var(--sub)' },
}

function AvailCard({ player, watched, onStar, isOnBlock }) {
    const [hov, setHov] = useState(false)
    const cls = normaliseClass(player.cls)
    const glow = CLASS_GLOW[cls] || CLASS_GLOW.other

    // On-block overrides the class glow with green
    const activeShadow = isOnBlock
        ? '0 8px 28px rgba(74,222,128,0.28), 0 2px 8px rgba(74,222,128,0.15)'
        : hov ? glow.shadow : 'none'
    const activeBorder = isOnBlock
        ? 'rgba(74,222,128,0.35)'
        : hov ? glow.border : 'var(--border2)'

    return (
        <div
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                background: 'var(--bg-card)',
                border: `1px solid ${activeBorder}`,
                overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative',
                transition: 'transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease',
                transform: hov ? 'translateY(-4px)' : 'translateY(0)',
                boxShadow: activeShadow,
                cursor: 'default',
            }}
        >
            <div style={{ position: 'relative', height: 150, background: 'var(--bg-panel)', overflow: 'hidden' }}>
                <img
                    src={player.photo_url || `/images/players/${player.id}.jpg`} alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block' }}
                    onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
                />
                <div style={{ display: 'none', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', background: 'var(--bg-panel)' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>
                </div>
                {/* Subtle class-coloured bottom gradient that intensifies on hover */}
                <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0, height: 40,
                    background: isOnBlock
                        ? 'linear-gradient(to top, rgba(74,222,128,0.18), transparent)'
                        : `linear-gradient(to top, ${glow.border.replace(')', ',0.25)').replace('rgba', 'rgba')}, transparent)`,
                    opacity: hov || isOnBlock ? 1 : 0,
                    transition: 'opacity 0.22s ease',
                    pointerEvents: 'none',
                }} />
                <div style={{ position: 'absolute', top: 3, right: 3 }}><StarBtn active={watched} onClick={onStar} /></div>
                {isOnBlock && (
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '5px 8px', background: 'rgba(74,222,128,0.15)', borderTop: '1px solid rgba(74,222,128,0.3)', fontFamily: 'var(--fu)', fontSize: '0.6rem', letterSpacing: '3px', color: 'var(--green)', textTransform: 'uppercase', textAlign: 'center' }}>
                        On Block Now
                    </div>
                )}
            </div>
            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontFamily: 'var(--fd)', fontSize: '1.05rem', letterSpacing: '1px', color: 'var(--text)', lineHeight: 1 }}>{player.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <PosBadge position={player.position} />
                    <div style={{ fontFamily: 'var(--fd)', fontSize: '1rem', letterSpacing: '1px', color: hov ? glow.label : 'var(--acc)', transition: 'color 0.22s' }}>{fmt(player.base_price)}</div>
                </div>
            </div>
        </div>
    )
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
    return `${r}, ${g}, ${b}`
}
const darken = (hex, amount = 0.5) => {
    const r = Math.floor(parseInt(hex.slice(1, 3), 16) * amount)
    const g = Math.floor(parseInt(hex.slice(3, 5), 16) * amount)
    const b = Math.floor(parseInt(hex.slice(5, 7), 16) * amount)
    return `rgb(${r}, ${g}, ${b})`
}
const getTeamGradient = (teamId) => {
    if (!teamId) return 'linear-gradient(135deg, #111827, #020617)'
    const color = teamColour(teamId)
    const rgb = hexToRgb(color)
    return rgb
}

// ══════════════════════════════════════════════════════════════════════════════
export default function TeamRosterPage() {
    const { id: teamId } = useParams()
    const router = useRouter()
    const supabase = useMemo(() => createClient(), [])

    const [myTeam, setMyTeam] = useState(null)
    const [allTeams, setAllTeams] = useState([])
    const [squad, setSquad] = useState([])
    const [watchlist, setWatchlist] = useState([])
    const [avPlayers, setAvPlayers] = useState([])
    const [astate, setAstate] = useState(null)
    const [connected, setConnected] = useState(false)
    const [loading, setLoading] = useState(true)

    const [tab, setTab] = useState('squad')
    const [posFilter, setPosFilter] = useState('all')
    const [clsFilter, setClsFilter] = useState('all')
    const [wlBusy, setWlBusy] = useState({})

    const [toast, setToast] = useState(null)
    const toastRef = useRef(null)
    const showToast = (msg, type = 'info') => {
        setToast({ msg, type })
        clearTimeout(toastRef.current)
        toastRef.current = setTimeout(() => setToast(null), 2800)
    }

    const watchIds = watchlist.map(p => p.id)

    const fetchAll = useCallback(async () => {
        try {
            const [sr, rr, wlr, pr] = await Promise.all([
                fetch(`${API}/auction/state`),
                fetch(`${API}/teams/${teamId}/roster`),
                fetch(`${API}/teams/${teamId}/watchlist`),
                fetch(`${API}/players/`),
            ])
            if (sr.ok) { const d = await sr.json(); setAstate(d); setAllTeams(d.teams || []); const t = (d.teams || []).find(x => String(x.id) === String(teamId)); if (t) setMyTeam(t) }
            if (rr.ok) setSquad(await rr.json())
            if (wlr.ok) setWatchlist(await wlr.json())
            if (pr.ok) { const all = await pr.json(); setAvPlayers(all.filter(p => p.status === 'upcoming' || p.status === 'unsold')) }
        } catch { }
    }, [teamId])

    useEffect(() => { fetchAll().finally(() => setLoading(false)) }, [])
    // polling fallback — catches anything realtime misses
    useEffect(() => {
        const interval = setInterval(() => fetchAllRef.current(), 5000)
        return () => clearInterval(interval)
    }, [])
    // always keep ref pointing to latest fetchAll so realtime never calls a stale closure
    const fetchAllRef = useRef(fetchAll)
    useEffect(() => { fetchAllRef.current = fetchAll }, [fetchAll])

    useEffect(() => {
        const ch = supabase.channel(`team-ro-${teamId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_state' }, () => fetchAllRef.current())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => fetchAllRef.current())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => fetchAllRef.current())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'watchlist' }, () => fetchAllRef.current())
            .on('system', {}, p => setConnected(p.status === 'SUBSCRIBED'))
            .subscribe(s => setConnected(s === 'SUBSCRIBED'))
        return () => supabase.removeChannel(ch)
    }, [teamId])

    const toggleWatch = async (playerId) => {
        const inList = watchIds.includes(playerId)
        setWlBusy(b => ({ ...b, [playerId]: true }))
        if (inList) { setWatchlist(w => w.filter(p => p.id !== playerId)) }
        else { const p = avPlayers.find(x => x.id === playerId); if (p) setWatchlist(w => [...w, p]) }
        try {
            const r = await fetch(`${API}/teams/watchlist`, {
                method: inList ? 'DELETE' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ team_id: teamId, player_id: playerId }),
            })
            if (!r.ok) {
                if (inList) { const p = avPlayers.find(x => x.id === playerId); if (p) setWatchlist(w => [...w, p]) }
                else setWatchlist(w => w.filter(p => p.id !== playerId))
                showToast('Watchlist update failed', 'error')
            } else {
                showToast(inList ? 'Removed from watchlist' : 'Added to watchlist', 'info')
            }
        } catch { showToast('Network error', 'error') }
        setWlBusy(b => ({ ...b, [playerId]: false }))
    }

    const currentPlayer = astate?.current_player
    const isActive = astate?.phase === 'active'
    const leadingTeamId = astate?.current_bid_team_id
    const isMyBid = String(leadingTeamId) === String(teamId)
    const totalSpent = squad.reduce((s, p) => normaliseClass(p.cls) === 'diamond' ? s : s + (p.sold_price || 0), 0)
    const walletPct = myTeam ? Math.min(100, Math.round((myTeam.wallet / STARTING_WALLET) * 100)) : 100
    const slotsLeft = (myTeam?.max_players ?? 0) - squad.length

    const POS_ORDER = ['spiker', 'setter', 'libero', 'other']
    const squadByPos = POS_ORDER.reduce((acc, pos) => { const g = squad.filter(p => normalisePos(p.position) === pos); if (g.length) acc[pos] = g; return acc }, {})
    const filteredAv = avPlayers
        .filter(p => posFilter === 'all' || normalisePos(p.position) === posFilter)
        .filter(p => clsFilter === 'all' || normaliseClass(p.cls) === clsFilter)
    const avByPos = POS_ORDER.reduce((acc, pos) => { const g = filteredAv.filter(p => normalisePos(p.position) === pos); if (g.length) acc[pos] = g; return acc }, {})
    const tabCounts = { squad: squad.length, watchlist: watchlist.length, players: avPlayers.length }

    if (loading) return (
        <div style={{ minHeight: '100vh', background: '#060810', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap');@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid rgba(255,215,0,0.1)', borderTopColor: '#FFD700', animation: 'spin 0.8s linear infinite' }} />
        </div>
    )

    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Libre+Franklin:wght@400;600;700;800;900&family=Barlow+Condensed:wght@400;600;700&family=Barlow:wght@400;500&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        :root{
          --bg:#060810;--bg-card:#0B0E18;--bg-panel:#0F1320;
          --acc:#FFD700;--acc2:#FF6B35;--green:#4ADE80;--red:#F87171;--orange:#FB923C;
          --border:rgba(255,215,0,0.09);--border2:rgba(255,255,255,0.07);
          --text:#EEF2FF;--sub:#9CA3AF;--muted:#6B7280;
          --fd:'Bebas Neue',sans-serif;--fu:'Libre Franklin',sans-serif;
        }
        html,body{min-height:100%;background:var(--bg);color:var(--text)}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(255,215,0,0.12);border-radius:2px}
        body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.005) 3px,rgba(255,255,255,0.005) 6px)}

        @keyframes pulse  {0%,100%{box-shadow:0 0 0 0 rgba(74,222,128,.5)}70%{box-shadow:0 0 0 8px rgba(74,222,128,0)}}
        @keyframes fadeUp {from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes toastIn{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:translateX(0)}}
        @keyframes bidPulse{0%,100%{opacity:1}50%{opacity:0.6}}

        .page {
          position: relative;
          z-index: 1;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          transition: background 0.4s ease;
        }

        /* ── topbar ── */
        .topbar{display:flex;align-items:center;justify-content:space-between;padding:16px 32px;border-bottom:1px solid var(--border);position:sticky;top:0;z-index:50;background:rgba(6,8,16,0.55);backdrop-filter:blur(24px)}
        .tb-l{display:flex;align-items:center;gap:16px}
        .tb-r{display:flex;align-items:center;gap:16px}
        .back-btn{background:none;border:none;cursor:pointer;color:var(--muted);display:flex;align-items:center;gap:6px;font-family:var(--fu);font-size:0.72rem;letter-spacing:2px;text-transform:uppercase;transition:color 0.15s;padding:0}
        .back-btn:hover{color:var(--text)}
        .tsep{width:1px;height:22px;background:var(--border2)}
        .team-name-hdr{font-family:var(--fd);font-size:1.6rem;letter-spacing:2px;color:var(--text)}
        .wallet-chip{font-family:var(--fu);font-size:0.9rem;font-weight:700;letter-spacing:2px;color:var(--acc);padding:5px 14px;border:1px solid rgba(255,215,0,0.2);background:rgba(255,215,0,0.04)}
        .conn-row{display:flex;align-items:center;gap:6px}
        .conn-dot{width:7px;height:7px;border-radius:50%}
        .conn-lbl{font-family:var(--fu);font-size:0.65rem;letter-spacing:2px;color:var(--muted);text-transform:uppercase}

        /* ── on the block panel ── */
        @keyframes scanline{0%{transform:translateY(-100%)}100%{transform:translateY(100%)}}
        @keyframes blockIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
        .live-strip{
          border-bottom:1px solid var(--border);
          animation:blockIn .35s ease;
          position:relative;overflow:hidden;
          background:linear-gradient(135deg,rgba(74,222,128,0.03) 0%,transparent 60%);
        }
        .live-strip::after{
          content:'';position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;
          background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,0.003) 2px,rgba(255,255,255,0.003) 4px);
        }
        .otb-inner{display:grid;grid-template-columns:auto 1fr auto;align-items:stretch;gap:0;position:relative;z-index:1}

        /* left: player photo + class strip */
        .otb-photo-wrap{position:relative;width:72px;flex-shrink:0;border-right:1px solid var(--border2);overflow:hidden}
        .otb-photo{width:72px;height:100%;object-fit:cover;object-position:center 20%;display:block;min-height:80px}
        .otb-photo-fallback{width:72px;min-height:80px;background:var(--bg-panel);display:flex;align-items:center;justify-content:center}
        .otb-class-strip{position:absolute;bottom:0;left:0;right:0;height:3px}

        /* center: player info */
        .otb-center{padding:14px 20px;display:flex;flex-direction:column;justify-content:center;gap:7px;min-width:0}
        .otb-eyebrow{display:flex;align-items:center;gap:8px}
        .otb-live-pill{display:flex;align-items:center;gap:5px;padding:3px 9px;border:1px solid rgba(74,222,128,0.3);background:rgba(74,222,128,0.06);flex-shrink:0}
        .otb-live-dot{width:5px;height:5px;border-radius:50%;background:var(--green);animation:pulse 2s infinite}
        .otb-live-lbl{font-family:var(--fu);font-size:0.58rem;letter-spacing:3px;color:var(--green);text-transform:uppercase}
        .otb-eyebrow-txt{font-family:var(--fu);font-size:0.6rem;letter-spacing:4px;color:var(--sub);text-transform:uppercase}
        .otb-name{font-family:var(--fd);font-size:2.4rem;letter-spacing:1.5px;color:var(--text);line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .otb-badges{display:flex;align-items:center;gap:7px;flex-wrap:wrap}

        /* right: bid info */
        .otb-bid{padding:14px 24px 14px 20px;border-left:1px solid var(--border2);display:flex;flex-direction:column;justify-content:center;align-items:flex-end;gap:5px;flex-shrink:0;min-width:160px}
        .otb-bid-lbl{font-family:var(--fu);font-size:0.88rem;letter-spacing:4px;color:var(--muted);text-transform:uppercase}
        .otb-bid-amt{font-family:var(--fd);font-size:2.6rem;letter-spacing:2px;color:var(--acc);line-height:1}
        .otb-bid-team{font-family:var(--fu);font-size:0.68rem;letter-spacing:1.5px;margin-top:2px}
        .otb-bid-team.mine{color:var(--acc);animation:bidPulse 1.5s infinite}
        .otb-bid-team.other{color:var(--sub)}

        /* divider line between center and bid */
        .otb-vsep{width:1px;background:var(--border2);align-self:stretch}

        /* idle / paused */
        .no-live{padding:13px 32px;border-bottom:1px solid var(--border);font-family:var(--fu);font-size:0.65rem;letter-spacing:3px;color:var(--muted);text-transform:uppercase;display:flex;align-items:center;gap:9px}

        /* ── tabs ── */
        .tabs{display:flex;border-bottom:1px solid var(--border);padding:0 32px}
        .tab-btn{background:none;border:none;cursor:pointer;font-family:var(--fu);font-size:0.85rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--muted);padding:15px 0;margin-right:32px;border-bottom:2px solid transparent;transition:all .2s;display:flex;align-items:center;gap:8px}
        .tab-btn.on{color:var(--acc);border-bottom-color:var(--acc)}
        .tab-btn:hover:not(.on){color:var(--sub)}
        .tc{font-family:var(--fu);font-size:0.6rem;letter-spacing:1px;padding:2px 7px;border:1px solid;border-radius:20px}
        .tab-btn.on .tc{border-color:rgba(255,215,0,0.35);color:var(--acc)}
        .tab-btn:not(.on) .tc{border-color:var(--border2);color:var(--muted)}

        /* ── content ── */
        .content{padding:28px 32px 56px;display:flex;flex-direction:column;gap:22px}

        /* ── summary grid ── */
        .sum-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:2px}
        .sum-card{background:var(--bg-card);border:1px solid var(--border2);padding:16px 18px;display:flex;flex-direction:column;gap:6px}
        .sum-lbl{font-family:var(--fu);font-size:0.75rem;font-weight:700;letter-spacing:3px;color:var(--sub);text-transform:uppercase}
        .sum-val{font-family:var(--fd);font-size:2.2rem;letter-spacing:1px;line-height:1;margin-top:2px}

        /* ── wallet bar ── */
        .wbar{background:var(--bg-card);border:1px solid var(--border2);padding:16px 18px}
        .wbrow{display:flex;justify-content:space-between;margin-bottom:8px;font-family:var(--fu);font-size:0.78rem;font-weight:700;letter-spacing:3px;color:var(--sub);text-transform:uppercase}
        .wbtrack{height:5px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden}
        .wbfill{height:100%;border-radius:3px;background:linear-gradient(90deg,var(--acc),var(--acc2));transition:width .6s}

        /* ── pos group ── */
        .pos-sec{display:flex;flex-direction:column;gap:2px}
        .pos-hdr{display:flex;align-items:center;gap:10px;padding:10px 0 7px}
        .pos-line{flex:1;height:1px;background:var(--border2)}

        /* ── squad row ── */
        .sq-row{display:grid;grid-template-columns:60px 1fr auto;border:1px solid var(--border2);background:var(--bg-card);overflow:hidden;margin-bottom:2px;transition:border-color 0.15s}
        .sq-row:hover{border-color:rgba(255,255,255,0.12)}
        .sq-photo{width:70px;height:84px;object-fit:cover;object-position:top;display:block;background:var(--bg-panel);border-right:1px solid var(--border2)}
        .sq-info{padding:10px 14px;display:flex;flex-direction:column;justify-content:center;gap:5px}
        .sq-name{font-family:var(--fd);font-size:1.4rem;letter-spacing:1px;color:var(--text);line-height:1}
        .sq-meta{font-family:var(--fu);font-size:0.75rem;font-weight:600;letter-spacing:1px;color:var(--muted)}
        .sq-price{padding:10px 16px;border-left:1px solid var(--border2);display:flex;align-items:center;font-family:var(--fd);font-size:1.5rem;color:var(--acc);letter-spacing:1px}

        /* ── empty ── */
        .empty{padding:52px 24px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px;border:1px solid var(--border2)}
        .et{font-family:var(--fd);font-size:2rem;letter-spacing:2px;color:var(--muted)}
        .es{font-family:var(--fu);font-size:0.68rem;letter-spacing:3px;color:var(--muted);text-transform:uppercase}

        /* ── watchlist empty ── */
        .wl-empty{padding:48px 24px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:16px}
        .wl-empty-icon{color:rgba(255,215,0,0.15)}
        .wl-empty-t{font-family:var(--fd);font-size:2.2rem;letter-spacing:2px;color:var(--muted)}
        .wl-empty-s{font-family:var(--fu);font-size:0.68rem;letter-spacing:3px;color:var(--muted);text-transform:uppercase;line-height:2}
        .wl-go-btn{font-family:var(--fu);font-size:0.72rem;letter-spacing:2px;text-transform:uppercase;padding:10px 20px;border:1px solid rgba(255,215,0,0.3);background:rgba(255,215,0,0.06);color:var(--acc);cursor:pointer;transition:all .15s}
        .wl-go-btn:hover{background:rgba(255,215,0,0.12);border-color:rgba(255,215,0,0.5)}

        /* ── pos filter ── */
        .pos-filter{display:flex;gap:0;align-items:center}
        .cls-filter{display:flex;gap:0;align-items:center}
        .filter-row{display:flex;flex-direction:column;gap:8px;margin-bottom:20px}
        .filter-label{font-family:var(--fu);font-size:0.6rem;letter-spacing:3px;text-transform:uppercase;color:var(--muted);width:60px;flex-shrink:0}
        .pf-btn{font-family:var(--fu);font-size:0.68rem;letter-spacing:2px;text-transform:uppercase;padding:8px 16px;border:1px solid var(--border2);border-right:none;background:transparent;color:var(--muted);cursor:pointer;transition:all .15s}
        .pf-btn.last{border-right:1px solid var(--border2)}
        .pf-btn.on{color:var(--text);background:rgba(255,255,255,0.06);border-color:rgba(255,255,255,0.15)}
        /* class-specific active states */
        .pf-btn.on-gold{color:#FFD700;background:rgba(255,215,0,0.08);border-color:rgba(255,215,0,0.35);border-right:1px solid rgba(255,215,0,0.35)}
        .pf-btn.on-gold + .pf-btn{border-left:none}
        .pf-btn.on-diamond{color:#67E8F9;background:rgba(103,232,249,0.08);border-color:rgba(103,232,249,0.35);border-right:1px solid rgba(103,232,249,0.35)}
        .pf-btn.on-silver{color:#CBD5E1;background:rgba(203,213,225,0.08);border-color:rgba(203,213,225,0.35);border-right:1px solid rgba(203,213,225,0.35)}

        /* ── available grid ── */
        .av-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:2px}

        /* ── layout ── */
        .body{display:grid;grid-template-columns:1fr 260px;flex:1;gap:0}
        .main-col{min-width:0}
        .sidebar{border-left:1px solid var(--border);position:sticky;top:57px;height:calc(100vh - 57px);display:flex;flex-direction:column;overflow:hidden;background:#020617}
        .sb-hdr{padding:14px 16px 12px;border-bottom:1px solid var(--border);flex-shrink:0;font-family:var(--fd);font-size:1rem;letter-spacing:2px;color:var(--text)}
        .sb-list{overflow-y:auto;flex:1}

        /* sidebar team row */
        .sb-tr{padding:11px 16px;border-bottom:1px solid rgba(255,255,255,0.03);display:flex;flex-direction:column;gap:5px;transition:background 0.15s}
        .sb-tr.me{background:rgba(255,215,0,0.04)}
        .sb-tr:hover{background:rgba(255,255,255,0.02)}
        .sb-trn{font-family:var(--fu);font-size:0.82rem;font-weight:600;letter-spacing:1px;color:var(--sub)}
        .sb-trn.me{color:var(--acc)}
        .sb-trw{font-family:var(--fd);font-size:1.05rem;color:var(--sub)}
        .sb-trw.me{color:var(--acc)}
        .sb-trm{display:flex;align-items:center;justify-content:space-between}
        .sb-trp{font-family:var(--fu);font-size:0.62rem;letter-spacing:1px;color:var(--muted)}
        .sb-you{font-family:var(--fu);font-size:0.52rem;letter-spacing:2px;text-transform:uppercase;padding:2px 6px;border:1px solid rgba(255,215,0,0.3);color:var(--acc);background:rgba(255,215,0,0.06)}
        .sb-bar{height:2px;background:rgba(255,255,255,0.05);border-radius:1px;overflow:hidden;margin-top:2px}
        .sb-fill{height:100%;border-radius:1px;transition:width .5s}

        /* ── toast ── */
        .toast{position:fixed;bottom:24px;right:24px;z-index:999;font-family:var(--fu);font-size:0.72rem;letter-spacing:2px;text-transform:uppercase;padding:11px 20px;border:1px solid;animation:toastIn .25s ease;pointer-events:none}
        .toast.info {background:rgba(255,215,0,0.08);border-color:rgba(255,215,0,0.25);color:var(--acc)}
        .toast.error{background:rgba(248,113,113,0.08);border-color:rgba(248,113,113,0.3);color:var(--red)}

        /* ── bid strategy cards ── */
        .strategy-card{flex:1;padding:12px 14px;display:flex;flex-direction:column;gap:6px;transition:border-color .2s}
        .strategy-label{font-family:var(--fu);font-size:0.82rem;font-weight:700;letter-spacing:2px;text-transform:uppercase}
        .strategy-need{font-family:var(--fd);font-size:1.3rem;letter-spacing:1px}
        .strategy-dots{display:flex;gap:4px;margin-top:2px}
        .strategy-sub{font-family:var(--fu);font-size:0.7rem;font-weight:600;letter-spacing:1px;color:var(--muted)}

        @media(max-width:800px){
          .body{grid-template-columns:1fr}
          .sidebar{display:none}
          .sum-grid{grid-template-columns:repeat(2,1fr)}
        }
        @media(max-width:500px){
          .topbar,.content,.no-live,.tabs{padding-left:18px;padding-right:18px}
          .otb-name{font-size:1.4rem}
          .otb-bid-amt{font-size:1.6rem}
          .otb-bid{min-width:120px;padding:12px 16px}
        }
      `}</style>

            {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

            <div className="page" style={{
                background: `
        /* 1. The Corner Bloom: Moved from top-left to top-right (100% 0%) */
        radial-gradient(circle at 100% 0%, rgba(${getTeamGradient(myTeam?.id)}, 0.35) 10%, transparent 45%),
        
        /* 2. The Base Wash: -90deg angle starts the color on the right and fades left */
        linear-gradient(-90deg, rgba(${getTeamGradient(myTeam?.id)}, 0.15) 10%, #020617 40%, #020617 100%)
    `,
                /* 3. Right Edge Highlight: Negative X-offset (-60px) makes the shadow bleed in from the right wall */
                boxShadow: `inset -60px 0 100px -40px rgba(${getTeamGradient(myTeam?.id)}, 0.25)`,
            }}>

                {/* ── topbar ── */}
                <header className="topbar">
                    <div className="tb-l">
                        <button className="back-btn" onClick={() => router.push('/')}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
                            Scoreboard
                        </button>
                        <div className="tsep" />
                        {/* Team logo in topbar */}
                        <TeamLogo team={myTeam} size={55} fontSize="0.95rem" />
                        <div className="team-name-hdr">{myTeam?.name || `Team ${teamId}`}</div>
                        {myTeam?.owner_name && (
                            <div style={{ fontFamily: 'var(--fu)', fontSize: '0.68rem', letterSpacing: '1px', color: 'var(--muted)' }}>
                                {myTeam.owner_name}
                            </div>
                        )}
                    </div>
                    <div className="tb-r">
                        <div className="wallet-chip">{fmtFull(myTeam?.wallet)}</div>
                        <div className="conn-row">
                            <div className="conn-dot" style={{ background: connected ? 'var(--green)' : 'var(--red)' }} />
                            <div className="conn-lbl">{connected ? 'Live' : 'Offline'}</div>
                        </div>
                    </div>
                </header>

                {/* ── on the block panel ── */}
                {isActive && currentPlayer ? (() => {
                    const cls = normaliseClass(currentPlayer.cls)
                    const glow = CLASS_GLOW[cls] || CLASS_GLOW.other
                    const clsCfg = classCfg(currentPlayer.cls)
                    const ps = posStyle(currentPlayer.position)
                    return (
                        <div className="live-strip" style={{ borderLeft: `3px solid ${clsCfg.color}` }}>
                            <div className="otb-inner">

                                {/* photo */}
                                <div className="otb-photo-wrap">
                                    <img
                                        src={currentPlayer.photo_url || `/images/players/${currentPlayer.id}.jpg`}
                                        alt=""
                                        className="otb-photo"
                                        onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
                                    />
                                    <div className="otb-photo-fallback" style={{ display: 'none' }}>
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>
                                    </div>
                                    {/* class colour strip at bottom of photo */}
                                    <div className="otb-class-strip" style={{ background: clsCfg.color, opacity: 0.7 }} />
                                </div>

                                {/* player info */}
                                <div className="otb-center">
                                    <div className="otb-eyebrow">
                                        <div className="otb-live-pill">
                                            <div className="otb-live-dot" />
                                            <div className="otb-live-lbl">Live</div>
                                        </div>
                                        <div className="otb-eyebrow-txt">On the Block</div>
                                    </div>
                                    <div className="otb-name">{currentPlayer.name}</div>
                                    <div className="otb-badges">
                                        <PosBadge position={currentPlayer.position} />
                                        <ClassBadge cls={currentPlayer.cls} />
                                        {currentPlayer.base_price && (
                                            <span style={{ fontFamily: 'var(--fu)', fontSize: '0.65rem', letterSpacing: '2px', color: 'var(--sub)', textTransform: 'uppercase' }}>
                                                Base&nbsp;{fmt(currentPlayer.base_price)}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* bid */}
                                <div className="otb-bid">
                                    <div className="otb-bid-lbl">Current Bid</div>
                                    <div className="otb-bid-amt" style={{ color: isMyBid ? 'var(--acc)' : 'var(--acc)', textShadow: isMyBid ? '0 0 20px rgba(255,215,0,0.4)' : 'none' }}>
                                        {astate?.current_bid ? fmtFull(astate.current_bid) : fmtFull(currentPlayer?.base_price)}
                                    </div>
                                    {astate?.current_bid_team_id ? (
                                        <div className={`otb-bid-team ${isMyBid ? 'mine' : 'other'}`}>
                                            {isMyBid ? '▲ YOUR BID LEADING' : allTeams.find(t => t.id === astate.current_bid_team_id)?.name || 'Another team'}
                                        </div>
                                    ) : (
                                        <div style={{ fontFamily: 'var(--fu)', fontSize: '0.62rem', letterSpacing: '2px', color: 'var(--muted)' }}>No bids yet</div>
                                    )}
                                </div>

                            </div>
                        </div>
                    )
                })() : (
                    <div className="no-live">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                        {astate?.phase === 'paused' ? 'Auction paused' : 'Waiting for next player'}
                    </div>
                )}

                {/* ── tabs ── */}
                <div className="tabs">
                    {[
                        { key: 'squad', label: 'Squad' },
                        { key: 'watchlist', label: 'Watchlist' },
                        { key: 'players', label: 'Players' },
                    ].map(t => (
                        <button key={t.key} className={`tab-btn ${tab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)}>
                            {t.label}
                            <span className="tc">{tabCounts[t.key]}</span>
                        </button>
                    ))}
                </div>

                <div className="body">
                    <div className="main-col">
                        <div className="content">

                            {/* ══ SQUAD ══ */}
                            {tab === 'squad' && (
                                <>
                                    {/* stat cards */}
                                    <div className="sum-grid">
                                        <div className="sum-card">
                                            <div className="sum-lbl">Wallet Left</div>
                                            <div className="sum-val" style={{ color: 'var(--acc)' }}>{fmt(myTeam?.wallet)}</div>
                                        </div>
                                        <div className="sum-card">
                                            <div className="sum-lbl">Max Bid</div>
                                            <div className="sum-val" style={{ color: 'var(--green)' }}>{myTeam ? fmtFull(calcMaxBid(myTeam, normaliseClass(currentPlayer?.cls), squad)) : '—'}</div>
                                            <div style={{ fontFamily: 'var(--fu)', fontSize: '0.6rem', letterSpacing: '1.5px', color: 'var(--muted)' }}>incl. slot reserve</div>
                                        </div>
                                        <div className="sum-card">
                                            <div className="sum-lbl">Players</div>
                                            <div className="sum-val">
                                                {squad.length}
                                                <span style={{ fontFamily: 'var(--fu)', fontSize: '1.1rem', color: 'var(--muted)' }}> / {myTeam?.max_players ?? '—'}</span>
                                            </div>
                                        </div>
                                        <div className="sum-card">
                                            <div className="sum-lbl">Slots Left</div>
                                            <div className="sum-val" style={{ color: slotsLeft <= 2 ? 'var(--orange)' : 'var(--text)' }}>{slotsLeft}</div>
                                        </div>
                                    </div>

                                    {/* wallet bar */}
                                    <div className="wbar">
                                        <div className="wbrow">
                                            <span>Budget Remaining</span>
                                            <span style={{ color: walletPct < 25 ? 'var(--red)' : walletPct < 50 ? 'var(--orange)' : 'var(--text)' }}>{walletPct}%</span>
                                        </div>
                                        <div className="wbtrack">
                                            <div className="wbfill" style={{
                                                width: `${walletPct}%`,
                                                background: walletPct < 25
                                                    ? 'linear-gradient(90deg,var(--red),var(--orange))'
                                                    : walletPct < 50
                                                        ? 'linear-gradient(90deg,var(--orange),var(--acc))'
                                                        : 'linear-gradient(90deg,var(--acc),var(--acc2))',
                                            }} />
                                        </div>
                                    </div>

                                    {/* bid strategy */}
                                    {(() => {
                                        const needs = getRosterNeeds(squad)
                                        const hasNeeds = [...needs.classes, ...needs.positions].some(n => n.need > 0)
                                        return (
                                            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border2)', padding: '18px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                                                <div style={{ fontFamily: 'var(--fu)', fontSize: '0.65rem', letterSpacing: '4px', color: 'var(--sub)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 12 }}>
                                                    Bid Strategy
                                                    <div style={{ flex: 1, height: 1, background: 'var(--border2)' }} />
                                                    {!hasNeeds && (
                                                        <span style={{ color: 'var(--green)', fontSize: '0.62rem', display: 'flex', alignItems: 'center', gap: 5 }}>
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                                                            Roster Complete
                                                        </span>
                                                    )}
                                                </div>

                                                {/* by class */}
                                                <div>
                                                    <div style={{ fontFamily: 'var(--fu)', fontSize: '0.62rem', letterSpacing: '3px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 9 }}>By Class</div>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                        {needs.classes.map(c => (
                                                            <div key={c.key} className="strategy-card" style={{
                                                                background: c.need > 0 ? c.bg : 'rgba(74,222,128,0.05)',
                                                                border: `1px solid ${c.need > 0 ? c.border : 'rgba(74,222,128,0.25)'}`,
                                                            }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                    <span className="strategy-label" style={{ color: c.need > 0 ? c.color : 'var(--green)' }}>{c.label}</span>
                                                                    {c.need === 0
                                                                        ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                                                                        : <span className="strategy-need" style={{ color: c.color }}>Need {c.need}</span>
                                                                    }
                                                                </div>
                                                                <div className="strategy-dots">
                                                                    {Array.from({ length: c.req }).map((_, i) => (
                                                                        <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < c.have ? (c.need > 0 ? c.color : 'var(--green)') : 'rgba(255,255,255,0.08)' }} />
                                                                    ))}
                                                                </div>
                                                                <div className="strategy-sub">{c.have} / {c.req} acquired</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* by position */}
                                                <div>
                                                    <div style={{ fontFamily: 'var(--fu)', fontSize: '0.62rem', letterSpacing: '3px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 9 }}>By Position</div>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                        {needs.positions.map(p => (
                                                            <div key={p.key} className="strategy-card" style={{
                                                                background: p.need > 0 ? p.bg : 'rgba(74,222,128,0.05)',
                                                                border: `1px solid ${p.need > 0 ? p.border : 'rgba(74,222,128,0.25)'}`,
                                                            }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                    <span className="strategy-label" style={{ color: p.need > 0 ? p.text : 'var(--green)' }}>{p.label}</span>
                                                                    {p.need === 0
                                                                        ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                                                                        : <span className="strategy-need" style={{ color: p.text }}>Need {p.need}</span>
                                                                    }
                                                                </div>
                                                                <div className="strategy-dots">
                                                                    {Array.from({ length: p.req }).map((_, i) => (
                                                                        <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < p.have ? (p.need > 0 ? p.text : 'var(--green)') : 'rgba(255,255,255,0.08)' }} />
                                                                    ))}
                                                                </div>
                                                                <div className="strategy-sub">{p.have} / {p.req} acquired</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })()}

                                    {/* squad list */}
                                    {squad.length === 0 ? (
                                        <div className="empty">
                                            <img src="/images/volleyball.png" alt="" width="64" style={{ opacity: 0.08 }} onError={e => e.target.style.display = 'none'} />
                                            <div className="et">NO PLAYERS YET</div>
                                            <div className="es">Acquired players appear here</div>
                                        </div>
                                    ) : (
                                        <>
                                            {/* total spent footer row */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 2px' }}>
                                                <div style={{ fontFamily: 'var(--fu)', fontSize: '0.65rem', letterSpacing: '3px', color: 'var(--muted)', textTransform: 'uppercase' }}>
                                                    {squad.length} player{squad.length !== 1 ? 's' : ''} acquired
                                                </div>
                                                <div style={{ fontFamily: 'var(--fu)', fontSize: '0.65rem', letterSpacing: '2px', color: 'var(--sub)' }}>
                                                    Total spent: <span style={{ color: 'var(--acc)', fontFamily: 'var(--fd)', fontSize: '0.95rem' }}>{fmtFull(totalSpent)}</span>
                                                </div>
                                            </div>
                                            {Object.entries(squadByPos).map(([pos, group]) => {
                                                const ps = POS_STYLE[pos]
                                                return (
                                                    <div key={pos}>
                                                        <div className="pos-hdr">
                                                            <span style={{ background: ps.bg, border: `1px solid ${ps.border}`, color: ps.text, fontFamily: 'var(--fu)', fontSize: '0.62rem', letterSpacing: '3px', textTransform: 'uppercase', padding: '3px 10px' }}>{ps.label}</span>
                                                            <span style={{ fontFamily: 'var(--fu)', fontSize: '0.6rem', letterSpacing: '2px', color: 'var(--acc)' }}>{group.length}</span>
                                                            <div className="pos-line" />
                                                        </div>
                                                        <div className="pos-sec">
                                                            {group.map(p => (
                                                                <div key={p.id} className="sq-row">
                                                                    <img className="sq-photo" src={p.photo_url || `/images/players/${p.id}.jpg`} alt={p.name} onError={e => e.target.style.background = 'var(--bg-panel)'} />
                                                                    <div className="sq-info">
                                                                        <div className="sq-name">{p.name}</div>
                                                                        <div style={{ display: 'flex', gap: 6 }}><ClassBadge cls={p.cls} /></div>
                                                                        {p.college && <div className="sq-meta">{p.college}</div>}
                                                                    </div>
                                                                    <div className="sq-price" style={{ color: normaliseClass(p.cls) === 'diamond' ? '#67E8F9' : 'var(--acc)' }}>{normaliseClass(p.cls) === 'diamond' ? 'Retained' : fmt(p.sold_price)}</div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </>
                                    )}
                                </>
                            )}

                            {/* ══ WATCHLIST ══ */}
                            {tab === 'watchlist' && (
                                <>
                                    {watchlist.length === 0 ? (
                                        <div className="wl-empty">
                                            <svg className="wl-empty-icon" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                            </svg>
                                            <div className="wl-empty-t">NO PLAYERS STARRED</div>
                                            <div className="wl-empty-s">Star players from the Players tab<br />to track them here</div>
                                            <button className="wl-go-btn" onClick={() => setTab('players')}>
                                                Browse Players
                                                <svg style={{ marginLeft: 7, verticalAlign: 'middle' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                                                <span style={{ fontFamily: 'var(--fu)', fontSize: '0.65rem', letterSpacing: '5px', color: 'var(--muted)', textTransform: 'uppercase' }}>Watchlist</span>
                                                <span style={{ fontFamily: 'var(--fu)', fontSize: '0.65rem', letterSpacing: '2px', color: 'var(--acc)' }}>{watchlist.length}</span>
                                                <div style={{ flex: 1, height: 1, background: 'var(--border2)' }} />
                                            </div>
                                            {watchlist.map(p => (
                                                <WatchRow
                                                    key={p.id}
                                                    player={p}
                                                    currentPlayerId={astate?.current_player_id}
                                                    allTeams={allTeams}
                                                    onRemove={() => toggleWatch(p.id)}
                                                />
                                            ))}
                                        </>
                                    )}
                                </>
                            )}

                            {/* ══ PLAYERS ══ */}
                            {tab === 'players' && (
                                <>
                                    {/* dual filter rows */}
                                    <div className="filter-row">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div className="filter-label">Position</div>
                                            <div className="pos-filter">
                                                {[
                                                    { key: 'all', label: 'All' },
                                                    { key: 'spiker', label: 'Spiker' },
                                                    { key: 'setter', label: 'Setter' },
                                                    { key: 'libero', label: 'Lifter', last: true },
                                                ].map(p => (
                                                    <button
                                                        key={p.key}
                                                        className={`pf-btn ${p.last ? 'last' : ''} ${posFilter === p.key ? 'on' : ''}`}
                                                        onClick={() => setPosFilter(p.key)}
                                                    >{p.label}</button>
                                                ))}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div className="filter-label">Class</div>
                                            <div className="cls-filter">
                                                {[
                                                    { key: 'all', label: 'All', activeClass: 'on' },
                                                    { key: 'gold', label: 'Gold', activeClass: 'on-gold' },
                                                    { key: 'silver', label: 'Silver', activeClass: 'on-silver' },
                                                    { key: 'diamond', label: 'Diamond', activeClass: 'on-diamond', last: true },
                                                ].map(c => (
                                                    <button
                                                        key={c.key}
                                                        className={`pf-btn ${c.last ? 'last' : ''} ${clsFilter === c.key ? c.activeClass : ''}`}
                                                        onClick={() => setClsFilter(c.key)}
                                                    >{c.label}</button>
                                                ))}
                                            </div>
                                            <div style={{ marginLeft: 'auto', fontFamily: 'var(--fu)', fontSize: '0.62rem', letterSpacing: '2px', color: 'var(--muted)' }}>
                                                {filteredAv.length} players
                                            </div>
                                        </div>
                                    </div>

                                    {filteredAv.length === 0 ? (
                                        <div className="empty"><div className="et">NO PLAYERS</div><div className="es">All players in this category have been sold</div></div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                                            {Object.entries(avByPos).map(([pos, group]) => {
                                                const ps = POS_STYLE[pos]
                                                return (
                                                    <div key={pos}>
                                                        <div className="pos-hdr">
                                                            <span style={{ background: ps.bg, border: `1px solid ${ps.border}`, color: ps.text, fontFamily: 'var(--fu)', fontSize: '0.62rem', letterSpacing: '3px', textTransform: 'uppercase', padding: '3px 10px' }}>{ps.label}</span>
                                                            <span style={{ fontFamily: 'var(--fu)', fontSize: '0.6rem', letterSpacing: '2px', color: 'var(--acc)' }}>{group.length}</span>
                                                            <div className="pos-line" />
                                                        </div>
                                                        <div className="av-grid">
                                                            {group.map(p => (
                                                                <AvailCard
                                                                    key={p.id}
                                                                    player={p}
                                                                    watched={watchIds.includes(p.id)}
                                                                    onStar={() => toggleWatch(p.id)}
                                                                    isOnBlock={p.id === astate?.current_player_id}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </>
                            )}

                        </div>
                    </div>

                    {/* ── sidebar ── */}
                    <div className="sidebar">
                        <div className="sb-hdr">All Teams</div>
                        <div className="sb-list">
                            {[...allTeams].sort((a, b) => b.wallet - a.wallet).map((t, i) => {
                                const isMe = String(t.id) === String(teamId)
                                const pct = Math.min(100, Math.round((t.wallet / STARTING_WALLET) * 100))
                                return (
                                    <div key={t.id} className={`sb-tr ${isMe ? 'me' : ''}`} style={{
                                        transition: 'all 0.4s ease',
                                        ...(isMe ? {
                                            background: `linear-gradient(90deg, rgba(${hexToRgb(teamColour(t.id))}, 0.25), #000000)`,
                                            border: `1px solid rgba(${hexToRgb(teamColour(t.id))}, 0.4)`,
                                            boxShadow: `0 0 20px rgba(${hexToRgb(teamColour(t.id))}, 0.3)`
                                        } : {})
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                            {/* rank number */}
                                            <div style={{ fontFamily: 'var(--fd)', fontSize: '0.85rem', color: i === 0 ? 'var(--acc)' : 'var(--muted)', width: 16, flexShrink: 0, textAlign: 'center', lineHeight: 1 }}>{i + 1}</div>
                                            {/* team logo */}
                                            <TeamLogo team={t} size={28} fontSize="0.8rem" />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                                                    <div className={`sb-trn ${isMe ? 'me' : ''}`} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                                                    {isMe && <div className="sb-you">You</div>}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                                                    <div className="sb-trp">{t.players_bought ?? 0}/{t.max_players ?? '—'} players</div>
                                                    <div className={`sb-trw ${isMe ? 'me' : ''}`}>{fmt(t.wallet)}</div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="sb-bar">
                                            <div className="sb-fill" style={{ width: `${pct}%`, background: isMe ? 'linear-gradient(90deg,var(--acc),var(--acc2))' : i === 0 ? 'rgba(255,215,0,0.35)' : 'rgba(255,255,255,0.12)' }} />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div >
        </>
    )
}