import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type {
  GameState, AtBatOutcome, RunnerMovement, Player,
  FieldingPosition, HalfInning, HalfInningState, AtBat, Runners,
  BaserunningEventType, BaserunningEvent
} from '@/types/game'
import { isHit, isReach, isOut, outcomeCountsAsAB, getAtBats, atBatOutsRecorded } from '@/types/game'

function createEmptyTeam(name: string): GameState['away'] {
  return {
    name,
    lineup: Array.from({ length: 9 }, (_, index) => ({
      orderPosition: index + 1,
      entries: []
    })),
    pitchers: [],
    players: []
  }
}

function createEmptyGame(): GameState {
  return {
    id: uuid(),
    meta: { date: new Date().toISOString().split('T')[0] },
    away: createEmptyTeam('Away'),
    home: createEmptyTeam('Home'),
    halfInnings: [],
    currentInning: 1,
    currentHalfInning: 'top',
    outs: 0,
    runners: { first: null, second: null, third: null },
    status: 'setup'
  }
}

function getCurrentHalfInning(game: GameState): HalfInningState | undefined {
  return game.halfInnings.find(
    halfInning => halfInning.inning === game.currentInning && halfInning.half === game.currentHalfInning
  )
}

function ensureHalfInning(game: GameState): HalfInningState {
  let halfInning = getCurrentHalfInning(game)
  if (!halfInning) {
    halfInning = {
      inning: game.currentInning,
      half: game.currentHalfInning,
      events: [],
      runs: 0,
      hits: 0,
      errors: 0,
      leftOnBase: 0
    }
    game.halfInnings.push(halfInning)
  }
  return halfInning
}

function getCurrentBatterIndex(game: GameState): number {
  const side = game.currentHalfInning === 'top' ? 'away' : 'home'
  const teamAtBats = game.halfInnings
    .filter(halfInning => halfInning.half === game.currentHalfInning)
    .flatMap(halfInning => getAtBats(halfInning))

  if (teamAtBats.length === 0) return 0
  const lastPosition = teamAtBats[teamAtBats.length - 1].lineupPosition
  return lastPosition % game[side].lineup.length
}

function advanceHalfInning(game: GameState): void {
  // Count left on base
  const currentHalfInning = getCurrentHalfInning(game)
  if (currentHalfInning) {
    let leftOnBase = 0
    if (game.runners.first) leftOnBase++
    if (game.runners.second) leftOnBase++
    if (game.runners.third) leftOnBase++
    currentHalfInning.leftOnBase = leftOnBase
  }

  if (game.currentHalfInning === 'top') {
    game.currentHalfInning = 'bottom'
  } else {
    game.currentHalfInning = 'top'
    game.currentInning++
  }
  game.outs = 0
  game.runners = { first: null, second: null, third: null }
}

function defaultRunnerAdvance(
  outcome: AtBatOutcome,
  runners: Runners,
  batterId: string
): RunnerMovement[] {
  const movements: RunnerMovement[] = []

  if (outcome === 'HR') {
    if (runners.third) movements.push({ runnerId: runners.third, startBase: 3, endBase: 4, result: 'scored' })
    if (runners.second) movements.push({ runnerId: runners.second, startBase: 2, endBase: 4, result: 'scored' })
    if (runners.first) movements.push({ runnerId: runners.first, startBase: 1, endBase: 4, result: 'scored' })
    return movements
  }

  if (outcome === '3B') {
    if (runners.third) movements.push({ runnerId: runners.third, startBase: 3, endBase: 4, result: 'scored' })
    if (runners.second) movements.push({ runnerId: runners.second, startBase: 2, endBase: 4, result: 'scored' })
    if (runners.first) movements.push({ runnerId: runners.first, startBase: 1, endBase: 4, result: 'scored' })
    return movements
  }

  if (outcome === '2B') {
    if (runners.third) movements.push({ runnerId: runners.third, startBase: 3, endBase: 4, result: 'scored' })
    if (runners.second) movements.push({ runnerId: runners.second, startBase: 2, endBase: 4, result: 'scored' })
    if (runners.first) movements.push({ runnerId: runners.first, startBase: 1, endBase: 3, result: 'safe' })
    return movements
  }

  if (outcome === '1B') {
    if (runners.third) movements.push({ runnerId: runners.third, startBase: 3, endBase: 4, result: 'scored' })
    if (runners.second) movements.push({ runnerId: runners.second, startBase: 2, endBase: 3, result: 'safe' })
    if (runners.first) movements.push({ runnerId: runners.first, startBase: 1, endBase: 2, result: 'safe' })
    return movements
  }

  if (outcome === 'BB' || outcome === 'IBB' || outcome === 'HBP') {
    // Force advances only
    if (runners.first) {
      if (runners.second) {
        if (runners.third) {
          movements.push({ runnerId: runners.third, startBase: 3, endBase: 4, result: 'scored' })
        }
        movements.push({ runnerId: runners.second, startBase: 2, endBase: 3, result: 'safe' })
      }
      movements.push({ runnerId: runners.first, startBase: 1, endBase: 2, result: 'safe' })
    }
    return movements
  }

  // For outs, runners stay unless it's a ground out with force
  return movements
}

