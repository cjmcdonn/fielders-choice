import type { GameState, HalfInning, AtBat, BaserunningEvent } from '@/types/game'
import { outcomeCountsAsAB, isHit, isOut, getAtBats, atBatDisplayText } from '@/types/game'

export interface CellData {
  text: string
  diamondPaths?: ('home-first' | 'first-second' | 'second-third' | 'third-home')[]
  caughtStealing?: ('home-first' | 'first-second' | 'second-third' | 'third-home')[]  // half-path with tick
  sbAnnotations?: ('home-first' | 'first-second' | 'second-third' | 'third-home')[]  // SB text outside diamond
  pkoAnnotations?: (1 | 2 | 3)[]  // bases where runner was picked off (PK label drawn next to base)
  stoppedAt?: (1 | 2 | 3)[]  // every base the runner held at (ticks drawn at each)
  scored?: boolean  // runner scored - shade the diamond
  rbis?: number
  outNumber?: number  // which out in the half-inning (1, 2, or 3)
}

export interface ScorecardData {
  players: { name: string; position: string }[]
  cells: Map<string, CellData> // key: "row-column" e.g. "1-3"
  columnInnings: Map<number, number> // column -> actual inning number (for relabeling shifted columns)
  stats: Map<string, Map<string, string>> // key: row, inner key: stat key
  pitchers: { name: string; stats: Record<string, string> }[]
}

export interface FullScorecardData {
  away: ScorecardData
  home: ScorecardData
  scoreboard: { away: (number | null)[]; home: (number | null)[] }
  header: Record<string, string>
}

/** Diamond paths for the BATTER only (what bases the batter reached) */
function getBatterDiamondPaths(outcome: string): CellData['diamondPaths'] {
  const paths: CellData['diamondPaths'] = []

  if (['1B', '2B', '3B', 'HR', 'BB', 'IBB', 'HBP', 'FC', 'E', 'CI'].includes(outcome)) {
    paths.push('home-first')
  }
  if (['2B', '3B', 'HR'].includes(outcome)) {
    paths.push('first-second')
  }
  if (['3B', 'HR'].includes(outcome)) {
    paths.push('second-third')
  }
  if (outcome === 'HR') {
    paths.push('third-home')
  }

  return paths
}

/** Diamond paths for a specific RUNNER's advancement on someone else's at-bat */
function getRunnerDiamondPaths(
  startBase: number,
  endBase: number
): CellData['diamondPaths'] {
  const paths: CellData['diamondPaths'] = []

  // Draw each segment the runner traversed
  if (startBase <= 1 && endBase >= 2) paths.push('first-second')
  if (startBase <= 2 && endBase >= 3) paths.push('second-third')
  if (endBase >= 4) paths.push('third-home')

  return paths
}

