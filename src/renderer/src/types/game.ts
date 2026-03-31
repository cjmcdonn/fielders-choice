export type HalfInning = 'top' | 'bottom'

export type AtBatOutcome =
  | '1B' | '2B' | '3B' | 'HR'
  | 'BB' | 'IBB' | 'HBP'
  | 'FO' | 'LO' | 'PO'
  | 'GO' | 'DP' | 'TP'
  | 'K' | 'KL'
  | 'FC' | 'E' | 'SAC' | 'SF'
  | 'CI'

export type FieldingPosition =
  | 'P' | 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF'
  | 'DH' | 'PH' | 'PR'

export type RunnerResult = 'safe' | 'scored' | 'out' | 'stranded'

export interface Player {
  id: string
  firstName: string
  lastName: string
  number: string
}

export interface LineupEntry {
  playerId: string
  position: FieldingPosition
  enteredInning: number
  enteredHalfInning: HalfInning
}

export interface LineupSlot {
  orderPosition: number
  entries: LineupEntry[]
}

export interface RunnerMovement {
  runnerId: string
  startBase: 1 | 2 | 3
  endBase: 0 | 1 | 2 | 3 | 4 // 0=out, 4=scored
  result: RunnerResult
  fielders?: number[]
}

export interface Pitch {
  sequence: number
  result: 'ball' | 'strike_swinging' | 'strike_looking' | 'strike_foul' | 'in_play'
}

export interface AtBat {
  id: string
  batterId: string
  lineupPosition: number
  outcome: AtBatOutcome
  fielders?: number[]
  pitches?: Pitch[]
  rbis: number
  runnerMovements: RunnerMovement[]
  batterOut?: boolean  // explicitly track whether the batter is out (for DP/TP where batter may reach)
}

export type BaserunningEventType = 'SB' | 'CS' | 'PKO'

export interface BaserunningEvent {
  id: string
  type: BaserunningEventType
  runnerId: string
  fromBase: 1 | 2 | 3
  toBase: 0 | 1 | 2 | 3 | 4 // 0=out, 4=scored
}

/** Discriminated union: every event in a half-inning is either an at-bat or a baserunning event. */
export type HalfInningEvent =
  | { kind: 'at-bat'; data: AtBat }
  | { kind: 'baserunning'; data: BaserunningEvent }

export interface HalfInningState {
  inning: number
  half: HalfInning
  events: HalfInningEvent[]
  runs: number
  hits: number
  errors: number
  leftOnBase: number
}

// Convenience helpers to extract typed events from the unified array
export function getAtBats(halfInning: HalfInningState): AtBat[] {
  return halfInning.events.filter(e => e.kind === 'at-bat').map(e => e.data as AtBat)
}

export function getBaserunningEvents(halfInning: HalfInningState): BaserunningEvent[] {
  return halfInning.events.filter(e => e.kind === 'baserunning').map(e => e.data as BaserunningEvent)
}

export interface PitcherAppearance {
  playerId: string
  enteredInning: number
  enteredHalfInning: HalfInning
  exitedInning?: number
  exitedHalfInning?: HalfInning
  stats: {
    inningsPitched: number
    hits: number
    runs: number
    earnedRuns: number
    walks: number
    strikeouts: number
  }
}

export interface Team {
  name: string
  abbreviation?: string
  lineup: LineupSlot[]
  pitchers: PitcherAppearance[]
  players: Player[]
}

export interface GameMeta {
  date: string
  startTime?: string
  endTime?: string
  venue?: string
  weather?: string
}

export interface Runners {
  first: string | null
  second: string | null
  third: string | null
}

export interface GameState {
  id: string
  meta: GameMeta
  away: Team
  home: Team
  halfInnings: HalfInningState[]
  currentInning: number
  currentHalfInning: HalfInning
  outs: number
  runners: Runners
  status: 'setup' | 'in_progress' | 'final'
}

// Helpers
export const HIT_OUTCOMES: AtBatOutcome[] = ['1B', '2B', '3B', 'HR']
export const WALK_OUTCOMES: AtBatOutcome[] = ['BB', 'IBB', 'HBP']
export const OUT_OUTCOMES: AtBatOutcome[] = ['FO', 'LO', 'PO', 'GO', 'K', 'KL', 'SAC', 'SF']
export const MULTI_OUT_OUTCOMES: AtBatOutcome[] = ['DP', 'TP']
export const REACH_OUTCOMES: AtBatOutcome[] = [...HIT_OUTCOMES, ...WALK_OUTCOMES, 'FC', 'E', 'CI']

export function isHit(outcome: AtBatOutcome): boolean {
  return HIT_OUTCOMES.includes(outcome)
}

export function isOut(outcome: AtBatOutcome): boolean {
  return OUT_OUTCOMES.includes(outcome)
}

export function isReach(outcome: AtBatOutcome): boolean {
  return REACH_OUTCOMES.includes(outcome)
}

export function outcomeToDisplayText(outcome: AtBatOutcome, fielders?: number[]): string {
  if (fielders && fielders.length > 0) {
    if (outcome === 'GO') return fielders.length === 1 ? `G${fielders[0]}U` : `G${fielders.join('-')}`
    if (outcome === 'DP') return fielders.join('-')
    if (outcome === 'TP') return fielders.join('-')
    if (outcome === 'FC') return `FC${fielders.join('-')}`
    if (outcome === 'FO') return `F${fielders[0]}`
    if (outcome === 'LO') return `L${fielders[0]}`
    if (outcome === 'PO') return `P${fielders[0]}`
    if (outcome === 'E') return `E${fielders[0]}`
  }
  if (outcome === 'KL') return 'KL'
  return outcome
}

export function outcomeCountsAsAB(outcome: AtBatOutcome): boolean {
  return !['BB', 'IBB', 'HBP', 'SAC', 'SF', 'CI'].includes(outcome)
}

/** Derive the display text for an at-bat from its outcome and fielders. */
export function atBatDisplayText(atBat: AtBat): string {
  return outcomeToDisplayText(atBat.outcome, atBat.fielders)
}

/** Derive total outs recorded by an at-bat (runner outs + batter out). */
export function atBatOutsRecorded(atBat: AtBat): number {
  const runnerOuts = atBat.runnerMovements.filter(movement => movement.result === 'out').length
  const isMultiOut = atBat.outcome === 'DP' || atBat.outcome === 'TP'
  const batterIsOut = isMultiOut ? (atBat.batterOut !== false) : isOut(atBat.outcome)
  return runnerOuts + (batterIsOut ? 1 : 0)
}
