'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const fmt = (n) => (n == null ? '—' : n >= 1000 ? `₹${(n / 1000).toFixed(1)}K` : `₹${n}`)
const fmtFull = (n) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN')}`)

const POS_COLOR = {
    setter: { bg: 'rgba(234,179,8,0.14)', border: 'rgba(234,179,8,0.5)', text: '#FCD34D' },
    libero: { bg: 'rgba(6,182,212,0.14)', border: 'rgba(6,182,212,0.5)', text: '#22D3EE' },
    outside: { bg: 'rgba(249,115,22,0.14)', border: 'rgba(249,115,22,0.5)', text: '#FB923C' },
    middle: { bg: 'rgba(168,85,247,0.14)', border: 'rgba(168,85,247,0.5)', text: '#C084FC' },
    opposite: { bg: 'rgba(34,197,94,0.14)', border: 'rgba(34,197,94,0.5)', text: '#4ADE80' },
}
const posStyle = (pos) => POS_COLOR[pos?.toLowerCase()] || { bg: 'rgba(255,215,0,0.1)', border: 'rgba(255,215,0,0.3)', text: '#FCD34D' }

// ── Keyboard → Team mapping ───────────────────────────────────────────────
const TEAM_KEY_MAP = {
    'l': 'ace lions',
    'd': 'agile dolphins',
    'p': 'ferocious panthers',
    'b': 'powerhouse bulls',
    's': 'spikey pirhanas',
    'h': 'block hawks',
}

const normaliseClass = (cls) => {
    if (!cls) return 'other'
    const c = cls.toLowerCase()
    if (c.includes('diamond') || c === 'a') return 'diamond'
    if (c.includes('gold') || c === 'b') return 'gold'
    if (c.includes('silver') || c === 'c') return 'silver'
    return 'other'
}

// ── Max bid logic ─────────────────────────────────────────────────────────
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

