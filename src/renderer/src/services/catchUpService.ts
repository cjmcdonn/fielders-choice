/**
 * MLB Catch-Up Service
 *
 * Fetches play-by-play data from the MLB Stats API live feed and replays
 * each play through the game store, bringing the app's scoring state
 * up to date with the real game.
 *
 * MLB eventType → App outcome mapping:
 *   single→1B, double→2B, triple→3B, home_run→HR
 *   walk→BB, intent_walk→IBB, hit_by_pitch→HBP
 *   field_out→FO/GO/LO/PO, strikeout→K/KL
 *   double_play/grounded_into_double_play→DP
 *   strikeout_double_play→K (+runner out via movements)
 *   sac_bunt→SAC, sac_fly→SF, sac_fly_double_play→SF (+runner out)
 *   field_error→E
 *   fielders_choice/fielders_choice_out/force_out→FC
 *   catcher_interf→CI
 *
 * Baserunning events (no at-bat outcome):
 *   caught_stealing_*→CS, pickoff_*→PKO
 *   wild_pitch→WP, passed_ball→PB, balk→BK
 *   other_out→PKO
 */

import { v4 as uuid } from 'uuid'
import type {
  AtBatOutcome, RunnerMovement, Player, FieldingPosition,
  BaserunningEventType, GameState
} from '@/types/game'

// ─── Types for MLB live feed data ─────────────────────────

interface MLBRunner {
  movement: {
    originBase: string | null
    start: string | null
    end: string | null
    isOut: boolean
  }
  details: {
    isScoringEvent?: boolean
    rbi?: boolean
    runner: { id: number; fullName: string }
  }
  credits?: Array<{
    credit: string
    position: { code: string }
  }>
}

interface MLBPlay {
  about: {
    atBatIndex: number
    halfInning: 'top' | 'bottom'
    inning: number
    isComplete: boolean
  }
  result: {
    eventType: string
    event: string
    description: string
  }
  count: {
    outs: number
  }
  matchup: {
    batter: { id: number; fullName: string }
    pitcher: { id: number; fullName: string }
    batSide: { code: string }
    postOnFirst?: { id: number; fullName: string }
    postOnSecond?: { id: number; fullName: string }
    postOnThird?: { id: number; fullName: string }
  }
  runners: MLBRunner[]
  playEvents?: Array<{
    details: { description: string; code: string; isStrike?: boolean }
    count: { balls: number; strikes: number; outs: number }
    isPitch: boolean
  }>
}

interface MLBLiveFeed {
  gamePk: number
  gameData: {
    status: { detailedState: string }
    teams: {
      away: { name: string; id: number }
      home: { name: string; id: number }
    }
  }
  liveData: {
    plays: {
      allPlays: MLBPlay[]
      currentPlay?: MLBPlay
    }
    boxscore: {
      teams: {
        away: { battingOrder: number[]; players: Record<string, any> }
        home: { battingOrder: number[]; players: Record<string, any> }
      }
    }
  }
}

// ─── Event type mapping ───────────────────────────────────

type MappedOutcome = { type: 'atBat'; outcome: AtBatOutcome } | { type: 'baserunning' }

const AT_BAT_EVENT_MAP: Record<string, AtBatOutcome> = {
  single: '1B',
  double: '2B',
  triple: '3B',
  home_run: 'HR',
  walk: 'BB',
  intent_walk: 'IBB',
  hit_by_pitch: 'HBP',
  strikeout: 'K',
  field_out: 'FO', // refined below
  double_play: 'DP',
  grounded_into_double_play: 'DP',
  strikeout_double_play: 'K',
  sac_bunt: 'SAC',
  sac_fly: 'SF',
  sac_fly_double_play: 'SF',
  field_error: 'E',
  fielders_choice: 'FC',
  fielders_choice_out: 'FC',
  force_out: 'FC',
  catcher_interf: 'CI',
}