interface GameStore {
  game: GameState
  history: GameState[]
  futureHistory: GameState[]

  newGame: () => void
  setupTeams: (awayName: string, homeName: string) => void
  setPlayers: (side: 'away' | 'home', players: Player[]) => void
  setLineup: (side: 'away' | 'home', lineup: { playerId: string; position: FieldingPosition }[]) => void
  startGame: () => void
  recordAtBat: (outcome: AtBatOutcome, fielders?: number[], runnerMovements?: RunnerMovement[], batterOut?: boolean) => void
  recordBaserunning: (type: BaserunningEventType, runnerId: string, fromBase: 1 | 2 | 3) => void
  updatePlayer: (side: 'away' | 'home', playerId: string, updates: Partial<Player>) => void
  updatePosition: (side: 'away' | 'home', lineupIndex: number, position: FieldingPosition) => void
  updateTeamName: (side: 'away' | 'home', name: string) => void
  undo: () => void
  redo: () => void
  loadGame: (game: GameState) => void

  // MLB catch-up support
  setMlbGamePk: (gamePk: string) => void
  setLastReplayedPlayIndex: (index: number) => void
  addPlayer: (side: 'away' | 'home', player: Player) => void
  addLineupEntry: (side: 'away' | 'home', slotIndex: number, entry: { playerId: string; position: FieldingPosition }) => void
  /** Record an at-bat without adding to undo history (used during catch-up replay). */
  recordAtBatSilent: (outcome: AtBatOutcome, fielders?: number[], runnerMovements?: RunnerMovement[], batterOut?: boolean) => void
  /** Record a baserunning event without adding to undo history. */
  recordBaserunningSilent: (type: BaserunningEventType, runnerId: string, fromBase: 1 | 2 | 3) => void

  // Computed-like getters
  getCurrentBattingTeam: () => 'away' | 'home'
  getCurrentBatterPlayer: () => Player | null
  getCurrentBatterLineupPos: () => number
}