// ── Btn ───────────────────────────────────────────────────────────────────
function Btn({ label, onClick, variant = 'default', disabled, loading, icon, full }) {
    const V = {
        default: { bg: 'var(--bg-panel)', b: 'var(--border2)', c: 'var(--sub)', hb: 'rgba(255,255,255,0.05)', hbr: 'rgba(255,255,255,0.12)' },
        primary: { bg: '#FFD700', b: '#FFD700', c: '#070A10', hb: '#FFDF30', hbr: '#FFDF30' },
        success: { bg: 'rgba(74,222,128,0.1)', b: 'rgba(74,222,128,0.35)', c: '#4ADE80', hb: 'rgba(74,222,128,0.18)', hbr: 'rgba(74,222,128,0.55)' },
        danger: { bg: 'rgba(248,113,113,0.1)', b: 'rgba(248,113,113,0.3)', c: '#F87171', hb: 'rgba(248,113,113,0.18)', hbr: 'rgba(248,113,113,0.5)' },
        warning: { bg: 'rgba(251,146,60,0.1)', b: 'rgba(251,146,60,0.35)', c: '#FB923C', hb: 'rgba(251,146,60,0.18)', hbr: 'rgba(251,146,60,0.55)' },
        ghost: { bg: 'transparent', b: 'var(--border2)', c: 'var(--muted)', hb: 'var(--bg-card)', hbr: 'rgba(255,255,255,0.1)' },
    }
    const v = V[variant] || V.default
    const [h, setH] = useState(false)
    return (
        <button
            onClick={onClick} disabled={disabled || loading}
            onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
            style={{
                fontFamily: 'var(--fu)', fontSize: '0.7rem', letterSpacing: '2px', textTransform: 'uppercase',
                padding: '10px 18px', border: `1px solid ${h && !disabled && !loading ? v.hbr : v.b}`,
                background: h && !disabled && !loading ? v.hb : v.bg,
                color: disabled || loading ? 'var(--muted)' : v.c,
                cursor: disabled || loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.15s',
                opacity: disabled ? 0.4 : 1, whiteSpace: 'nowrap',
                width: full ? '100%' : undefined, justifyContent: full ? 'center' : undefined,
            }}
        >
            {loading
                ? <span style={{ width: 13, height: 13, border: '1.5px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                : icon}
            {label}
        </button>
    )
}

// ── section label ─────────────────────────────────────────────────────────
function SL({ children }) {
    return (
        <div style={{ fontFamily: 'var(--fu)', fontSize: '0.58rem', letterSpacing: '4px', color: 'var(--muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid var(--border2)' }}>
            {children}
        </div>
    )
}

// ═══════════════════════════════════════════════════════════════════════════
const supabase = createClient()

export default function AdminDashboard() {
    const router = useRouter()

    const [astate, setAstate] = useState(null)
    const [allTeams, setAllTeams] = useState([])
    const [allPlayers, setAllPlayers] = useState([])
    const [connected, setConnected] = useState(false)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState({})
    const [poolFilter, setPoolFilter] = useState('available')

    // manual bid controls
    const [bidAmount, setBidAmount] = useState('')
    const [winTeamId, setWinTeamId] = useState('')

    const [toast, setToast] = useState(null)
    const toastRef = useRef(null)
    const [showResetConfirm, setShowResetConfirm] = useState(false)
    const [resetPreview, setResetPreview] = useState(null)   // data from /auction/reset-preview
    const [undoPreview, setUndoPreview] = useState(null)     // data from /auction/undo-preview
    const [showUndoConfirm, setShowUndoConfirm] = useState(false)
    const resetInputRef = useRef(null)

    // keyboard bid flash feedback
    const [kbFlash, setKbFlash] = useState(null) // { teamId, key }
    const kbFlashRef = useRef(null)
    const [kbBlocked, setKbBlocked] = useState(null) // { teamId } — quota/wallet block
    const kbBlockedRef = useRef(null)
    const kbBusyRef = useRef(false) // debounce rapid keypresses
    const isActiveRef = useRef(false) // ref so keydown handler always sees current value

    // Refs so Enter/Space/1-5 handlers always see current values without stale closures
    const bidAmountRef = useRef('')
    const winTeamIdRef = useRef('')
    const astateRef = useRef(null)
    const allTeamsRef = useRef([])
    const allPlayersRef = useRef([])
    const bidWarningRef = useRef(null)
    const doActionRef = useRef(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchPreview, setSearchPreview] = useState(null) // player object being previewed
    const searchInputRef = useRef(null)

    const showToast = useCallback((msg, type = 'info') => {
        setToast({ msg, type })
        clearTimeout(toastRef.current)
        toastRef.current = setTimeout(() => setToast(null), 3200)
    }, [])

    // ── fetch ──────────────────────────────────────────────────────────────
    const fetchAll = useCallback(async () => {
        try {
            const [sr, pr] = await Promise.all([
                fetch(`${API}/auction/state`),
                fetch(`${API}/players/`),
            ])
            if (sr.ok) { const d = await sr.json(); setAstate(d); setAllTeams(d.teams || []) }
            if (pr.ok) setAllPlayers(await pr.json())
        } catch { }
    }, [])

    useEffect(() => { fetchAll().finally(() => setLoading(false)) }, [])

    // reset bid controls when player changes -- seed amount with current bid or base price
    useEffect(() => {
        if (astate?.current_player) {
            setBidAmount(String(astate.current_bid || astate.current_player.base_price || ''))
            // clear search state once a player is on the block
            setSearchPreview(null)
            setSearchQuery('')
        } else {
            setBidAmount('')
        }
        setWinTeamId('')
    }, [astate?.current_player_id])

    // ── Fast direct Supabase reads for realtime callbacks ────────────────
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
        } catch (err) { console.error('Admin fast refresh error:', err) }
    }, [])

    const fastRefreshPlayers = useCallback(async () => {
        try {
            const { data } = await supabase.from('players').select('*')
            setAllPlayers((data || []).map(p => ({ ...p, cls: p.class, sold_price: p.sold_amount })))
        } catch (err) { console.error('Admin fast players refresh error:', err) }
    }, [])

    // ── realtime ───────────────────────────────────────────────────────────
    useEffect(() => {
        const ch = supabase.channel('admin-realtime')
            // broadcast: instant bid updates from keyboard handler
            .on('broadcast', { event: 'bid' }, ({ payload }) => {
                setAstate(prev => prev ? {
                    ...prev,
                    current_bid: payload.current_bid,
                    current_bid_team: payload.current_bid_team,
                    current_bid_team_id: payload.current_bid_team_id,
                } : prev)
                setBidAmount(String(payload.current_bid))
                setWinTeamId(payload.current_bid_team_id)
            })
            // postgres_changes: fallback sync for non-bid state changes
            .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_state' },
                () => fastRefreshAuction())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' },
                () => fastRefreshAuction())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'players' },
                () => { fastRefreshAuction(); fastRefreshPlayers() })
            .on('system', {}, p => setConnected(p.status === 'SUBSCRIBED'))
            .subscribe(s => setConnected(s === 'SUBSCRIBED'))
        return () => supabase.removeChannel(ch)
    }, [fastRefreshAuction, fastRefreshPlayers])

    // ── actions ────────────────────────────────────────────────────────────
    const doAction = async (key, path, body = {}) => {
        setBusy(b => ({ ...b, [key]: true }))
        try {
            const r = await fetch(`${API}${path}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const d = await r.json()
            if (!r.ok) showToast(d.detail || `${key} failed`, 'error')
            else { showToast(d.message || `Done`, 'success'); fetchAll() }
        } catch { showToast('Network error', 'error') }
        finally { setBusy(b => ({ ...b, [key]: false })) }
    }
    doActionRef.current = doAction

    const pullPlayer = () => {
        if (searchPreview) {
            doAction('pull', '/auction/pull-player', { override_player_id: searchPreview.id })
        } else {
            doAction('pull', '/auction/pull-player')
        }
    }

    // ── Broadcast channel ref ─────────────────────────────────────────────
    const broadcastChannelRef = useRef(null)

    useEffect(() => {
        const ch = supabase.channel('bid-broadcast', { config: { broadcast: { self: false } } })
        ch.subscribe()
        broadcastChannelRef.current = ch
        return () => { supabase.removeChannel(ch) }
    }, [])

    // Send bid state to all clients instantly via WebSocket broadcast
    const broadcastBid = useCallback((teamId, amount) => {
        broadcastChannelRef.current?.send({
            type: 'broadcast',
            event: 'bid',
            payload: {
                current_bid: amount,
                current_bid_team: teamId,
                current_bid_team_id: teamId,
                current_player_id: astate?.current_player_id,
                phase: 'active',
            }
        })
    }, [astate?.current_player_id])

    // Write to DB — direct Supabase client (no FastAPI round trip)
    const persistBid = useCallback(async (teamId, amount) => {
        try {
            const { error } = await supabase.from('auction_state').update({
                current_bid: amount,
                current_bid_team: teamId,
            }).eq('id', 1)
            if (error) throw error
            // also log to bids table (best-effort)
            await supabase.from('bids').insert({
                player_id: astate?.current_player_id,
                team_id: teamId,
                amount,
            }).then(() => { }).catch(() => { })
        } catch (err) {
            console.error('[persistBid] Supabase write failed, falling back to FastAPI:', err)
            // Fallback: FastAPI handles validation + write
            await fetch(`${API}/auction/assign-opening-bid`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ team_id: teamId, amount }),
            }).catch(() => { })
        }
    }, [astate?.current_player_id])

    // ── Keyboard bid increment ─────────────────────────────────────────────
    const getKbIncrement = useCallback((cls, currentBid) => {
        const c = normaliseClass(cls)
        if (c === 'gold') return currentBid < 50000 ? 2000 : 5000
        if (c === 'silver') return currentBid < 30000 ? 1000 : 2000
        return 1000 // diamond / other: safe fallback
    }, [])

    // Fixed increment map for keys 1-5
    const FIXED_INC_MAP = { '1': 1000, '2': 2000, '3': 3000, '4': 4000, '5': 5000 }

    useEffect(() => {
        const handler = async (e) => {
            if (!isActiveRef.current) return

            // Never steal keypresses when the search input is focused
            if (document.activeElement === searchInputRef.current) return

            const key = e.key.toLowerCase()
            const rawKey = e.key // preserve case for digit detection

            // ── Enter → Confirm Sold ───────────────────────────────────────
            if (e.key === 'Enter') {
                e.preventDefault()
                const tid = winTeamIdRef.current
                const amt = parseInt(bidAmountRef.current)
                if (!tid || !amt) { showToast('Select team and enter bid amount first', 'error'); return }
                // Re-read astate from ref to avoid stale closure
                const snap = astateRef.current
                doActionRef.current('sold', '/auction/sold', {
                    player_id: snap?.current_player_id,
                    team_id: tid,
                    amount: amt,
                })
                return
            }

            // ── Space → Update Bid ─────────────────────────────────────────
            if (e.key === ' ') {
                e.preventDefault()
                const tid = winTeamIdRef.current
                const amt = parseInt(bidAmountRef.current)
                if (!tid) { showToast('Select a team first', 'error'); return }
                if (!amt || isNaN(amt)) { showToast('Enter a valid bid amount', 'error'); return }
                if (bidWarningRef.current) { showToast(bidWarningRef.current, 'error'); return }
                doActionRef.current('updatebid', '/auction/assign-opening-bid', {
                    team_id: tid, amount: amt,
                })
                return
            }

            // ── 1-5 → Fixed increment on selected team ─────────────────────
            const fixedInc = FIXED_INC_MAP[rawKey]
            if (fixedInc) {
                e.preventDefault()
                const tid = winTeamIdRef.current
                if (!tid) { showToast('Select a team first to use increment keys', 'error'); return }
                if (kbBusyRef.current) return
                kbBusyRef.current = true

                const snap = astateRef.current
                const teams = allTeamsRef.current
                const players = allPlayersRef.current
                const team = teams.find(t => t.id === tid)
                if (!team) { kbBusyRef.current = false; return }

                const currentBid = snap?.current_bid || snap?.current_player?.base_price || 0
                const cls = snap?.current_player?.cls
                const newBid = currentBid + fixedInc

                // All block checks
                const tSquad = players.filter(p => p.status === 'sold' && p.sold_to_team === team.id)
                const fireBlocked = (reason) => {
                    setKbBlocked({ teamId: team.id })
                    clearTimeout(kbBlockedRef.current)
                    kbBlockedRef.current = setTimeout(() => setKbBlocked(null), 600)
                    showToast(`${team.name} — ${reason}`, 'error')
                    kbBusyRef.current = false
                }
                const MAX_SQUAD = team.max_players ?? 8
                if ((team.players_bought ?? 0) >= MAX_SQUAD) { fireBlocked('squad full (8/8)'); return }
                const currentClass = normaliseClass(cls)
                if (currentClass === 'gold' && tSquad.filter(p => normaliseClass(p.cls) === 'gold').length >= 2) { fireBlocked('gold quota full (2/2)'); return }
                if (currentClass === 'silver' && tSquad.filter(p => normaliseClass(p.cls) === 'silver').length >= 5) { fireBlocked('silver quota full (5/5)'); return }
                const maxSafe = calcMaxBid(team, currentClass, tSquad)
                if (newBid > maxSafe) { fireBlocked(`max bid reached (${fmtFull(maxSafe)})`); return }

                // Only update local bid input — admin presses Space to commit
                setBidAmount(String(newBid))
                kbBusyRef.current = false
                return
            }

            // ── Team letter keys → bid increment for that team ─────────────
            const teamNameFragment = TEAM_KEY_MAP[key]
            if (!teamNameFragment) return

            const team = allTeamsRef.current.find(t => t.name.toLowerCase() === teamNameFragment)
            if (!team) return

            if (kbBusyRef.current) return
            kbBusyRef.current = true

            const snap = astateRef.current
            const players = allPlayersRef.current
            const currentBid = snap?.current_bid || snap?.current_player?.base_price || 0
            const cls = snap?.current_player?.cls
            const inc = getKbIncrement(cls, currentBid)
            const newBid = currentBid + inc

            // All block checks
            const tSquad = players.filter(p => p.status === 'sold' && p.sold_to_team === team.id)
            const fireBlocked = (reason) => {
                setKbBlocked({ teamId: team.id })
                clearTimeout(kbBlockedRef.current)
                kbBlockedRef.current = setTimeout(() => setKbBlocked(null), 600)
                showToast(`${team.name} — ${reason}`, 'error')
                kbBusyRef.current = false
            }
            const MAX_SQUAD = team.max_players ?? 8
            if ((team.players_bought ?? 0) >= MAX_SQUAD) { fireBlocked('squad full (8/8)'); return }
            const currentClass = normaliseClass(cls)
            if (currentClass === 'gold' && tSquad.filter(p => normaliseClass(p.cls) === 'gold').length >= 2) { fireBlocked('gold quota full (2/2)'); return }
            if (currentClass === 'silver' && tSquad.filter(p => normaliseClass(p.cls) === 'silver').length >= 5) { fireBlocked('silver quota full (5/5)'); return }
            const maxSafe = calcMaxBid(team, currentClass, tSquad)
            if (newBid > maxSafe) { fireBlocked(`max bid reached (${fmtFull(maxSafe)})`); return }

            // Flash + update
            setKbFlash({ teamId: team.id, key: key.toUpperCase() })
            clearTimeout(kbFlashRef.current)
            kbFlashRef.current = setTimeout(() => setKbFlash(null), 600)
            setBidAmount(String(newBid))
            setWinTeamId(team.id)
            broadcastBid(team.id, newBid)
            persistBid(team.id, newBid).finally(() => { kbBusyRef.current = false })
        }

        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [showToast, getKbIncrement, broadcastBid, persistBid])
    const markUnsold = () => doAction('unsold', '/auction/unsold')

    // ── Undo: fetch preview first, show confirm, then fire ─────────────────
    const openUndoConfirm = async () => {
        setBusy(b => ({ ...b, undopreview: true }))
        try {
            const r = await fetch(`${API}/auction/undo-preview`)
            const d = await r.json()
            setUndoPreview(d)
            setShowUndoConfirm(true)
        } catch { showToast('Could not fetch undo info', 'error') }
        finally { setBusy(b => ({ ...b, undopreview: false })) }
    }

    const confirmUndo = async () => {
        setShowUndoConfirm(false)
        setBusy(b => ({ ...b, undo: true }))
        try {
            const r = await fetch(`${API}/auction/undo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
            const d = await r.json()
            if (!r.ok || !d.ok) showToast(d.detail || d.error || 'Undo failed', 'error')
            else { showToast('Action undone', 'success'); fetchAll() }
        } catch { showToast('Network error', 'error') }
        finally { setBusy(b => ({ ...b, undo: false })) }
    }

    // ── Reset: fetch preview first, show confirm modal with live stats ──────
    const openResetConfirm = async () => {
        setBusy(b => ({ ...b, resetpreview: true }))
        try {
            const r = await fetch(`${API}/auction/reset-preview`)
            const d = await r.json()
            setResetPreview(d)
            setShowResetConfirm(true)
        } catch { showToast('Could not fetch reset info', 'error') }
        finally { setBusy(b => ({ ...b, resetpreview: false })) }
    }

    const confirmReset = async () => {
        setShowResetConfirm(false)
        setResetPreview(null)
        setBusy(b => ({ ...b, reset: true }))
        try {
            const r = await fetch(`${API}/auction/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
            const d = await r.json()
            if (!r.ok || !d.ok) showToast(d.detail || d.error || 'Reset failed', 'error')
            else { showToast('Auction reset', 'success'); fetchAll() }
        } catch { showToast('Network error', 'error') }
        finally { setBusy(b => ({ ...b, reset: false })) }
    }
    const togglePause = () => doAction('pause', '/auction/pause', { paused: !isPaused })

    // Smart increment: returns next valid increment based on class + current bid
    const getIncrements = () => {
        const cur = parseInt(bidAmount) || astate?.current_bid || 0
        if (currentClass === 'gold') {
            return cur < 50000 ? [2000, 5000] : [5000, 10000]
        }
        if (currentClass === 'silver') {
            return cur < 30000 ? [1000, 2000] : [2000, 5000]
        }
        return [1000, 2000, 5000]
    }
    const applyIncrement = (inc) => {
        const cur = parseInt(bidAmount) || astate?.current_bid || currentPlayer?.base_price || 0
        setBidAmount(String(cur + inc))
    }

    const updateBid = () => {
        const amt = parseInt(bidAmount)
        if (!amt || isNaN(amt)) { showToast('Enter a valid amount', 'error'); return }
        if (!winTeamId) { showToast('Select the leading team', 'error'); return }
        const t = allTeams.find(x => x.id === winTeamId)
        if (t && amt > t.wallet) { showToast(`Exceeds ${t.name}'s wallet`, 'error'); return }
        const tSquad = allPlayers.filter(p => p.status === 'sold' && p.sold_to_team === t.id)
        if (t && amt > calcMaxBid(t, currentClass, tSquad)) { showToast(`Exceeds ${t.name}'s max safe bid of ${fmtFull(calcMaxBid(t, currentClass, tSquad))}`, 'error'); return }
        doAction('updatebid', '/auction/assign-opening-bid', {
            team_id: winTeamId, amount: amt,
        })
    }

    const confirmSold = () => {
        if (!winTeamId) { showToast('Select the winning team', 'error'); return }
        const amt = parseInt(bidAmount) || astate?.current_bid || astate?.current_player?.base_price
        if (!amt) { showToast('Enter the final bid amount', 'error'); return }
        doAction('sold', '/auction/sold', {
            player_id: astate?.current_player_id,
            team_id: winTeamId,
            amount: amt,
        })
    }

    // ── derived ────────────────────────────────────────────────────────────
    const phase = astate?.phase || 'idle'
    const isActive = phase === 'active'
    const isPaused = phase === 'paused'
    const isIdle = phase === 'idle'
    isActiveRef.current = isActive
    const currentPlayer = astate?.current_player
    const leadingTeam = allTeams.find(t => t.id === astate?.current_bid_team_id)

    // Keep refs in sync so keyboard handlers never read stale state
    astateRef.current = astate
    allTeamsRef.current = allTeams
    allPlayersRef.current = allPlayers
    bidAmountRef.current = bidAmount
    winTeamIdRef.current = winTeamId

    const poolPlayers = allPlayers.filter(p =>
        poolFilter === 'available' ? p.status === 'upcoming'
            : poolFilter === 'unsold' ? p.status === 'unsold'
                : p.status === 'sold'
    )

    const selectedTeam = allTeams.find(t => String(t.id) === String(winTeamId))

    // class quota per team built from sold players, no extra API call
    const teamClassCounts = allTeams.reduce((acc, t) => {
        acc[t.id] = {
            gold: allPlayers.filter(p => p.status === 'sold' && p.sold_to_team === t.id && normaliseClass(p.cls) === 'gold').length,
            silver: allPlayers.filter(p => p.status === 'sold' && p.sold_to_team === t.id && normaliseClass(p.cls) === 'silver').length,
        }
        return acc
    }, {})

    const currentClass = normaliseClass(currentPlayer?.cls)

    const isTeamClassLocked = (teamId) => {
        if (!currentPlayer) return false
        const counts = teamClassCounts[teamId] || {}
        if (currentClass === 'gold' && counts.gold >= 2) return true
        if (currentClass === 'silver' && counts.silver >= 5) return true
        return false
    }

    // ── bid validation ────────────────────────────────────────────────────────
    const bidAmt = parseInt(bidAmount) || 0
    const bidWarning = (() => {
        if (!winTeamId || !bidAmt) return null
        const t = allTeams.find(x => x.id === winTeamId)
        if (!t) return null
        if (bidAmt > t.wallet) return `Exceeds ${t.name}'s wallet (${fmtFull(t.wallet)})`
        const tSq = allPlayers.filter(p => p.status === 'sold' && p.sold_to_team === t.id)
        const currentBid = astate?.current_bid || 0
        if (bidAmt <= currentBid) return `Bid must be higher than current bid (${fmtFull(currentBid)})`
        if (bidAmt > calcMaxBid(t, currentClass, tSq)) return `Exceeds ${t.name}'s max safe bid (${fmtFull(calcMaxBid(t, currentClass, tSq))}) — not enough left`
        return null
    })()
    bidWarningRef.current = bidWarning

    if (loading) return (
        <div style={{ minHeight: '100vh', background: '#060810', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}>
            <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Libre+Franklin:wght@400;600;700;800;900&family=Barlow+Condensed:wght@400;600;700&display=swap'); @keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(255,215,0,0.1)', borderTopColor: '#FFD700', animation: 'spin 0.8s linear infinite' }} />
        </div>
    )

    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Libre+Franklin:wght@400;600;700;800;900&family=Barlow+Condensed:wght@300;400;600;700&family=Barlow:wght@400;500&family=JetBrains+Mono:wght@400&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        :root{
          --bg:#060810; --bg-card:#0B0E18; --bg-panel:#0F1320; --bg-input:#070910;
          --acc:#FFD700; --acc2:#FF6B35; --green:#4ADE80; --red:#F87171; --orange:#FB923C;
          --border:rgba(255,215,0,0.09); --border2:rgba(255,255,255,0.07);
          --text:#EEF2FF; --sub:#9CA3AF; --muted:#4B5563;
          --fd:'Bebas Neue',sans-serif; --fu:'Libre Franklin',sans-serif; --mono:'JetBrains Mono',monospace;
        }
        html,body{height:100%;background:var(--bg);color:var(--text);overflow:hidden}
        ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-thumb{background:rgba(255,215,0,0.12);border-radius:2px}
        body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;
          background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,0.007) 2px,rgba(255,255,255,0.007) 4px)}
        @keyframes spin    {to{transform:rotate(360deg)}}
        @keyframes fadeUp  {from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse   {0%,100%{box-shadow:0 0 0 0 rgba(74,222,128,.5)}70%{box-shadow:0 0 0 6px rgba(74,222,128,0)}}
        @keyframes rpulse  {0%,100%{box-shadow:0 0 0 0 rgba(248,113,113,.5)}70%{box-shadow:0 0 0 6px rgba(248,113,113,0)}}
        @keyframes toastIn {from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:translateX(0)}}

        .root{position:relative;z-index:1;display:flex;flex-direction:column;height:100vh}

        /* topbar */
        .topbar{display:flex;align-items:center;justify-content:space-between;padding:0 24px;height:50px;border-bottom:1px solid var(--border);background:rgba(6,8,16,0.97);flex-shrink:0}
        .tb-l{display:flex;align-items:center;gap:16px}
        .tb-r{display:flex;align-items:center;gap:12px}
        .logo{font-family:var(--fd);font-size:1.05rem;letter-spacing:2px;color:var(--text)}
        .ctl-badge{font-family:var(--fu);font-size:0.52rem;letter-spacing:3px;text-transform:uppercase;padding:2px 8px;border:1px solid rgba(255,215,0,0.25);color:var(--acc);background:rgba(255,215,0,0.06)}
        .tb-sep{width:1px;height:20px;background:var(--border2)}
        .phase-pill{display:flex;align-items:center;gap:6px;padding:4px 11px;border:1px solid}
        .ph-dot{width:5px;height:5px;border-radius:50%}
        .ph-label{font-family:var(--fu);font-size:0.6rem;letter-spacing:3px;text-transform:uppercase}
        .conn-row{display:flex;align-items:center;gap:5px}
        .conn-dot{width:6px;height:6px;border-radius:50%}
        .conn-label{font-family:var(--fu);font-size:0.58rem;letter-spacing:2px;color:var(--muted);text-transform:uppercase}

        /* layout */
        .main{display:grid;grid-template-columns:220px 1fr 270px;flex:1;min-height:0}

        /* ── LEFT: player pool ── */
        .col-l{border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden}
        .col-hdr{padding:12px 14px 10px;border-bottom:1px solid var(--border);flex-shrink:0}
        .col-title{font-family:var(--fd);font-size:0.95rem;letter-spacing:2px;color:var(--text);margin-bottom:8px}
        .pool-tabs{display:flex;border:1px solid var(--border2)}
        .pool-tab{flex:1;background:none;border:none;cursor:pointer;font-family:var(--fu);font-size:0.68rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--muted);padding:6px 3px;border-right:1px solid var(--border2);transition:all 0.15s}
        .pool-tab:last-child{border-right:none}
        .pool-tab.on{background:rgba(255,215,0,0.08);color:var(--acc)}
        .pool-list{flex:1;overflow-y:auto;padding:4px 0}
        .pool-item{display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid rgba(255,255,255,0.03);position:relative;cursor:default}
        .pool-item.cur{background:rgba(255,215,0,0.05)}
        .pool-item.cur::before{content:'';position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--acc)}
        .pi-pos{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--fu);font-size:0.46rem;font-weight:700;flex-shrink:0}
        .pi-info{flex:1;min-width:0}
        .pi-name{font-family:var(--fu);font-size:0.85rem;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .pi-meta{font-family:var(--fu);font-size:0.7rem;font-weight:600;letter-spacing:1px;color:var(--muted);margin-top:2px}
        .pi-price{font-family:var(--fd);font-size:1rem;color:var(--sub);flex-shrink:0}
        .pool-empty{padding:28px 14px;text-align:center;font-family:var(--fu);font-size:0.62rem;letter-spacing:3px;color:var(--muted);text-transform:uppercase}

        /* player search */
        .pool-search-wrap{padding:8px 10px;border-bottom:1px solid var(--border);flex-shrink:0}
        .pool-search{width:100%;background:var(--bg-input);border:1px solid var(--border2);color:var(--text);font-family:var(--fu);font-size:0.78rem;letter-spacing:1px;padding:7px 10px;outline:none;transition:border-color 0.2s}
        .pool-search:focus{border-color:rgba(255,215,0,0.35)}
        .pool-search::placeholder{color:var(--muted)}
        .pool-item.clickable{cursor:pointer;transition:background 0.12s}
        .pool-item.clickable:hover{background:rgba(255,255,255,0.03)}
        .pool-item.preview{background:rgba(255,215,0,0.06);border-left:2px solid var(--acc)}
        .pool-item.preview .pi-name{color:var(--acc)}

        /* keyboard flash */
        @keyframes kbFlash {
          0%  { box-shadow: 0 0 0 0 rgba(255,215,0,0.7); border-color: rgba(255,215,0,0.9); background: rgba(255,215,0,0.18) }
          60% { box-shadow: 0 0 0 8px rgba(255,215,0,0); }
          100%{ box-shadow: 0 0 0 0 rgba(255,215,0,0); }
        }
        .kb-flash { animation: kbFlash 0.55s ease-out forwards !important; }
        @keyframes kbBlocked {
          0%  { box-shadow: 0 0 0 0 rgba(248,113,113,0.8); border-color: rgba(248,113,113,0.9); background: rgba(248,113,113,0.18) }
          60% { box-shadow: 0 0 0 8px rgba(248,113,113,0); }
          100%{ box-shadow: 0 0 0 0 rgba(248,113,113,0); }
        }
        .kb-blocked { animation: kbBlocked 0.55s ease-out forwards !important; }
        .kb-key{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border:1px solid rgba(255,215,0,0.3);background:rgba(255,215,0,0.06);font-family:var(--mono);font-size:0.58rem;color:var(--acc);border-radius:2px;flex-shrink:0}

        /* hotkey legend bar */
        .kb-legend{display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px;border-top:1px solid var(--border);flex-shrink:0;background:rgba(255,215,0,0.02)}
        .kb-legend-item{display:flex;align-items:center;gap:5px;font-family:var(--fu);font-size:0.6rem;letter-spacing:1px;color:var(--muted)}
        .preview-panel{border:1px solid rgba(255,215,0,0.2);background:rgba(255,215,0,0.03);padding:14px 16px;flex-shrink:0;animation:fadeUp 0.2s ease;display:flex;flex-direction:column;gap:10px}
        .preview-header{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
        .preview-label{font-family:var(--fu);font-size:0.58rem;letter-spacing:4px;color:var(--acc);text-transform:uppercase;margin-bottom:4px}
        .preview-name{font-family:var(--fd);font-size:1.9rem;line-height:1;color:var(--text)}
        .preview-dismiss{background:none;border:none;cursor:pointer;color:var(--muted);padding:2px;display:flex;align-items:center;flex-shrink:0;transition:color 0.15s}
        .preview-dismiss:hover{color:var(--text)}
        .preview-meta{display:flex;gap:6px;flex-wrap:wrap}
        .preview-chip{font-family:var(--fu);font-size:0.62rem;font-weight:600;letter-spacing:2px;text-transform:uppercase;padding:3px 9px;border:1px solid var(--border2);color:var(--sub)}
        .preview-price-row{display:flex;align-items:baseline;gap:8px;padding-top:8px;border-top:1px solid var(--border2)}
        .preview-price-label{font-family:var(--fu);font-size:0.62rem;font-weight:700;letter-spacing:3px;color:var(--muted);text-transform:uppercase}
        .preview-price-val{font-family:var(--fd);font-size:1.5rem;color:var(--sub)}

        /* ── CENTER: stage ── */
        .col-c{display:flex;flex-direction:column;overflow-y:auto;padding:20px 22px;gap:18px}

        /* player card */
        .p-card{display:grid;grid-template-columns:150px 1fr;border:1px solid var(--border);background:var(--bg-card);overflow:hidden;flex-shrink:0;animation:fadeUp 0.35s ease}
        .pc-photo{position:relative;background:var(--bg-panel);border-right:1px solid var(--border);display:flex;align-items:center;justify-content:center;min-height:170px;overflow:hidden}
        .pc-photo img{width:100%;height:100%;object-fit:cover;object-position:top;display:block}
        .pc-ribbon{position:absolute;bottom:0;left:0;right:0;padding:8px 12px;background:rgba(6,8,16,0.88);display:flex;align-items:center;gap:6px}
        .pos-badge{font-family:var(--fu);font-size:0.55rem;letter-spacing:3px;text-transform:uppercase;padding:3px 9px}
        .pc-info{padding:20px 18px;display:flex;flex-direction:column;gap:8px}
        .on-block{font-family:var(--fu);font-size:0.72rem;font-weight:700;letter-spacing:5px;color:var(--acc);text-transform:uppercase}
        .p-name{font-family:var(--fd);font-size:3rem;line-height:0.9;letter-spacing:1px;color:var(--text)}
        .p-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:4px}
        .p-chip{font-family:var(--fu);font-size:0.72rem;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:var(--sub);padding:4px 11px;border:1px solid var(--border2)}
        .p-base{margin-top:auto;padding-top:12px;border-top:1px solid var(--border2);display:flex;align-items:baseline;gap:8px}
        .p-base-label{font-family:var(--fu);font-size:0.72rem;font-weight:700;letter-spacing:3px;color:var(--muted);text-transform:uppercase}
        .p-base-val{font-family:var(--fd);font-size:1.6rem;color:var(--sub)}

        /* idle card */
        .idle-card{border:1px solid var(--border);background:var(--bg-card);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:52px 24px;flex-shrink:0}
        .idle-title{font-family:var(--fd);font-size:2rem;letter-spacing:2px;color:var(--muted);text-align:center}
        .idle-sub{font-family:var(--fu);font-size:0.65rem;letter-spacing:3px;color:var(--muted);text-transform:uppercase}

        /* bid entry panel */
        .bid-panel{border:1px solid var(--border);background:var(--bg-card);padding:20px;flex-shrink:0;display:flex;flex-direction:column;gap:16px}
        .bp-field{display:flex;flex-direction:column;gap:6px;flex:1}
        .bp-label{font-family:var(--fu);font-size:0.75rem;font-weight:700;letter-spacing:3px;color:var(--muted);text-transform:uppercase}
        .bp-input-wrap{display:flex}
        .bp-prefix{font-family:var(--fd);font-size:1.6rem;letter-spacing:1px;padding:11px 12px;background:var(--bg-panel);border:1px solid var(--border2);border-right:none;color:var(--acc);line-height:1}
        .bp-input{flex:1;background:var(--bg-input);border:1px solid var(--border2);color:var(--text);font-family:var(--fd);font-size:1.6rem;letter-spacing:2px;padding:11px 12px;outline:none;transition:border-color 0.2s;width:100%}
        .bp-input:focus{border-color:rgba(255,215,0,0.35)}
        .bp-input::placeholder{color:var(--muted)}
        .bp-current{padding:14px 16px;background:var(--bg-panel);border:1px solid var(--border2);display:flex;align-items:center;justify-content:space-between}
        .bp-cur-label{font-family:var(--fu);font-size:0.78rem;font-weight:700;letter-spacing:3px;color:var(--muted);text-transform:uppercase}
        .bp-cur-val{font-family:var(--fd);font-size:2.4rem;letter-spacing:2px;color:var(--acc);line-height:1}
        .bp-cur-team{font-family:var(--fu);font-size:0.88rem;font-weight:700;letter-spacing:1.5px;color:var(--text);margin-top:5px}
        .bp-actions{display:flex;gap:8px}

        /* action row */
        .action-row{display:flex;gap:8px;flex-wrap:wrap;flex-shrink:0}

        /* ── RIGHT: ledger + log ── */
        .col-r{border-left:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden}
        .cr-section{display:flex;flex-direction:column;overflow:hidden}
        .cr-section.grow{flex:1;min-height:0}
        .cr-hdr{padding:12px 14px 10px;border-bottom:1px solid var(--border);flex-shrink:0}
        .cr-title{font-family:var(--fd);font-size:0.92rem;letter-spacing:2px;color:var(--text)}
        .team-list{overflow-y:auto}
        .team-row{padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.03);display:flex;flex-direction:column;gap:5px}
        .team-row.lead{background:rgba(255,215,0,0.04);border-bottom-color:rgba(255,215,0,0.08)}
        .tr-top{display:flex;align-items:center;justify-content:space-between}
        .tr-name{font-family:var(--fu);font-size:0.9rem;font-weight:700;letter-spacing:1px;color:var(--sub)}
        .tr-name.l{color:var(--text)}
        .tr-wallet{font-family:var(--fd);font-size:1.15rem;color:var(--sub)}
        .tr-wallet.l{color:var(--acc)}
        .tr-mid{display:flex;align-items:center;justify-content:space-between}
        .tr-players{font-family:var(--fu);font-size:0.58rem;letter-spacing:1px;color:var(--muted)}
        .tr-badge{font-family:var(--fu);font-size:0.5rem;letter-spacing:2px;text-transform:uppercase;padding:2px 5px;border:1px solid rgba(255,215,0,0.3);color:var(--acc);background:rgba(255,215,0,0.08)}
        .tr-bar{height:2px;background:rgba(255,255,255,0.05);border-radius:1px;overflow:hidden}
        .tr-fill{height:100%;border-radius:1px;transition:width 0.5s}
        .log-list{flex:1;overflow-y:auto;min-height:0}
        .log-item{display:flex;gap:8px;padding:7px 14px;border-bottom:1px solid rgba(255,255,255,0.03)}
        .log-time{font-family:var(--mono);font-size:0.52rem;color:var(--muted);flex-shrink:0;margin-top:2px}
        .log-msg{font-family:var(--fu);font-size:0.75rem;font-weight:600;letter-spacing:0.5px;color:var(--sub);line-height:1.4}
        .log-empty{padding:24px 14px;text-align:center;font-family:var(--fu);font-size:0.62rem;letter-spacing:3px;color:var(--muted);text-transform:uppercase}

        /* toast */
        .toast{position:fixed;bottom:20px;right:20px;z-index:999;font-family:var(--fu);font-size:0.68rem;letter-spacing:2px;text-transform:uppercase;padding:10px 18px;border:1px solid;animation:toastIn 0.25s ease;pointer-events:none}
        .toast.success{background:rgba(74,222,128,0.08);border-color:rgba(74,222,128,0.3);color:var(--green)}
        .toast.error  {background:rgba(248,113,113,0.08);border-color:rgba(248,113,113,0.3);color:var(--red)}
        .toast.info   {background:rgba(255,215,0,0.08);border-color:rgba(255,215,0,0.2);color:var(--acc)}

        @media (max-width:1000px){
          .main{grid-template-columns:200px 1fr 240px}
        }
      `}</style>

            {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

            <div className="root">
                {/* ── TOPBAR ── */}
                <header className="topbar">
                    <div className="tb-l">
                        <div className="logo">SPIKE DRAFT</div>
                        <div className="ctl-badge">Control Room</div>
                        <div className="tb-sep" />
                        <div className="phase-pill" style={{
                            borderColor: isActive ? 'rgba(74,222,128,0.3)' : isPaused ? 'rgba(251,146,60,0.3)' : 'var(--border2)',
                            background: isActive ? 'rgba(74,222,128,0.06)' : isPaused ? 'rgba(251,146,60,0.06)' : 'transparent',
                        }}>
                            <div className="ph-dot" style={{
                                background: isActive ? 'var(--green)' : isPaused ? 'var(--orange)' : 'var(--muted)',
                                animation: isActive ? 'pulse 2s infinite' : 'none',
                            }} />
                            <span className="ph-label" style={{ color: isActive ? 'var(--green)' : isPaused ? 'var(--orange)' : 'var(--muted)' }}>
                                {isActive ? 'Live' : isPaused ? 'Paused' : 'Idle'}
                            </span>
                        </div>
                    </div>
                    <div className="tb-r">
                        <Btn label={isPaused ? 'Resume' : 'Pause'} variant={isPaused ? 'success' : 'ghost'} onClick={togglePause} loading={busy.pause} disabled={isIdle}
                            icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{isPaused ? <polygon points="5 3 19 12 5 21 5 3" /> : <><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></>}</svg>}
                        />
                        <Btn label="Undo" variant="ghost" onClick={openUndoConfirm} loading={busy.undopreview || busy.undo}
                            icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>}
                        />
                        <div className="tb-sep" />
                        <div className="conn-row">
                            <div className="conn-dot" style={{ background: connected ? 'var(--green)' : 'var(--red)' }} />
                            <div className="conn-label">{connected ? 'Connected' : 'Offline'}</div>
                        </div>
                        <div className="tb-sep" />
                        <Btn label="Reset Auction" variant="danger" onClick={openResetConfirm} loading={busy.resetpreview}
                            icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-3.5" /></svg>}
                        />
                        <Btn label="Sign Out" variant="ghost" onClick={async () => { await supabase.auth.signOut(); router.push('/admin/login') }}
                            icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>}
                        />
                    </div>
                </header>

                <div className="main">
                    {/* ══ LEFT: pool ══ */}
                    <div className="col-l">
                        <div className="col-hdr">
                            <div className="col-title">Player Pool</div>
                            <div className="pool-tabs">
                                {[
                                    { key: 'available', label: `Avail (${allPlayers.filter(p => p.status === 'upcoming').length})` },
                                    { key: 'unsold', label: `Unsold (${allPlayers.filter(p => p.status === 'unsold').length})` },
                                    { key: 'sold', label: `Sold (${allPlayers.filter(p => p.status === 'sold').length})` },
                                ].map(t => (
                                    <button key={t.key} className={`pool-tab ${poolFilter === t.key ? 'on' : ''}`} onClick={() => setPoolFilter(t.key)}>{t.label}</button>
                                ))}
                            </div>
                        </div>
                        {/* search input — only shown on available/unsold tabs */}
                        {(poolFilter === 'available' || poolFilter === 'unsold') && (
                            <div className="pool-search-wrap">
                                <input
                                    ref={searchInputRef}
                                    className="pool-search"
                                    type="text"
                                    placeholder="Search by name…"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                            </div>
                        )}
                        <div className="pool-list">
                            {poolPlayers.length === 0 && <div className="pool-empty">None</div>}
                            {poolPlayers
                                .filter(p => !searchQuery || p.name?.toLowerCase().includes(searchQuery.toLowerCase()))
                                .map(p => {
                                    const ps = posStyle(p.position)
                                    const isOn = p.id === astate?.current_player_id
                                    const isPreviewed = searchPreview?.id === p.id
                                    const isSelectable = isIdle && (p.status === 'upcoming' || p.status === 'unsold')
                                    return (
                                        <div
                                            key={p.id}
                                            className={`pool-item ${isOn ? 'cur' : ''} ${isPreviewed ? 'preview' : ''} ${isSelectable ? 'clickable' : ''}`}
                                            onClick={() => {
                                                if (!isSelectable) return
                                                setSearchPreview(isPreviewed ? null : p)
                                            }}
                                        >
                                            <div className="pi-pos" style={{ background: ps.bg, border: `1px solid ${ps.border}`, color: ps.text }}>
                                                {p.position?.slice(0, 2).toUpperCase() || '—'}
                                            </div>
                                            <div className="pi-info">
                                                <div className="pi-name">{p.name}</div>
                                                <div className="pi-meta">
                                                    {p.cls ? `Class ${p.cls}` : ''}
                                                    {p.sold_to_team ? ` · ${allTeams.find(t => t.id === p.sold_to_team)?.name || 'Sold'}` : ''}
                                                </div>
                                            </div>
                                            <div className="pi-price">{fmt(p.sold_price || p.base_price)}</div>
                                        </div>
                                    )
                                })}
                        </div>
                        {/* hotkey legend */}
                        <div className="kb-legend">
                            {Object.entries(TEAM_KEY_MAP).map(([key, name]) => {
                                const team = allTeams.find(t => t.name.toLowerCase() === name)
                                if (!team) return null
                                return (
                                    <div key={key} className="kb-legend-item">
                                        <span className="kb-key">{key.toUpperCase()}</span>
                                        <span>{team.name.split(' ').pop()}</span>
                                    </div>
                                )
                            })}
                            <div style={{ width: 1, height: 14, background: 'var(--border2)', margin: '0 2px' }} />
                            {[1, 2, 3, 4, 5].map(n => (
                                <div key={n} className="kb-legend-item">
                                    <span className="kb-key">{n}</span>
                                    <span>+{n}K</span>
                                </div>
                            ))}
                            <div style={{ width: 1, height: 14, background: 'var(--border2)', margin: '0 2px' }} />
                            <div className="kb-legend-item">
                                <span className="kb-key" style={{ width: 'auto', padding: '0 5px', borderColor: 'rgba(251,146,60,0.35)', background: 'rgba(251,146,60,0.06)', color: 'var(--orange)' }}>SPC</span>
                                <span>Update Bid</span>
                            </div>
                            <div className="kb-legend-item">
                                <span className="kb-key" style={{ width: 'auto', padding: '0 5px', borderColor: 'rgba(74,222,128,0.35)', background: 'rgba(74,222,128,0.06)', color: 'var(--green)' }}>ENT</span>
                                <span>Confirm Sold</span>
                            </div>
                        </div>
                    </div>

                    {/* ══ CENTER: stage ══ */}
                    <div className="col-c">

                        {/* player card */}
                        {currentPlayer ? (
                            <div className="p-card">
                                <div className="pc-photo">
                                    {/* replace src with player photo path */}
                                    <img
                                        src={currentPlayer.photo_url || `/images/players/${currentPlayer.id}.jpg`}
                                        alt={currentPlayer.name}
                                        onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
                                    />
                                    <div style={{ display: 'none', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#FFD700" strokeWidth="0.6" opacity="0.08">
                                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                                        </svg>
                                    </div>
                                    <div className="pc-ribbon">
                                        {(() => {
                                            const s = posStyle(currentPlayer.position); return (
                                                <span className="pos-badge" style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text }}>
                                                    {currentPlayer.position || 'Unknown'}
                                                </span>
                                            )
                                        })()}
                                        {currentPlayer.cls && <span className="p-chip">Class {currentPlayer.cls}</span>}
                                    </div>
                                </div>
                                <div className="pc-info">
                                    <div className="on-block">On the Block</div>
                                    <div className="p-name">{currentPlayer.name}</div>
                                    <div className="p-chips">
                                        {currentPlayer.college && <div className="p-chip">{currentPlayer.college}</div>}
                                        {currentPlayer.height && <div className="p-chip">{currentPlayer.height}</div>}
                                    </div>
                                    <div className="p-base">
                                        <div className="p-base-label">Base Price</div>
                                        <div className="p-base-val">{fmtFull(currentPlayer.base_price)}</div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="idle-card">
                                {/* replace with court graphic */}
                                <img src="/images/court-graphic.png" alt="" width="80" style={{ opacity: 0.08 }} onError={e => e.target.style.display = 'none'} />
                                <div className="idle-title">{isPaused ? 'AUCTION PAUSED' : 'STANDING BY'}</div>
                                <div className="idle-sub">{isPaused ? 'Resume to continue' : 'Pull a player to begin'}</div>
                            </div>
                        )}

                        {/* ── BID ENTRY PANEL ── */}
                        {currentPlayer && (
                            <div className="bid-panel">
                                <SL>Live Bid Entry</SL>

                                {/* current bid readout */}
                                <div className="bp-current">
                                    <div>
                                        <div className="bp-cur-label">Current Bid</div>
                                        <div className="bp-cur-val">
                                            {astate?.current_bid ? fmtFull(astate.current_bid) : fmtFull(currentPlayer?.base_price)}
                                        </div>
                                        {leadingTeam && (
                                            <div className="bp-cur-team">{leadingTeam.name}</div>
                                        )}
                                        {!astate?.current_bid_team_id && (
                                            <div style={{ fontFamily: 'var(--fu)', fontSize: '0.62rem', letterSpacing: '1.5px', color: 'var(--muted)', marginTop: 4 }}>No bid yet</div>
                                        )}
                                    </div>
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,215,0,0.15)" strokeWidth="1">
                                        <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                                    </svg>
                                </div>

                                {/* bid amount input */}
                                <div className="bp-field">
                                    <div className="bp-label">New Bid Amount</div>
                                    <div className="bp-input-wrap">
                                        <div className="bp-prefix">₹</div>
                                        <input
                                            className="bp-input"
                                            type="number"
                                            placeholder="Enter amount"
                                            value={bidAmount}
                                            onChange={e => setBidAmount(e.target.value)}
                                            min={0}
                                        />
                                    </div>
                                </div>

                                {/* smart increment buttons */}
                                {currentPlayer && (
                                    <div>
                                        <div className="bp-label" style={{ marginBottom: 8 }}>Quick Increment</div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            {getIncrements().map(inc => (
                                                <button
                                                    key={inc}
                                                    onClick={() => applyIncrement(inc)}
                                                    disabled={!isActive}
                                                    style={{
                                                        fontFamily: 'var(--fu)', fontSize: '0.72rem', fontWeight: 700,
                                                        letterSpacing: '1px', textTransform: 'uppercase',
                                                        padding: '8px 16px', cursor: isActive ? 'pointer' : 'not-allowed',
                                                        background: 'rgba(255,215,0,0.08)',
                                                        border: '1px solid rgba(255,215,0,0.3)',
                                                        color: 'var(--acc)', transition: 'all 0.15s',
                                                        opacity: isActive ? 1 : 0.4,
                                                    }}
                                                    onMouseEnter={e => { if (isActive) { e.currentTarget.style.background = 'rgba(255,215,0,0.16)'; e.currentTarget.style.borderColor = 'rgba(255,215,0,0.6)' } }}
                                                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,215,0,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,215,0,0.3)' }}
                                                >
                                                    +{inc >= 1000 ? `${inc / 1000}K` : inc}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* team buttons */}
                                <div>
                                    <div className="bp-label" style={{ marginBottom: 8 }}>Leading Team</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: 4 }}>
                                        {allTeams.map(t => {
                                            const isSelected = winTeamId === t.id
                                            const walletPct = Math.min(100, Math.round((t.wallet / STARTING_WALLET) * 100))
                                            return (
                                                <button
                                                    key={t.id}
                                                    onClick={() => setWinTeamId(isSelected ? '' : t.id)}
                                                    disabled={!isActive || isTeamClassLocked(t.id)}
                                                    className={kbFlash?.teamId === t.id ? 'kb-flash' : kbBlocked?.teamId === t.id ? 'kb-blocked' : ''}
                                                    style={{
                                                        background: isSelected ? 'rgba(255,215,0,0.1)' : 'var(--bg-panel)',
                                                        border: `1px solid ${isSelected ? 'rgba(255,215,0,0.55)' : 'var(--border2)'}`,
                                                        cursor: isActive ? 'pointer' : 'not-allowed',
                                                        padding: '10px 12px',
                                                        display: 'flex', flexDirection: 'column', gap: 5,
                                                        textAlign: 'left', transition: 'all 0.15s',
                                                        opacity: (isActive && !isTeamClassLocked(t.id)) ? 1 : 0.4,
                                                    }}
                                                    onMouseEnter={e => { if (isActive && !isSelected) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }}
                                                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--border2)' }}
                                                >
                                                    {/* team name + key badge */}
                                                    <div style={{ fontFamily: 'var(--fu)', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '1px', color: isSelected ? 'var(--acc)' : 'var(--text)', lineHeight: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                                                        {t.name}
                                                        {(() => {
                                                            const k = Object.entries(TEAM_KEY_MAP).find(([, v]) => v === t.name.toLowerCase())?.[0]
                                                            return k ? <span className="kb-key">{k.toUpperCase()}</span> : null
                                                        })()}
                                                    </div>
                                                    {isTeamClassLocked(t.id) && (
                                                        <div style={{ fontFamily: 'var(--fu)', fontSize: '0.52rem', letterSpacing: '2px', color: 'var(--red)', textTransform: 'uppercase' }}>
                                                            {currentClass} quota full
                                                        </div>
                                                    )}
                                                    {/* wallet + max bid */}
                                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                                        <div style={{ fontFamily: 'var(--fd)', fontSize: '0.95rem', letterSpacing: '1px', color: isSelected ? 'var(--acc)' : 'var(--sub)', lineHeight: 1 }}>
                                                            {fmt(t.wallet)}
                                                        </div>
                                                        <div style={{ fontFamily: 'var(--fu)', fontSize: '0.52rem', letterSpacing: '1px', color: 'var(--muted)' }}>
                                                            max {fmt(calcMaxBid(t, currentClass, allPlayers.filter(p => p.status === 'sold' && p.sold_to_team === t.id)))}
                                                        </div>
                                                    </div>
                                                    {/* wallet bar */}
                                                    <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1, overflow: 'hidden' }}>
                                                        <div style={{
                                                            height: '100%', width: `${walletPct}%`, borderRadius: 1,
                                                            background: isSelected ? 'linear-gradient(90deg,#FFD700,#FF6B35)' : 'rgba(255,255,255,0.2)',
                                                            transition: 'width 0.4s',
                                                        }} />
                                                    </div>
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* bid warning */}
                                {bidWarning && (
                                    <div style={{
                                        padding: '10px 14px', background: 'rgba(248,113,113,0.08)',
                                        border: '1px solid rgba(248,113,113,0.35)',
                                        display: 'flex', alignItems: 'center', gap: 8,
                                    }}>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2" style={{ flexShrink: 0 }}>
                                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                                        </svg>
                                        <div style={{ fontFamily: 'var(--fu)', fontSize: '0.65rem', letterSpacing: '1.5px', color: 'var(--red)' }}>{bidWarning}</div>
                                    </div>
                                )}

                                {/* action buttons */}
                                <div className="bp-actions">
                                    <Btn
                                        label="Update Bid"
                                        variant="default"
                                        onClick={updateBid}
                                        loading={busy.updatebid}
                                        disabled={!isActive || !bidAmount || !winTeamId || !!bidWarning}
                                        full
                                        icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-3.5" /></svg>}
                                    />
                                    <Btn
                                        label={`Confirm Sold${selectedTeam ? ` — ${selectedTeam.name}` : ''}`}
                                        variant="success"
                                        onClick={confirmSold}
                                        loading={busy.sold}
                                        disabled={!isActive || !winTeamId}
                                        full
                                        icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>}
                                    />
                                    <Btn
                                        label="Unsold"
                                        variant="danger"
                                        onClick={markUnsold}
                                        loading={busy.unsold}
                                        disabled={!isActive}
                                        icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>}
                                    />
                                </div>
                            </div>
                        )}

                        {/* ── PLAYER PREVIEW + PULL ── */}
                        {searchPreview && !isActive && (
                            <div className="preview-panel">
                                <div className="preview-header">
                                    <div>
                                        <div className="preview-label">Ready to Pull</div>
                                        <div className="preview-name">{searchPreview.name}</div>
                                    </div>
                                    <button className="preview-dismiss" onClick={() => setSearchPreview(null)} title="Dismiss">
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                        </svg>
                                    </button>
                                </div>
                                <div className="preview-meta">
                                    {searchPreview.position && (
                                        <span className="preview-chip" style={(() => { const s = posStyle(searchPreview.position); return { background: s.bg, borderColor: s.border, color: s.text } })()}>
                                            {searchPreview.position}
                                        </span>
                                    )}
                                    {searchPreview.cls && <span className="preview-chip">Class {searchPreview.cls}</span>}
                                    {searchPreview.status === 'unsold' && (
                                        <span className="preview-chip" style={{ borderColor: 'rgba(248,113,113,0.35)', color: '#F87171' }}>Unsold</span>
                                    )}
                                </div>
                                <div className="preview-price-row">
                                    <div className="preview-price-label">Base Price</div>
                                    <div className="preview-price-val">{fmtFull(searchPreview.base_price)}</div>
                                </div>
                            </div>
                        )}

                        {/* ── FLOW CONTROLS ── */}
                        <div className="action-row">
                            <Btn
                                label={searchPreview ? `Pull — ${searchPreview.name.split(' ')[0]}` : 'Select a Player'}
                                variant={searchPreview ? 'primary' : 'default'}
                                onClick={pullPlayer}
                                loading={busy.pull}
                                disabled={isActive || !searchPreview}
                                icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>}
                            />
                            <div style={{ flex: 1 }} />
                            <div style={{ fontFamily: 'var(--fu)', fontSize: '0.58rem', letterSpacing: '2px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                {allPlayers.filter(p => p.status === 'upcoming').length} available · {allPlayers.filter(p => p.status === 'sold').length} sold
                            </div>
                        </div>

                    </div>

                    {/* ══ RIGHT: ledger + log ══ */}
                    <div className="col-r">
                        {/* team ledger */}
                        <div className="cr-section">
                            <div className="cr-hdr"><div className="cr-title">Team Ledger</div></div>
                            <div className="team-list">
                                {[...allTeams].sort((a, b) => b.wallet - a.wallet).map(t => {
                                    const isLead = t.id === astate?.current_bid_team_id
                                    const walletPct = Math.min(100, Math.round((t.wallet / (t.max_wallet || t.wallet || 1)) * 100))
                                    return (
                                        <div key={t.id} className={`team-row ${isLead ? 'lead' : ''}`}>
                                            <div className="tr-top">
                                                <div className={`tr-name ${isLead ? 'l' : ''}`}>{t.name}</div>
                                                <div className={`tr-wallet ${isLead ? 'l' : ''}`}>{fmt(t.wallet)}</div>
                                            </div>
                                            <div className="tr-mid">
                                                <div className="tr-players">{t.players_bought ?? 0}/{t.max_players ?? '—'} players</div>
                                                {isLead && <div className="tr-badge">Leading</div>}
                                            </div>
                                            <div className="tr-bar">
                                                <div className="tr-fill" style={{
                                                    width: `${walletPct}%`,
                                                    background: isLead
                                                        ? 'linear-gradient(90deg, #FFD700, #FF6B35)'
                                                        : 'rgba(255,255,255,0.14)',
                                                }} />
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* action log */}
                        <div className="cr-section grow" style={{ borderTop: '1px solid var(--border)' }}>
                            <div className="cr-hdr"><div className="cr-title">Action Log</div></div>
                            <div className="log-list">
                                {(astate?.action_log || []).length === 0
                                    ? <div className="log-empty">No actions yet</div>
                                    : [...(astate?.action_log || [])].reverse().map((e, i) => {
                                        const ts = e.created_at
                                            ? new Date(e.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                                            : '—'
                                        return (
                                            <div key={i} className="log-item">
                                                <div className="log-time">{ts}</div>
                                                <div className="log-msg">{e.action_type}{e.description ? ` — ${e.description}` : ''}</div>
                                            </div>
                                        )
                                    })
                                }
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {/* ── UNDO CONFIRM MODAL ── */}
            {showUndoConfirm && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(6,8,16,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#0D1117', border: '1px solid rgba(251,146,60,0.3)', width: 420, padding: '28px 28px 24px', boxShadow: '0 20px 80px rgba(0,0,0,0.9)' }}>
                        <div style={{ fontFamily: 'var(--fd)', fontSize: '1.8rem', letterSpacing: '1px', color: 'var(--orange)', marginBottom: 12 }}>Confirm Undo</div>
                        {undoPreview?.action ? (
                            <>
                                <div style={{ fontFamily: 'var(--fu)', fontSize: '0.7rem', letterSpacing: '2px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Last action</div>
                                <div style={{ fontFamily: 'var(--fu)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--text)', padding: '10px 14px', background: 'rgba(251,146,60,0.06)', border: '1px solid rgba(251,146,60,0.2)', marginBottom: 8 }}>
                                    {undoPreview.action.replace(/_/g, ' ').toUpperCase()}
                                </div>
                                {undoPreview.payload && Object.keys(undoPreview.payload).length > 0 && (
                                    <div style={{ fontFamily: 'var(--mono)', fontSize: '0.65rem', color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
                                        {Object.entries(undoPreview.payload).map(([k, v]) => (
                                            <div key={k}><span style={{ color: 'var(--sub)' }}>{k}:</span> {String(v)}</div>
                                        ))}
                                    </div>
                                )}
                                <div style={{ fontFamily: 'var(--fu)', fontSize: '0.75rem', color: 'var(--sub)', marginBottom: 22, lineHeight: 1.6 }}>
                                    This will reverse the action above and restore the previous auction state.
                                </div>
                            </>
                        ) : (
                            <div style={{ fontFamily: 'var(--fu)', fontSize: '0.82rem', color: 'var(--muted)', marginBottom: 22 }}>
                                {undoPreview?.description || 'Nothing to undo.'}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <Btn label="Cancel" variant="ghost" onClick={() => { setShowUndoConfirm(false); setUndoPreview(null) }} />
                            <Btn label="Yes, Undo" variant="warning" loading={busy.undo} disabled={!undoPreview?.action} onClick={confirmUndo} />
                        </div>
                    </div>
                </div>
            )}

            {/* ── RESET CONFIRM MODAL ── */}
            {showResetConfirm && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(6,8,16,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#0D1117', border: '1px solid rgba(248,113,113,0.3)', width: 460, padding: '28px 28px 24px', boxShadow: '0 20px 80px rgba(0,0,0,0.9)' }}>
                        <div style={{ fontFamily: 'var(--fd)', fontSize: '1.8rem', letterSpacing: '1px', color: 'var(--red)', marginBottom: 6 }}>Reset Auction</div>
                        <div style={{ fontFamily: 'var(--fu)', fontSize: '0.7rem', letterSpacing: '3px', color: 'var(--red)', textTransform: 'uppercase', marginBottom: 18, opacity: 0.7 }}>This cannot be undone</div>

                        {/* live stats of what will be wiped */}
                        {resetPreview && !resetPreview.error && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
                                {[
                                    { label: 'Players sold', value: resetPreview.sold_players, warn: resetPreview.sold_players > 0 },
                                    { label: 'Bids recorded', value: resetPreview.bids, warn: resetPreview.bids > 0 },
                                    { label: 'Log entries', value: resetPreview.log_entries, warn: false },
                                    { label: 'Teams resetting', value: resetPreview.teams?.length ?? '—', warn: false },
                                ].map(s => (
                                    <div key={s.label} style={{ padding: '10px 14px', background: s.warn ? 'rgba(248,113,113,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${s.warn ? 'rgba(248,113,113,0.25)' : 'var(--border2)'}` }}>
                                        <div style={{ fontFamily: 'var(--fd)', fontSize: '1.5rem', color: s.warn ? 'var(--red)' : 'var(--sub)', lineHeight: 1 }}>{s.value}</div>
                                        <div style={{ fontFamily: 'var(--fu)', fontSize: '0.58rem', letterSpacing: '2px', color: 'var(--muted)', textTransform: 'uppercase', marginTop: 4 }}>{s.label}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div style={{ fontFamily: 'var(--fu)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--sub)', lineHeight: 1.7, marginBottom: 20 }}>
                            All player sales, bids, wallets, and rosters will be wiped. Every team wallet resets to <span style={{ color: 'var(--acc)' }}>₹2,00,000</span>. Diamond players are retained.
                        </div>

                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <Btn label="Cancel" variant="ghost" onClick={() => { setShowResetConfirm(false); setResetPreview(null) }} />
                            <Btn label="Yes, Reset Everything" variant="danger" loading={busy.reset} onClick={confirmReset} />
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}