function mapSide(game: GameState, side: 'away' | 'home'): ScorecardData {
  const team = game[side]
  const half: HalfInning = side === 'away' ? 'top' : 'bottom'

  // Players
  const players = team.lineup.map(slot => {
    if (slot.entries.length === 0) return { name: '', position: '' }
    const currentEntry = slot.entries[slot.entries.length - 1]
    const player = team.players.find(p => p.id === currentEntry.playerId)
    return {
      name: player ? `${player.lastName}` : '',
      position: currentEntry.position
    }
  })

  // Cells
  const cells = new Map<string, CellData>()
  const sideHalfInnings = game.halfInnings.filter(halfInning => halfInning.half === half)

  // Build a lookup: playerId -> lineup position
  const playerToLineupPosition = new Map<string, number>()
  for (const slot of team.lineup) {
    for (const entry of slot.entries) {
      playerToLineupPosition.set(entry.playerId, slot.orderPosition)
    }
  }

  // Track columns: each inning gets a column, but if the lineup wraps (batting around),
  // the second time through uses the next column, shifting all subsequent innings right.
  // This mirrors the traditional paper scorecard convention.
  let currentColumn = 0
  let currentInning = 0
  const lineupPositionsUsedInColumn = new Set<number>()

  // Map column number -> actual inning (for relabeling headers when columns shift)
  const columnInnings = new Map<number, number>()

  let outsInHalfInning = 0
  // Track which column each player's at-bat cell is in (for drawing runner advances on the correct cell)
  const playerToColumn = new Map<string, number>()

  for (const halfInning of sideHalfInnings) {
    // New inning = new column, reset out counter
    if (halfInning.inning !== currentInning) {
      currentInning = halfInning.inning
      currentColumn++
      lineupPositionsUsedInColumn.clear()
      columnInnings.set(currentColumn, currentInning)
      outsInHalfInning = 0
    }

    // Iterate events in chronological order — at-bats and baserunning events interleaved
    for (const event of halfInning.events) {
      if (event.kind === 'at-bat') {
        const atBat = event.data as AtBat

        // If this lineup position already has an entry in this column, advance to next column
        // (batting around — same inning spills into next column)
        if (lineupPositionsUsedInColumn.has(atBat.lineupPosition)) {
          currentColumn++
          lineupPositionsUsedInColumn.clear()
          columnInnings.set(currentColumn, currentInning)
        }
        lineupPositionsUsedInColumn.add(atBat.lineupPosition)

        const column = currentColumn

        // 1. Batter's cell: show outcome text + batter's own diamond path
        const batterCellKey = `${atBat.lineupPosition}-${column}`
        const text = atBatDisplayText(atBat)
        const batterPaths = getBatterDiamondPaths(atBat.outcome)

        // Determine where the batter ended up
        let batterStopBase: 1 | 2 | 3 | undefined = undefined
        if (atBat.outcome === '3B') batterStopBase = 3
        else if (atBat.outcome === '2B') batterStopBase = 2
        else if (['1B', 'BB', 'IBB', 'HBP', 'FC', 'E', 'CI'].includes(atBat.outcome)) batterStopBase = 1
        // HR = scored, no tick

        const batterStops: (1 | 2 | 3)[] = []
        if (batterStopBase) batterStops.push(batterStopBase)
        const batterScored = atBat.outcome === 'HR'

        // Determine out numbers: runners out first, then batter (if out)
        const runnersRetired: string[] = []
        for (const movement of atBat.runnerMovements) {
          if (movement.result === 'out') runnersRetired.push(movement.runnerId)
        }

        // Assign out numbers to runners first
        for (const _runnerId of runnersRetired) {
          outsInHalfInning++
        }

        // Batter out number: use batterOut field for DP/TP, isOut for regular outcomes
        const isMultiOut = atBat.outcome === 'DP' || atBat.outcome === 'TP'
        const batterIsOut = isMultiOut ? (atBat.batterOut !== false) : isOut(atBat.outcome)
        let batterOutNumber: number | undefined = undefined
        if (batterIsOut) {
          outsInHalfInning++
          batterOutNumber = outsInHalfInning
        }

        cells.set(batterCellKey, {
          text,
          diamondPaths: batterPaths,
          stoppedAt: batterStops.length > 0 ? batterStops : undefined,
          scored: batterScored || undefined,
          rbis: atBat.rbis,
          outNumber: batterOutNumber
        })

        // Track this batter's column for future runner advancement
        playerToColumn.set(atBat.batterId, column)

        // 2. Runner cells: each runner's advancement goes on THEIR original at-bat cell
        // Pre-calculate out numbers for runners on this play
        const runnerOutNumbers = new Map<string, number>()
        {
          let outCount = outsInHalfInning - (batterOutNumber ? 1 : 0) - runnersRetired.length
          for (const retiredRunnerId of runnersRetired) {
            outCount++
            runnerOutNumbers.set(retiredRunnerId, outCount)
          }
        }

        for (const movement of atBat.runnerMovements) {
          const runnerLineupPosition = playerToLineupPosition.get(movement.runnerId)
          if (!runnerLineupPosition) continue

          // Use the runner's original at-bat column, not the current at-bat's column
          const runnerColumn = playerToColumn.get(movement.runnerId) || column
          const runnerCellKey = `${runnerLineupPosition}-${runnerColumn}`
          // Don't overwrite if this is the same cell as the batter
          if (runnerCellKey === batterCellKey) continue

          const runnerPaths = getRunnerDiamondPaths(movement.startBase, movement.endBase)
          const runnerStopBase: 1 | 2 | 3 | undefined =
            (movement.endBase >= 1 && movement.endBase <= 3) ? movement.endBase as 1 | 2 | 3 : undefined
          const existingCell = cells.get(runnerCellKey)

          const runnerStops = [...(existingCell?.stoppedAt || [])]
          if (runnerStopBase && !runnerStops.includes(runnerStopBase)) runnerStops.push(runnerStopBase)
          const runnerScored = movement.endBase === 4 || movement.result === 'scored' || existingCell?.scored
          const runnerOutNumber = movement.result === 'out' ? runnerOutNumbers.get(movement.runnerId) : undefined

          if (existingCell) {
            cells.set(runnerCellKey, {
              ...existingCell,
              diamondPaths: [...new Set([...(existingCell.diamondPaths || []), ...(runnerPaths || [])])],
              stoppedAt: runnerStops.length > 0 ? runnerStops : undefined,
              scored: runnerScored || undefined,
              outNumber: runnerOutNumber || existingCell.outNumber
            })
          } else {
            cells.set(runnerCellKey, {
              text: '',
              diamondPaths: runnerPaths,
              stoppedAt: runnerStops.length > 0 ? runnerStops : undefined,
              scored: runnerScored || undefined,
              outNumber: runnerOutNumber
            })
          }
        }
      } else {
        // Baserunning event (SB, CS, PKO)
        const baserunningEvent = event.data as BaserunningEvent
        const runnerLineupPosition = playerToLineupPosition.get(baserunningEvent.runnerId)
        if (!runnerLineupPosition) continue

        const runnerColumn = playerToColumn.get(baserunningEvent.runnerId) || currentColumn
        const runnerCellKey = `${runnerLineupPosition}-${runnerColumn}`
        const existingCell = cells.get(runnerCellKey)

        const runnerStops = [...(existingCell?.stoppedAt || [])]
        let scored = existingCell?.scored
        let outNumber = existingCell?.outNumber

        // Map fromBase to the path segment name
        const baseToPathSegment: Record<number, 'home-first' | 'first-second' | 'second-third' | 'third-home'> = {
          1: 'first-second',
          2: 'second-third',
          3: 'third-home'
        }
        const pathSegment = baseToPathSegment[baserunningEvent.fromBase]

        if (baserunningEvent.type === 'SB') {
          // Successful steal: full path line + SB annotation outside diamond
          const stealPaths = getRunnerDiamondPaths(baserunningEvent.fromBase, baserunningEvent.toBase)
          if (baserunningEvent.toBase >= 1 && baserunningEvent.toBase <= 3) {
            const stopBase = baserunningEvent.toBase as 1 | 2 | 3
            if (!runnerStops.includes(stopBase)) runnerStops.push(stopBase)
          }
          if (baserunningEvent.toBase === 4) scored = true

          const mergedDiamondPaths = [...new Set([...(existingCell?.diamondPaths || []), ...(stealPaths || [])])]
          const mergedSbAnnotations = [...(existingCell?.sbAnnotations || [])]
          if (pathSegment && !mergedSbAnnotations.includes(pathSegment)) mergedSbAnnotations.push(pathSegment)

          cells.set(runnerCellKey, {
            ...(existingCell || { text: '' }),
            diamondPaths: mergedDiamondPaths,
            sbAnnotations: mergedSbAnnotations.length > 0 ? mergedSbAnnotations : undefined,
            stoppedAt: runnerStops.length > 0 ? runnerStops : undefined,
            scored: scored || undefined,
            outNumber: outNumber
          })
        } else {
          // CS or PKO: half-path with perpendicular tick + out number
          outsInHalfInning++
          outNumber = outsInHalfInning

          const mergedCaughtStealing = [...(existingCell?.caughtStealing || [])]
          if (baserunningEvent.type === 'CS' && pathSegment && !mergedCaughtStealing.includes(pathSegment)) {
            mergedCaughtStealing.push(pathSegment)
          }

          const mergedPkoAnnotations = [...(existingCell?.pkoAnnotations || [])]
          if (baserunningEvent.type === 'PKO' && !mergedPkoAnnotations.includes(baserunningEvent.fromBase as 1 | 2 | 3)) {
            mergedPkoAnnotations.push(baserunningEvent.fromBase as 1 | 2 | 3)
          }

          cells.set(runnerCellKey, {
            ...(existingCell || { text: '' }),
            diamondPaths: existingCell?.diamondPaths,
            caughtStealing: mergedCaughtStealing.length > 0 ? mergedCaughtStealing : undefined,
            pkoAnnotations: mergedPkoAnnotations.length > 0 ? mergedPkoAnnotations : undefined,
            stoppedAt: runnerStops.length > 0 ? runnerStops : undefined,
            scored: scored || undefined,
            outNumber: outNumber
          })
        }
      }
    }
  }

  // Stats per player row
  const stats = new Map<string, Map<string, string>>()
  for (let row = 1; row <= team.lineup.length; row++) {
    const playerAtBats = sideHalfInnings.flatMap(halfInning =>
      getAtBats(halfInning).filter(atBat => atBat.lineupPosition === row)
    )
    const rowStats = new Map<string, string>()
    const officialAtBats = playerAtBats.filter(atBat => outcomeCountsAsAB(atBat.outcome)).length
    const hits = playerAtBats.filter(atBat => isHit(atBat.outcome)).length
    const runs = playerAtBats.reduce((sum, atBat) =>
      sum + atBat.runnerMovements.filter(movement => movement.runnerId === playerAtBats[0]?.batterId && movement.result === 'scored').length
    , 0)
    const rbis = playerAtBats.reduce((sum, atBat) => sum + atBat.rbis, 0)

    if (officialAtBats > 0 || hits > 0 || rbis > 0) {
      rowStats.set('AB', String(officialAtBats))
      rowStats.set('R', String(runs))
      rowStats.set('H', String(hits))
      rowStats.set('RBI', String(rbis))
      stats.set(String(row), rowStats)
    }
  }

  // Pitchers
  const pitchers = team.pitchers.map(appearance => {
    const player = team.players.find(p => p.id === appearance.playerId)
    return {
      name: player ? player.lastName : '',
      stats: {
        IP: String(appearance.stats.inningsPitched),
        H: String(appearance.stats.hits),
        R: String(appearance.stats.runs),
        ER: String(appearance.stats.earnedRuns),
        BB: String(appearance.stats.walks),
        K: String(appearance.stats.strikeouts)
      }
    }
  })

  return { players, cells, columnInnings, stats, pitchers }
}

