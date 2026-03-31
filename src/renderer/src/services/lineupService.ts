import type { FieldingPosition } from '@/types/game'

export interface GameOption {
  id: string
  away: string
  home: string
  time: string
  status: string
}

export interface LoadedLineup {
  awayName: string
  homeName: string
  away: LineupPlayer[]
  home: LineupPlayer[]
}

export interface LineupPlayer {
  firstName: string
  lastName: string
  number: string
  position: FieldingPosition
}

const POSITION_MAP: Record<string, FieldingPosition> = {
  P: 'P', C: 'C', '1B': '1B', '2B': '2B', '3B': '3B', SS: 'SS',
  LF: 'LF', CF: 'CF', RF: 'RF', DH: 'DH',
  // ESPN sometimes uses full names
  Pitcher: 'P', Catcher: 'C', 'First Baseman': '1B', 'Second Baseman': '2B',
  'Third Baseman': '3B', Shortstop: 'SS', 'Left Fielder': 'LF',
  'Center Fielder': 'CF', 'Right Fielder': 'RF', 'Designated Hitter': 'DH',
}

function mapPosition(pos: string): FieldingPosition {
  return POSITION_MAP[pos] || 'DH'
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: '', lastName: parts[0] }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

// ─── MLB Stats API ──────────────────────────────────────────

export async function fetchMLBGames(date: string): Promise<GameOption[]> {
  const res = await fetch(
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=lineups,probablePitcher`
  )
  const data = await res.json()
  const games: GameOption[] = []

  for (const dateEntry of data.dates || []) {
    for (const game of dateEntry.games || []) {
      const gameDate = new Date(game.gameDate)
      const time = gameDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      games.push({
        id: String(game.gamePk),
        away: game.teams.away.team.name,
        home: game.teams.home.team.name,
        time,
        status: game.status?.detailedState || ''
      })
    }
  }
  return games
}

export async function fetchMLBLineup(gamePk: string): Promise<LoadedLineup> {
  // Try boxscore first (has more detail for in-progress/completed games)
  const boxRes = await fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`)
  const box = await boxRes.json()

  const result: LoadedLineup = {
    awayName: '',
    homeName: '',
    away: [],
    home: []
  }

  for (const side of ['away', 'home'] as const) {
    const teamData = box.teams[side]
    result[side === 'away' ? 'awayName' : 'homeName'] = teamData.team?.name || ''

    const battingOrder: number[] = teamData.battingOrder || []
    const players = teamData.players || {}

    if (battingOrder.length > 0) {
      // Use battingOrder array — these are player IDs in order
      for (const playerId of battingOrder) {
        const playerData = players[`ID${playerId}`]
        if (!playerData) continue
        const { firstName, lastName } = splitName(playerData.person?.fullName || '')
        result[side].push({
          firstName,
          lastName,
          number: playerData.jerseyNumber || '',
          position: mapPosition(playerData.position?.abbreviation || '')
        })
      }
    }
  }

  // If boxscore didn't have lineups, try the hydrated schedule
  if (result.away.length === 0 || result.home.length === 0) {
    const schedRes = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?gamePk=${gamePk}&hydrate=lineups`
    )
    const sched = await schedRes.json()
    const game = sched.dates?.[0]?.games?.[0]
    if (game?.lineups) {
      for (const side of ['away', 'home'] as const) {
        if (result[side].length > 0) continue
        const key = side === 'away' ? 'awayPlayers' : 'homePlayers'
        const linePlayers = game.lineups[key] || []
        result[side === 'away' ? 'awayName' : 'homeName'] = game.teams[side].team.name
        for (const p of linePlayers) {
          const { firstName, lastName } = splitName(p.fullName || '')
          result[side].push({
            firstName,
            lastName,
            number: '',
            position: mapPosition(p.primaryPosition?.abbreviation || '')
          })
        }
      }
    }
  }

  // Pad to 9 if needed
  for (const side of ['away', 'home'] as const) {
    while (result[side].length < 9) {
      result[side].push({ firstName: '', lastName: '', number: '', position: 'DH' })
    }
    result[side] = result[side].slice(0, 9)
  }

  return result
}

// ─── NCAA via ESPN API ──────────────────────────────────────

export async function fetchNCAAGames(date: string): Promise<GameOption[]> {
  // ESPN wants YYYYMMDD format
  const dateStr = date.replace(/-/g, '')
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/baseball/college-baseball/scoreboard?dates=${dateStr}&limit=100`
  )
  const data = await res.json()
  const games: GameOption[] = []

  for (const event of data.events || []) {
    const comp = event.competitions?.[0]
    if (!comp) continue
    const away = comp.competitors?.find((c: any) => c.homeAway === 'away')
    const home = comp.competitors?.find((c: any) => c.homeAway === 'home')
    const gameDate = new Date(event.date)
    const time = gameDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

    games.push({
      id: event.id,
      away: away?.team?.displayName || 'Away',
      home: home?.team?.displayName || 'Home',
      time,
      status: comp.status?.type?.shortDetail || ''
    })
  }
  return games
}

export async function fetchNCAALineup(eventId: string): Promise<LoadedLineup> {
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/baseball/college-baseball/summary?event=${eventId}`
  )
  const data = await res.json()

  const result: LoadedLineup = {
    awayName: '',
    homeName: '',
    away: [],
    home: []
  }

  // rosters[0] = away, rosters[1] = home
  const rosters = data.rosters || []
  const sides: ('away' | 'home')[] = ['away', 'home']

  for (let i = 0; i < 2; i++) {
    const side = sides[i]
    const roster = rosters[i]
    if (!roster) continue

    result[side === 'away' ? 'awayName' : 'homeName'] = roster.team?.displayName || ''

    // Filter to starters with batting order, sort by batOrder
    const batters = (roster.roster || [])
      .filter((p: any) => p.batOrder != null && p.batOrder > 0)
      .sort((a: any, b: any) => a.batOrder - b.batOrder)

    for (const p of batters) {
      const { firstName, lastName } = splitName(p.athlete?.displayName || '')
      result[side].push({
        firstName,
        lastName,
        number: p.athlete?.jersey || '',
        position: mapPosition(p.position?.abbreviation || '')
      })
    }
  }

  // Pad to 9
  for (const side of ['away', 'home'] as const) {
    while (result[side].length < 9) {
      result[side].push({ firstName: '', lastName: '', number: '', position: 'DH' })
    }
    result[side] = result[side].slice(0, 9)
  }

  return result
}