export const useGameStore = create<GameStore>((set, get) => ({
  game: createEmptyGame(),
  history: [],
  futureHistory: [],

  newGame: () => set({ game: createEmptyGame(), history: [], futureHistory: [] }),

  setupTeams: (awayName, homeName) => set(state => ({
    game: {
      ...state.game,
      away: { ...state.game.away, name: awayName },
      home: { ...state.game.home, name: homeName }
    }
  })),

  setPlayers: (side, players) => set(state => ({
    game: {
      ...state.game,
      [side]: { ...state.game[side], players }
    }
  })),

  setLineup: (side, lineup) => set(state => {
    const team = { ...state.game[side] }
    team.lineup = lineup.map((lineupEntry, index) => ({
      orderPosition: index + 1,
      entries: [{
        playerId: lineupEntry.playerId,
        position: lineupEntry.position,
        enteredInning: 1,
        enteredHalfInning: 'top' as HalfInning
      }]
    }))
    return { game: { ...state.game, [side]: team } }
  }),

  startGame: () => set(state => ({
    game: { ...state.game, status: 'in_progress' }
  })),

  updatePlayer: (side, playerId, updates) => set(state => {
    const team = { ...state.game[side] }
    team.players = team.players.map(player =>
      player.id === playerId ? { ...player, ...updates } : player
    )
    return { game: { ...state.game, [side]: team } }
  }),

  updatePosition: (side, lineupIndex, position) => set(state => {
    const team = { ...state.game[side] }
    team.lineup = team.lineup.map((slot, index) => {
      if (index !== lineupIndex) return slot
      const entries = [...slot.entries]
      if (entries.length > 0) {
        entries[entries.length - 1] = { ...entries[entries.length - 1], position }
      }
      return { ...slot, entries }
    })
    return { game: { ...state.game, [side]: team } }
  }),

  updateTeamName: (side, name) => set(state => ({
    game: {
      ...state.game,
      [side]: { ...state.game[side], name }
    }
  })),

  recordAtBat: (outcome, fielders, customRunnerMovements, batterOut) => {
    const state = get()
    const snapshot = JSON.parse(JSON.stringify(state.game)) as GameState
    const gameCopy = JSON.parse(JSON.stringify(state.game)) as GameState

    const side = gameCopy.currentHalfInning === 'top' ? 'away' : 'home'
    const batterIndex = getCurrentBatterIndex(gameCopy)
    const team = gameCopy[side]

    if (!team.lineup[batterIndex]?.entries.length) return

    const batterId = team.lineup[batterIndex].entries[
      team.lineup[batterIndex].entries.length - 1
    ].playerId

    const runnerMovements = customRunnerMovements || defaultRunnerAdvance(outcome, gameCopy.runners, batterId)

    // Count RBIs
    let rbis = runnerMovements.filter(movement => movement.result === 'scored').length
    if (outcome === 'HR') rbis++ // batter scores too

    // Determine if batter is out.
    // For DP/TP: default true unless explicitly false.
    // For other outcomes: use explicit batterOut if provided, otherwise derive from outcome type.
    // This supports dropped third strike (K with batterOut: false).
    const isMultiOut = outcome === 'DP' || outcome === 'TP'
    const batterIsOut = batterOut ?? (isMultiOut ? true : isOut(outcome))

    const atBat: AtBat = {
      id: uuid(),
      batterId,
      lineupPosition: batterIndex + 1,
      outcome,
      fielders,
      rbis,
      runnerMovements,
      batterOut: (isMultiOut || batterOut !== undefined) ? batterIsOut : undefined,
    }

    const halfInning = ensureHalfInning(gameCopy)
    halfInning.events.push({ kind: 'at-bat', data: atBat })

    // Update stats
    if (isHit(outcome)) halfInning.hits++
    if (outcome === 'E') halfInning.errors++
    halfInning.runs += runnerMovements.filter(movement => movement.result === 'scored').length
    if (outcome === 'HR') halfInning.runs++ // batter scores

    // Update runners — clear old bases first
    for (const movement of runnerMovements) {
      if (movement.startBase === 1) gameCopy.runners.first = null
      if (movement.startBase === 2) gameCopy.runners.second = null
      if (movement.startBase === 3) gameCopy.runners.third = null
    }
    for (const movement of runnerMovements) {
      if (movement.endBase === 1) gameCopy.runners.first = movement.runnerId
      if (movement.endBase === 2) gameCopy.runners.second = movement.runnerId
      if (movement.endBase === 3) gameCopy.runners.third = movement.runnerId
    }

    // Place batter
    const batterReaches = isReach(outcome) || (isMultiOut && !batterIsOut) || (!batterIsOut && isOut(outcome))
    if (batterReaches) {
      if (outcome === 'HR') {
        // Batter scores, don't place on base
      } else if (outcome === '3B') {
        gameCopy.runners.third = batterId
      } else if (outcome === '2B') {
        gameCopy.runners.second = batterId
      } else {
        gameCopy.runners.first = batterId
      }
    }

    // Update outs
    gameCopy.outs += atBatOutsRecorded(atBat)

    // Check for half-inning over
    if (gameCopy.outs >= 3) {
      advanceHalfInning(gameCopy)
    }

    set({
      game: gameCopy,
      history: [...state.history, snapshot],
      futureHistory: []
    })
  },

  recordBaserunning: (type, runnerId, fromBase) => {
    const state = get()
    const snapshot = JSON.parse(JSON.stringify(state.game)) as GameState
    const gameCopy = JSON.parse(JSON.stringify(state.game)) as GameState

    const halfInning = ensureHalfInning(gameCopy)

    let toBase: 0 | 1 | 2 | 3 | 4
    const advanceTypes: BaserunningEventType[] = ['SB', 'WP', 'PB', 'BK']
    if (advanceTypes.includes(type)) {
      // Runner advances one base
      toBase = (fromBase + 1) as 2 | 3 | 4
    } else {
      // CS or PKO: runner is out
      toBase = 0
    }

    const baserunningEvent: BaserunningEvent = {
      id: uuid(),
      type,
      runnerId,
      fromBase,
      toBase
    }
    halfInning.events.push({ kind: 'baserunning', data: baserunningEvent })

    // Update runners
    if (fromBase === 1) gameCopy.runners.first = null
    if (fromBase === 2) gameCopy.runners.second = null
    if (fromBase === 3) gameCopy.runners.third = null

    if (advanceTypes.includes(type)) {
      if (toBase === 2) gameCopy.runners.second = runnerId
      if (toBase === 3) gameCopy.runners.third = runnerId
      if (toBase === 4) halfInning.runs++
    } else {
      // CS or PKO: runner is out
      gameCopy.outs++
      if (gameCopy.outs >= 3) {
        advanceHalfInning(gameCopy)
      }
    }

    set({
      game: gameCopy,
      history: [...state.history, snapshot],
      futureHistory: []
    })
  },

  undo: () => {
    const state = get()
    if (state.history.length === 0) return
    const previousGame = state.history[state.history.length - 1]
    set({
      game: previousGame,
      history: state.history.slice(0, -1),
      futureHistory: [state.game, ...state.futureHistory]
    })
  },

  redo: () => {
    const state = get()
    if (state.futureHistory.length === 0) return
    const nextGame = state.futureHistory[0]
    set({
      game: nextGame,
      history: [...state.history, state.game],
      futureHistory: state.futureHistory.slice(1)
    })
  },

  loadGame: (loadedGame) => set({ game: loadedGame, history: [], futureHistory: [] }),

  // ─── MLB Catch-Up Support ───────────────────────────────

  setMlbGamePk: (gamePk) => set(state => ({
    game: { ...state.game, mlbGamePk: gamePk }
  })),

  setLastReplayedPlayIndex: (index) => set(state => ({
    game: { ...state.game, lastReplayedPlayIndex: index }
  })),

  addPlayer: (side, player) => set(state => {
    const team = { ...state.game[side] }
    team.players = [...team.players, player]
    return { game: { ...state.game, [side]: team } }
  }),

  addLineupEntry: (side, slotIndex, entry) => set(state => {
    const team = { ...state.game[side] }
    team.lineup = team.lineup.map((slot, index) => {
      if (index !== slotIndex) return slot
      return {
        ...slot,
        entries: [...slot.entries, {
          playerId: entry.playerId,
          position: entry.position,
          enteredInning: state.game.currentInning,
          enteredHalfInning: state.game.currentHalfInning
        }]
      }
    })
    return { game: { ...state.game, [side]: team } }
  }),

  recordAtBatSilent: (outcome, fielders, customRunnerMovements, batterOut) => {
    // Same logic as recordAtBat but without history tracking
    const state = get()
    const gameCopy = JSON.parse(JSON.stringify(state.game)) as GameState

    const side = gameCopy.currentHalfInning === 'top' ? 'away' : 'home'
    const batterIndex = getCurrentBatterIndex(gameCopy)
    const team = gameCopy[side]

    if (!team.lineup[batterIndex]?.entries.length) return

    const batterId = team.lineup[batterIndex].entries[
      team.lineup[batterIndex].entries.length - 1
    ].playerId

    const runnerMovements = customRunnerMovements || defaultRunnerAdvance(outcome, gameCopy.runners, batterId)

    let rbis = runnerMovements.filter(movement => movement.result === 'scored').length
    if (outcome === 'HR') rbis++

    const isMultiOut = outcome === 'DP' || outcome === 'TP'
    const batterIsOut = batterOut ?? (isMultiOut ? true : isOut(outcome))

    const atBat: AtBat = {
      id: uuid(),
      batterId,
      lineupPosition: batterIndex + 1,
      outcome,
      fielders,
      rbis,
      runnerMovements,
      batterOut: (isMultiOut || batterOut !== undefined) ? batterIsOut : undefined,
    }

    const halfInning = ensureHalfInning(gameCopy)
    halfInning.events.push({ kind: 'at-bat', data: atBat })

    if (isHit(outcome)) halfInning.hits++
    if (outcome === 'E') halfInning.errors++
    halfInning.runs += runnerMovements.filter(movement => movement.result === 'scored').length
    if (outcome === 'HR') halfInning.runs++

    for (const movement of runnerMovements) {
      if (movement.startBase === 1) gameCopy.runners.first = null
      if (movement.startBase === 2) gameCopy.runners.second = null
      if (movement.startBase === 3) gameCopy.runners.third = null
    }
    for (const movement of runnerMovements) {
      if (movement.endBase === 1) gameCopy.runners.first = movement.runnerId
      if (movement.endBase === 2) gameCopy.runners.second = movement.runnerId
      if (movement.endBase === 3) gameCopy.runners.third = movement.runnerId
    }

    const batterReaches = isReach(outcome) || (isMultiOut && !batterIsOut) || (!batterIsOut && isOut(outcome))
    if (batterReaches) {
      if (outcome === 'HR') { /* batter scores */ }
      else if (outcome === '3B') gameCopy.runners.third = batterId
      else if (outcome === '2B') gameCopy.runners.second = batterId
      else gameCopy.runners.first = batterId
    }

    gameCopy.outs += atBatOutsRecorded(atBat)
    if (gameCopy.outs >= 3) advanceHalfInning(gameCopy)

    set({ game: gameCopy })
  },

  recordBaserunningSilent: (type, runnerId, fromBase) => {
    const state = get()
    const gameCopy = JSON.parse(JSON.stringify(state.game)) as GameState

    const halfInning = ensureHalfInning(gameCopy)

    let toBase: 0 | 1 | 2 | 3 | 4
    const advanceTypes: BaserunningEventType[] = ['SB', 'WP', 'PB', 'BK']
    if (advanceTypes.includes(type)) {
      toBase = (fromBase + 1) as 2 | 3 | 4
    } else {
      toBase = 0
    }

    const baserunningEvent: BaserunningEvent = {
      id: uuid(),
      type,
      runnerId,
      fromBase,
      toBase
    }
    halfInning.events.push({ kind: 'baserunning', data: baserunningEvent })

    if (fromBase === 1) gameCopy.runners.first = null
    if (fromBase === 2) gameCopy.runners.second = null
    if (fromBase === 3) gameCopy.runners.third = null

    if (advanceTypes.includes(type)) {
      if (toBase === 2) gameCopy.runners.second = runnerId
      if (toBase === 3) gameCopy.runners.third = runnerId
      if (toBase === 4) halfInning.runs++
    } else {
      gameCopy.outs++
      if (gameCopy.outs >= 3) advanceHalfInning(gameCopy)
    }

    set({ game: gameCopy })
  },

  getCurrentBattingTeam: () => {
    return get().game.currentHalfInning === 'top' ? 'away' : 'home'
  },

  getCurrentBatterPlayer: () => {
    const { game } = get()
    const side = game.currentHalfInning === 'top' ? 'away' : 'home'
    const batterIndex = getCurrentBatterIndex(game)
    const slot = game[side].lineup[batterIndex]
    if (!slot?.entries.length) return null
    const currentEntry = slot.entries[slot.entries.length - 1]
    return game[side].players.find(player => player.id === currentEntry.playerId) || null
  },

  getCurrentBatterLineupPos: () => {
    return getCurrentBatterIndex(get().game) + 1
  }
}))
