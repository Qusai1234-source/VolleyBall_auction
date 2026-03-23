export type PlayerStatus = 'upcoming' | 'active' | 'sold' | 'unsold'
export type AuctionPhase = 'idle' | 'active' | 'deadlock' | 'paused' | 'finished'

export interface Player {
    id: string
    name: string
    position: string
    class: string
    base_price: number
    photo_url: string | null
    status: PlayerStatus
    sold_to_team: string | null
    sold_amount: number | null
    teams?: { id: string; name: string } | null
}

export interface Team {
    id: string
    name: string
    wallet: number
    max_slots: number
    roster_count: number
}

export interface AuctionState {
    id: number
    phase: AuctionPhase
    current_player_id: string | null
    current_player: Player | null
    current_bid: number
    current_bid_team: string | null
    current_bid_team_data: Team | null
    deadlock_deadline: string | null
    is_paused: boolean
    round: number
}

export interface Bid {
    id: string
    player_id: string
    team_id: string
    amount: number
    submitted_at: string
    teams: { name: string }
}