const BASERUNNING_EVENTS = new Set([
  'caught_stealing_2b', 'caught_stealing_3b', 'caught_stealing_home',
  'pickoff_1b', 'pickoff_2b', 'pickoff_3b',
  'pickoff_caught_stealing_2b', 'pickoff_caught_stealing_3b', 'pickoff_caught_stealing_home',
  'wild_pitch', 'passed_ball', 'balk',
  'other_out',
])

function mapEventType(eventType: string): MappedOutcome {
  if (BASERUNNING_EVENTS.has(eventType)) {
    return { type: 'baserunning' }
  }
  const outcome = AT_BAT_EVENT_MAP[eventType]
  if (outcome) {
    return { type: 'atBat', outcome }
  }
  // Unknown event — skip
  console.warn(`[catchUp] Unknown MLB event type: ${eventType}`)
  return { type: 'baserunning' } // treat as no-op (will be skipped if no runner movements)
}

// ─── Field out subtype refinement ─────────────────────────

function refineFieldOut(play: MLBPlay): AtBatOutcome {
  const desc = play.result.description.toLowerCase()
  if (desc.includes('grounds out') || desc.includes('ground')) return 'GO'
  if (desc.includes('lines out') || desc.includes('line')) return 'LO'
  if (desc.includes('pops out') || desc.includes('pop')) return 'PO'
  if (desc.includes('flies out') || desc.includes('fly') || desc.includes('flied')) return 'FO'

  // Fall back to fielder position
  const fielders = extractFielderPositions(play.runners)
  if (fielders.length > 0) {
    const primary = fielders[0]
    if (primary >= 7) return 'FO' // outfielder
    if (fielders.length > 1) return 'GO' // infielder with assist = ground out
    return 'PO' // infielder unassisted = pop up
  }

  return 'FO' // default
}

// ─── Strikeout looking detection ──────────────────────────

function isStrikeoutLooking(play: MLBPlay): boolean {
  const events = play.playEvents || []
  if (events.length === 0) return false
  const lastPitch = events[events.length - 1]
  // Called strike 3 codes: 'C' = called strike
  return lastPitch?.details?.code === 'C' && (lastPitch?.details?.isStrike ?? false)
}

// ─── Fielder position extraction ──────────────────────────

function extractFielderPositions(runners: MLBRunner[]): number[] {
  const positions: number[] = []
  for (const runner of runners) {
    for (const credit of runner.credits || []) {
      if (credit.credit === 'f_assist' || credit.credit === 'f_putout') {
        const posCode = parseInt(credit.position?.code, 10)
        if (posCode && !positions.includes(posCode)) {
          positions.push(posCode)
        }
      }
    }
  }
  return positions
}

// ─── Base string → number conversion ─────────────────────

function baseToNumber(base: string | null | undefined): 0 | 1 | 2 | 3 | 4 {
  if (!base) return 0
  if (base === '1B') return 1
  if (base === '2B') return 2
  if (base === '3B') return 3
  if (base === 'score') return 4
  return 0
}

// ─── Player ID mapping ───────────────────────────────────

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[.,'-]/g, '')
    .replace(/\s+(jr|sr|ii|iii|iv)$/i, '') // strip suffixes
    .trim()
}

export interface PlayerIdMap {
  /** MLB player ID → internal player ID */
  mlbToInternal: Map<number, string>
  /** MLB player ID → which side they're on */
  mlbToSide: Map<number, 'away' | 'home'>
}