export function mapGameToScorecard(game: GameState): FullScorecardData {
  const maxInnings = Math.max(
    9,
    ...game.halfInnings.map(halfInning => halfInning.inning)
  )

  // Scoreboard
  const awayRuns: (number | null)[] = []
  const homeRuns: (number | null)[] = []
  for (let inning = 1; inning <= maxInnings; inning++) {
    const awayHalfInning = game.halfInnings.find(halfInning => halfInning.inning === inning && halfInning.half === 'top')
    const homeHalfInning = game.halfInnings.find(halfInning => halfInning.inning === inning && halfInning.half === 'bottom')
    awayRuns.push(awayHalfInning ? awayHalfInning.runs : null)
    homeRuns.push(homeHalfInning ? homeHalfInning.runs : null)
  }

  // Header
  const header: Record<string, string> = {}
  if (game.meta.date) header.date = game.meta.date
  if (game.meta.startTime) header.start = game.meta.startTime
  if (game.meta.endTime) header.end = game.meta.endTime
  header.awayTeam = game.away.name
  header.homeTeam = game.home.name
  if (game.meta.venue) header.venue = game.meta.venue
  if (game.meta.weather) header.weather = game.meta.weather

  return {
    away: mapSide(game, 'away'),
    home: mapSide(game, 'home'),
    scoreboard: { away: awayRuns, home: homeRuns },
    header
  }
}
