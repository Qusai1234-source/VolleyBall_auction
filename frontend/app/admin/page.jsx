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
export default function AdminDashboard() {
    const router = useRouter()
    const supabase = createClient()

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
        } else {
            setBidAmount('')
        }
        setWinTeamId('')
    }, [astate?.current_player_id])

    // ── realtime ───────────────────────────────────────────────────────────
    const fetchAllRef = useRef(fetchAll)
    useEffect(() => { fetchAllRef.current = fetchAll }, [fetchAll])

    useEffect(() => {
        const ch = supabase.channel('admin-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_state' }, () => fetchAllRef.current())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => fetchAllRef.current())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => fetchAllRef.current())
            .on('system', {}, p => setConnected(p.status === 'SUBSCRIBED'))
            .subscribe(s => setConnected(s === 'SUBSCRIBED'))
        return () => supabase.removeChannel(ch)
    }, [])

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

    const pullPlayer = () => doAction('pull', '/auction/pull-player')
    const markUnsold = () => doAction('unsold', '/auction/unsold')
    const undoAction = () => doAction('undo', '/auction/undo')
    const togglePause = () => doAction('pause', '/auction/pause')
    const resetAuction = () => doAction('reset', '/auction/reset')

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
    const currentPlayer = astate?.current_player
    const leadingTeam = allTeams.find(t => t.id === astate?.current_bid_team_id)

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
                        <Btn label="Undo" variant="ghost" onClick={undoAction} loading={busy.undo}
                            icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>}
                        />
                        <div className="tb-sep" />
                        <div className="conn-row">
                            <div className="conn-dot" style={{ background: connected ? 'var(--green)' : 'var(--red)' }} />
                            <div className="conn-label">{connected ? 'Connected' : 'Offline'}</div>
                        </div>
                        <div className="tb-sep" />
                        <Btn label="Reset Auction" variant="danger" onClick={() => setShowResetConfirm(true)}
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
                        <div className="pool-list">
                            {poolPlayers.length === 0 && <div className="pool-empty">None</div>}
                            {poolPlayers.map(p => {
                                const ps = posStyle(p.position)
                                const isOn = p.id === astate?.current_player_id
                                return (
                                    <div key={p.id} className={`pool-item ${isOn ? 'cur' : ''}`}>
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
                                            onKeyDown={e => e.key === 'Enter' && updateBid()}
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
                                                    {/* team name */}
                                                    <div style={{ fontFamily: 'var(--fu)', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '1px', color: isSelected ? 'var(--acc)' : 'var(--text)', lineHeight: 1 }}>
                                                        {t.name}
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

                        {/* ── FLOW CONTROLS ── */}
                        <div className="action-row">
                            <Btn
                                label="Pull Next Player"
                                variant="primary"
                                onClick={pullPlayer}
                                loading={busy.pull}
                                disabled={isActive}
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
            {showResetConfirm && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(6,8,16,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#0D1117', border: '1px solid rgba(248,113,113,0.3)', width: 420, padding: '28px 28px 24px', boxShadow: '0 20px 80px rgba(0,0,0,0.9)' }}>
                        <div style={{ fontFamily: 'var(--fd)', fontSize: '1.8rem', letterSpacing: '1px', color: 'var(--red)', marginBottom: 12 }}>Reset Auction</div>
                        <div style={{ fontFamily: 'var(--fu)', fontSize: '0.82rem', fontWeight: 600, color: 'var(--sub)', lineHeight: 1.6, marginBottom: 24 }}>
                            This will reset the entire auction to its initial state. All player sales, bids, and wallet deductions will be wiped. This cannot be undone.
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <Btn label="Cancel" variant="ghost" onClick={() => setShowResetConfirm(false)} />
                            <Btn label="Yes, Reset Everything" variant="danger" loading={busy.reset} onClick={() => { resetAuction(); setShowResetConfirm(false) }} />
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}