export function buildPlayerIdMap(gameState: GameState, boxscore: MLBLiveFeed['liveData']['boxscore']): PlayerIdMap {
  const mlbToInternal = new Map<number, string>()
  const mlbToSide = new Map<number, 'away' | 'home'>()

  for (const side of ['away', 'home'] as const) {
    const team = gameState[side]
    const boxTeam = boxscore.teams[side]
    const boxPlayers = boxTeam.players || {}

    // Build a lookup of internal players by normalized name
    const internalByName = new Map<string, string>()
    const internalByNumber = new Map<string, string>()
    for (const player of team.players) {
      const fullName = normalizeName(`${player.firstName} ${player.lastName}`)
      internalByName.set(fullName, player.id)
      if (player.number) {
        internalByNumber.set(player.number, player.id)
      }
    }

    // Match each boxscore player to an internal player
    for (const [, boxPlayer] of Object.entries(boxPlayers) as [string, any][]) {
      const mlbId = boxPlayer.person?.id
      if (!mlbId) continue

      const fullName = normalizeName(boxPlayer.person?.fullName || '')
      const jerseyNumber = boxPlayer.jerseyNumber || ''

      // Try name match first, then jersey number
      let internalId = internalByName.get(fullName)
      if (!internalId && jerseyNumber) {
        internalId = internalByNumber.get(jerseyNumber)
      }

      if (internalId) {
        mlbToInternal.set(mlbId, internalId)
        mlbToSide.set(mlbId, side)
      }
    }
  }

  return { mlbToInternal, mlbToSide }
}

// ─── Runner movement translation ─────────────────────────

function translateRunnerMovements(
  play: MLBPlay,
  playerIdMap: PlayerIdMap,
  _gameState: GameState
): { movements: RunnerMovement[]; batterEnd: string | null; batterIsOut: boolean } {
  const movements: RunnerMovement[] = []
  let batterEnd: string | null = null
  let batterIsOut = false

  for (const runner of play.runners) {
    const originBase = runner.movement.originBase
    const endBase = runner.movement.end
    const isOut = runner.movement.isOut

    if (originBase === null || originBase === undefined || originBase === '') {
      // This is the batter
      if (isOut) {
        batterIsOut = true
        batterEnd = 'out'
      } else if (endBase === 'score') {
        batterEnd = 'scored'
      } else {
        batterEnd = endBase || null
      }
    } else {
      // This is a baserunner
      const startBase = baseToNumber(originBase) as 1 | 2 | 3
      if (startBase < 1 || startBase > 3) continue

      const mlbRunnerId = runner.details.runner.id
      const internalId = playerIdMap.mlbToInternal.get(mlbRunnerId)
      if (!internalId) {
        console.warn(`[catchUp] Unknown runner MLB ID ${mlbRunnerId} (${runner.details.runner.fullName})`)
        continue
      }

      const endBaseNum = isOut ? 0 : baseToNumber(endBase)
      const result: RunnerMovement['result'] = isOut ? 'out' : (endBaseNum === 4 ? 'scored' : 'safe')

      movements.push({
        runnerId: internalId,
        startBase,
        endBase: endBaseNum as 0 | 1 | 2 | 3 | 4,
        result,
        fielders: extractFielderPositions([runner])
      })
    }
  }

  return { movements, batterEnd, batterIsOut }
}

// ─── Baserunning event translation ───────────────────────

interface BaserunningAction {
  type: BaserunningEventType
  runnerId: string
  fromBase: 1 | 2 | 3
}

function translateBaserunningEvent(
  play: MLBPlay,
  playerIdMap: PlayerIdMap
): BaserunningAction[] {
  const eventType = play.result.eventType
  const actions: BaserunningAction[] = []

  for (const runner of play.runners) {
    const originBase = runner.movement.originBase
    if (originBase === null || originBase === undefined || originBase === '') continue

    const startBase = baseToNumber(originBase) as 1 | 2 | 3
    if (startBase < 1 || startBase > 3) continue

    const mlbRunnerId = runner.details.runner.id
    const internalId = playerIdMap.mlbToInternal.get(mlbRunnerId)
    if (!internalId) {
      console.warn(`[catchUp] Unknown baserunner MLB ID ${mlbRunnerId}`)
      continue
    }

    let type: BaserunningEventType

    if (eventType.startsWith('caught_stealing') || eventType.startsWith('pickoff_caught_stealing')) {
      type = 'CS'
    } else if (eventType.startsWith('pickoff')) {
      type = 'PKO'
    } else if (eventType === 'wild_pitch') {
      type = 'WP'
    } else if (eventType === 'passed_ball') {
      type = 'PB'
    } else if (eventType === 'balk') {
      type = 'BK'
    } else if (eventType === 'other_out') {
      type = 'PKO'
    } else if (eventType === 'stolen_base_2b' || eventType === 'stolen_base_3b' || eventType === 'stolen_base_home') {
      type = 'SB'
    } else {
      // Unknown baserunning event, skip
      console.warn(`[catchUp] Unknown baserunning event: ${eventType}`)
      continue
    }

    actions.push({ type, runnerId: internalId, fromBase: startBase })
  }

  return actions
}

