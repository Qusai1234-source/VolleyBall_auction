const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function post(path, body) {
    const res = await fetch(`${API}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Request failed')
    }
    return res.json()
}

async function get(path) {
    const res = await fetch(`${API}${path}`, { cache: 'no-store' })
    if (!res.ok) throw new Error('Request failed')
    return res.json()
}

async function del(path, body) {
    const res = await fetch(`${API}${path}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) throw new Error('Request failed')
    return res.json()
}

export const api = {
    // ── Auction ──────────────────────────────────────────────
    getState: () => get('/auction/state'),
    pullPlayer: (override_player_id) => post('/auction/pull-player', { override_player_id: override_player_id || null }),
    placeBid: (team_id, amount) => post('/auction/bid', { team_id, amount }),

    // amount is required — this is how the admin updates the live bid
    assignOpeningBid: (team_id, amount) => post('/auction/assign-opening-bid', { team_id, amount }),

    placeDeadlockBid: (team_id, amount) => post('/auction/deadlock-bid', { team_id, amount }),
    markSold: (player_id, team_id, amount) => post('/auction/sold', { player_id, team_id, amount }),
    markUnsold: () => post('/auction/unsold'),
    triggerDeadlock: (deadline_seconds = 30) => post('/auction/trigger-deadlock', { deadline_seconds }),
    resolveDeadlock: () => post('/auction/resolve-deadlock'),
    pause: (paused) => post('/auction/pause', { paused }),
    undo: () => post('/auction/undo'),

    // ── Teams ────────────────────────────────────────────────
    getTeams: () => get('/teams/'),
    getTeam: (team_id) => get(`/teams/${team_id}`),
    getRoster: (team_id) => get(`/teams/${team_id}/roster`),
    getWatchlist: (team_id) => get(`/teams/${team_id}/watchlist`),
    addToWatchlist: (team_id, player_id) => post('/teams/watchlist', { team_id, player_id }),
    removeFromWatchlist: (team_id, player_id) => del('/teams/watchlist', { team_id, player_id }),

    // No player_id needed — backend reads current player from auction_state
    getBidHistory: () => get('/teams/bids/history'),

    // ── Players ──────────────────────────────────────────────
    // Pass filters as an object: { status, position, cls }
    getPlayers: (filters = {}) => {
        const params = new URLSearchParams()
        if (filters.status) params.set('status', filters.status)
        if (filters.position) params.set('position', filters.position)
        if (filters.cls) params.set('cls', filters.cls)
        const qs = params.toString()
        return get(`/players/${qs ? '?' + qs : ''}`)
    },

    getPlayer: (player_id) => get(`/players/${player_id}`),
}