// ─── Substitute handling ─────────────────────────────────

function ensurePlayerExists(
  mlbPlayerId: number,
  mlbPlayerName: string,
  side: 'away' | 'home',
  playerIdMap: PlayerIdMap,
  boxscore: MLBLiveFeed['liveData']['boxscore'],
  store: CatchUpStore
): string | null {
  // Already mapped?
  const existing = playerIdMap.mlbToInternal.get(mlbPlayerId)
  if (existing) return existing

  // Look up player info from boxscore
  const boxTeam = boxscore.teams[side]
  const boxPlayer = boxTeam.players?.[`ID${mlbPlayerId}`]

  const nameParts = mlbPlayerName.trim().split(/\s+/)
  const firstName = nameParts[0] || ''
  const lastName = nameParts.slice(1).join(' ') || mlbPlayerName

  const newPlayer: Player = {
    id: uuid(),
    firstName,
    lastName,
    number: boxPlayer?.jerseyNumber || ''
  }

  const position: FieldingPosition = boxPlayer?.position?.abbreviation
    ? (mapBoxscorePosition(boxPlayer.position.abbreviation))
    : 'DH'

  // Find which lineup slot this player belongs to
  const battingOrder = boxPlayer?.battingOrder
  const slotIndex = battingOrder ? Math.floor(battingOrder / 100) - 1 : -1

  store.addPlayer(side, newPlayer)

  if (slotIndex >= 0 && slotIndex < 9) {
    store.addLineupEntry(side, slotIndex, { playerId: newPlayer.id, position })
  }

  // Update the map
  playerIdMap.mlbToInternal.set(mlbPlayerId, newPlayer.id)
  playerIdMap.mlbToSide.set(mlbPlayerId, side)

  return newPlayer.id
}

function mapBoxscorePosition(abbrev: string): FieldingPosition {
  const map: Record<string, FieldingPosition> = {
    P: 'P', C: 'C', '1B': '1B', '2B': '2B', '3B': '3B', SS: 'SS',
    LF: 'LF', CF: 'CF', RF: 'RF', DH: 'DH',
  }
  return map[abbrev] || 'DH'
}

// ─── Store interface for catch-up ───────��────────────────

interface CatchUpStore {
  getState: () => { game: GameState }
  recordAtBatSilent: (outcome: AtBatOutcome, fielders?: number[], runnerMovements?: RunnerMovement[], batterOut?: boolean) => void
  recordBaserunningSilent: (type: BaserunningEventType, runnerId: string, fromBase: 1 | 2 | 3) => void
  addPlayer: (side: 'away' | 'home', player: Player) => void
  addLineupEntry: (side: 'away' | 'home', slotIndex: number, entry: { playerId: string; position: FieldingPosition }) => void
  setMlbGamePk: (gamePk: string) => void
  setLastReplayedPlayIndex: (index: number) => void
}

// ─── Main replay function ────────────────────────────────

export interface CatchUpProgress {
  current: number
  total: number
  description: string
}

export async function fetchLiveFeed(gamePk: string): Promise<MLBLiveFeed> {
  const res = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`)
  if (!res.ok) throw new Error(`Failed to fetch live feed: ${res.status}`)
  return res.json()
}

export async function replayPlays(
  gamePk: string,
  store: CatchUpStore,
  onProgress?: (progress: CatchUpProgress) => void,
  fromPlayIndex: number = 0
): Promise<{ playsReplayed: number; errors: string[] }> {
  const feed = await fetchLiveFeed(gamePk)
  const allPlays = feed.liveData.plays.allPlays || []
  const completePlays = allPlays.filter(play => play.about.isComplete)

  store.setMlbGamePk(gamePk)

  const gameState = store.getState().game
  const playerIdMap = buildPlayerIdMap(gameState, feed.liveData.boxscore)

  const errors: string[] = []
  let playsReplayed = 0

  for (let i = fromPlayIndex; i < completePlays.length; i++) {
    const play = completePlays[i]
    const eventType = play.result.eventType

    if (!eventType) continue

    onProgress?.({
      current: i - fromPlayIndex + 1,
      total: completePlays.length - fromPlayIndex,
      description: play.result.description?.slice(0, 60) || ''
    })

    try {
      const mapped = mapEventType(eventType)
      const side: 'away' | 'home' = play.about.halfInning === 'top' ? 'away' : 'home'

      if (mapped.type === 'atBat') {
        // Ensure batter exists in our player map
        const batterId = play.matchup.batter.id
        ensurePlayerExists(
          batterId, play.matchup.batter.fullName,
          side, playerIdMap, feed.liveData.boxscore, store
        )

        // Ensure all runners exist
        for (const runner of play.runners) {
          if (runner.details.runner.id !== batterId) {
            const runnerSide = playerIdMap.mlbToSide.get(runner.details.runner.id)
            ensurePlayerExists(
              runner.details.runner.id,
              runner.details.runner.fullName,
              runnerSide || side,
              playerIdMap, feed.liveData.boxscore, store
            )
          }
        }

        let outcome = mapped.outcome

        // Refine field_out subtype
        if (eventType === 'field_out') {
          outcome = refineFieldOut(play)
        }

        // Detect strikeout looking
        if (eventType === 'strikeout' || eventType === 'strikeout_double_play') {
          if (isStrikeoutLooking(play)) {
            outcome = 'KL'
          }
        }

        // Translate runner movements
        const { movements, batterIsOut } = translateRunnerMovements(
          play, playerIdMap, store.getState().game
        )

        // Extract fielder positions
        const fielders = extractFielderPositions(play.runners)

        // Determine batterOut override
        let batterOutParam: boolean | undefined = undefined

        // For dropped third strike (K where batter reaches)
        if ((eventType === 'strikeout') && !batterIsOut) {
          batterOutParam = false
        }

        // For DP/TP: batter is out if runners entry shows it
        if (outcome === 'DP') {
          batterOutParam = batterIsOut
        }

        // For strikeout_double_play: batter always out
        if (eventType === 'strikeout_double_play') {
          batterOutParam = true
        }

        // For sac_fly_double_play: batter always out (fly out)
        if (eventType === 'sac_fly_double_play') {
          batterOutParam = undefined // SF is already in OUT_OUTCOMES
        }

        store.recordAtBatSilent(outcome, fielders.length > 0 ? fielders : undefined, movements, batterOutParam)
        playsReplayed++

      } else {
        // Baserunning event
        // Ensure runners exist
        for (const runner of play.runners) {
          const runnerSide = playerIdMap.mlbToSide.get(runner.details.runner.id)
          ensurePlayerExists(
            runner.details.runner.id,
            runner.details.runner.fullName,
            runnerSide || side,
            playerIdMap, feed.liveData.boxscore, store
          )
        }

        const actions = translateBaserunningEvent(play, playerIdMap)
        for (const action of actions) {
          store.recordBaserunningSilent(action.type, action.runnerId, action.fromBase)
        }
        if (actions.length > 0) playsReplayed++
      }
    } catch (err) {
      const msg = `Play ${i}: ${eventType} — ${err instanceof Error ? err.message : String(err)}`
      errors.push(msg)
      console.error(`[catchUp] ${msg}`)
    }
  }

  store.setLastReplayedPlayIndex(completePlays.length)

  return { playsReplayed, errors }
}
