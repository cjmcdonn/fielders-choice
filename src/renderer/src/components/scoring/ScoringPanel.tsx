import { useState, useCallback } from 'react'
import { useGameStore } from '@/stores/gameStore'
import type { AtBatOutcome, RunnerMovement, BaserunningEventType } from '@/types/game'
import { isOut } from '@/types/game'
import DiamondDisplay from './DiamondDisplay'
import OutcomeGrid from './OutcomeGrid'
import RunnerControls from './RunnerControls'
import GameLog from './GameLog'
import LineupEditor from './LineupEditor'

function defaultRunnerMovementsForOutcome(
  outcome: AtBatOutcome,
  runners: { first: string | null; second: string | null; third: string | null }
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
  if (outcome === 'E') {
    if (runners.third) movements.push({ runnerId: runners.third, startBase: 3, endBase: 4, result: 'scored' })
    if (runners.second) movements.push({ runnerId: runners.second, startBase: 2, endBase: 3, result: 'safe' })
    if (runners.first) movements.push({ runnerId: runners.first, startBase: 1, endBase: 2, result: 'safe' })
    return movements
  }
  if (outcome === 'DP') {
    // Default DP: lead runner is out, others advance normally
    if (runners.first) movements.push({ runnerId: runners.first, startBase: 1, endBase: 0, result: 'out' })
    if (runners.second && !runners.first) movements.push({ runnerId: runners.second, startBase: 2, endBase: 0, result: 'out' })
    else if (runners.second) movements.push({ runnerId: runners.second, startBase: 2, endBase: 3, result: 'safe' })
    if (runners.third) movements.push({ runnerId: runners.third, startBase: 3, endBase: 4, result: 'scored' })
    return movements
  }
  if (outcome === 'TP') {
    // Default TP: all runners out
    if (runners.first) movements.push({ runnerId: runners.first, startBase: 1, endBase: 0, result: 'out' })
    if (runners.second) movements.push({ runnerId: runners.second, startBase: 2, endBase: 0, result: 'out' })
    if (runners.third) movements.push({ runnerId: runners.third, startBase: 3, endBase: 0, result: 'out' })
    return movements
  }
  if (['BB', 'IBB', 'HBP'].includes(outcome)) {
    if (runners.first) {
      if (runners.second) {
        if (runners.third) movements.push({ runnerId: runners.third, startBase: 3, endBase: 4, result: 'scored' })
        movements.push({ runnerId: runners.second, startBase: 2, endBase: 3, result: 'safe' })
      }
      movements.push({ runnerId: runners.first, startBase: 1, endBase: 2, result: 'safe' })
    }
    return movements
  }
  return movements
}

export default function ScoringPanel() {
  const game = useGameStore(state => state.game)
  const recordAtBat = useGameStore(state => state.recordAtBat)
  const recordBaserunning = useGameStore(state => state.recordBaserunning)
  const getCurrentBatterPlayer = useGameStore(state => state.getCurrentBatterPlayer)
  const getCurrentBatterLineupPos = useGameStore(state => state.getCurrentBatterLineupPos)

  // Calculate score
  const awayRuns = game.halfInnings
    .filter(halfInning => halfInning.half === 'top')
    .reduce((sum, halfInning) => sum + halfInning.runs, 0)
  const homeRuns = game.halfInnings
    .filter(halfInning => halfInning.half === 'bottom')
    .reduce((sum, halfInning) => sum + halfInning.runs, 0)

  const [showLineupEditor, setShowLineupEditor] = useState(false)
  const [pendingOutcome, setPendingOutcome] = useState<AtBatOutcome | null>(null)
  const [pendingFielders, setPendingFielders] = useState<string>('')
  const [pendingMovements, setPendingMovements] = useState<RunnerMovement[]>([])
  const [showFielderInput, setShowFielderInput] = useState(false)
  const [pendingBatterOut, setPendingBatterOut] = useState(true)

  const batter = getCurrentBatterPlayer()
  const batterPos = getCurrentBatterLineupPos()
  const hasRunners = game.runners.first || game.runners.second || game.runners.third

  const needsFielders = (outcome: AtBatOutcome) =>
    ['GO', 'FO', 'LO', 'PO', 'DP', 'TP', 'FC', 'E'].includes(outcome)

  // Map fielder position to the base they typically cover for force/tag outs
  const fielderToBase: Record<number, number> = {
    2: 4, // C → home
    3: 1, // 1B → 1st
    4: 2, // 2B → 2nd
    5: 3, // 3B → 3rd
    6: 2, // SS → 2nd
    1: 1, // P covering 1st (most common)
  }

  // Given a base where an out is made, which runner is forced/tagged there?
  // Out at 2nd → runner from 1st; out at 3rd → runner from 2nd; out at home → runner from 3rd
  const baseToRunner: Record<number, string | null> = {
    1: null, // out at 1st = batter (not a runner movement)
    2: game.runners.first,
    3: game.runners.second,
    4: game.runners.third,
  }

  /** Update runner movements for DP/TP based on fielder sequence.
   *  Also auto-sets pendingBatterOut based on whether sequence includes a throw to 1B. */
  const inferRunnerOuts = (fielderStr: string, outcome: AtBatOutcome, runners: typeof game.runners): RunnerMovement[] => {
    const fielders = fielderStr.split('-').map(Number).filter(n => !isNaN(n) && n >= 1 && n <= 9)
    if (fielders.length < 2) return defaultRunnerMovementsForOutcome(outcome, runners)

    // Skip first fielder (they field the ball). Remaining fielders make outs at their bases.
    const outFielders = fielders.slice(1)
    const movements: RunnerMovement[] = []
    const runnersMarkedOut = new Set<string>()
    let batterOutInferred = false

    for (const f of outFielders) {
      const base = fielderToBase[f]
      if (!base) continue
      if (base === 1) {
        // Out at 1st = batter out
        batterOutInferred = true
        continue
      }
      const runnerId = baseToRunner[base]
      if (runnerId && !runnersMarkedOut.has(runnerId)) {
        runnersMarkedOut.add(runnerId)
        const startBase = base === 2 ? 1 : base === 3 ? 2 : base === 4 ? 3 : 0
        if (startBase > 0) {
          movements.push({ runnerId, startBase: startBase as 1 | 2 | 3, endBase: 0, result: 'out' })
        }
      }
    }

    // Auto-set batter out toggle based on inference
    setPendingBatterOut(batterOutInferred)

    // Add movements for runners NOT marked out (they may advance)
    if (runners.third && !runnersMarkedOut.has(runners.third)) {
      movements.push({ runnerId: runners.third, startBase: 3, endBase: 4, result: 'scored' })
    }
    if (runners.second && !runnersMarkedOut.has(runners.second)) {
      movements.push({ runnerId: runners.second, startBase: 2, endBase: 3, result: 'safe' })
    }
    if (runners.first && !runnersMarkedOut.has(runners.first)) {
      movements.push({ runnerId: runners.first, startBase: 1, endBase: 2, result: 'safe' })
    }

    return movements
  }

  const handleOutcome = useCallback((outcome: AtBatOutcome) => {
    const movements = defaultRunnerMovementsForOutcome(outcome, game.runners)
    const isMultiOut = outcome === 'DP' || outcome === 'TP'

    if (needsFielders(outcome) || isMultiOut || (hasRunners && !isOut(outcome) && outcome !== 'HR')) {
      setPendingOutcome(outcome)
      setPendingMovements(movements)
      setShowFielderInput(needsFielders(outcome))
      setPendingFielders('')
      setPendingBatterOut(isMultiOut ? true : isOut(outcome))
    } else {
      // No runners to advance or simple play - record immediately
      const fielders = undefined
      recordAtBat(outcome, fielders, movements)
    }
  }, [game.runners, hasRunners, recordAtBat])

  const handleConfirm = useCallback((movements: RunnerMovement[]) => {
    if (!pendingOutcome) return
    const fielders = pendingFielders
      ? pendingFielders.split('-').map(Number).filter(n => !isNaN(n))
      : undefined
    const isMultiOut = pendingOutcome === 'DP' || pendingOutcome === 'TP'
    recordAtBat(pendingOutcome, fielders, movements, isMultiOut ? pendingBatterOut : undefined)
    setPendingOutcome(null)
    setPendingFielders('')
    setPendingMovements([])
    setShowFielderInput(false)
    setPendingBatterOut(true)
  }, [pendingOutcome, pendingFielders, pendingBatterOut, recordAtBat])

  const handleCancel = () => {
    setPendingOutcome(null)
    setPendingFielders('')
    setPendingMovements([])
    setShowFielderInput(false)
    setPendingBatterOut(true)
  }

  const inningLabel = `${game.currentHalfInning === 'top' ? 'Top' : 'Bot'} ${game.currentInning}`
  const teamName = game.currentHalfInning === 'top' ? game.away.name : game.home.name

  return (
    <div className="relative flex flex-col h-full bg-[var(--scoring-bg)] text-[var(--scoring-text)]">
      {showLineupEditor && (
        <LineupEditor onClose={() => setShowLineupEditor(false)} />
      )}
      {/* Header: two columns */}
      <div className="px-3 py-3">
        <div className="flex gap-3">
          {/* Left column: score, inning/outs, batters, lineups */}
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            {/* Score box + Inning/Outs row */}
            <div className="flex items-center gap-3">
              <div className="bg-[#0a0e14] rounded overflow-hidden border border-gray-700 flex-shrink-0">
                <table className="text-xs font-mono">
                  <tbody>
                    <tr className={`border-b border-gray-800 ${game.currentHalfInning === 'top' ? 'bg-gray-800/50' : ''}`}>
                      <td className="px-2 py-1 text-gray-300 font-bold w-16 truncate">{game.away.abbreviation || game.away.name?.slice(0, 3).toUpperCase() || 'AWY'}</td>
                      <td className="px-2 py-1 text-white font-bold text-right w-8">{awayRuns}</td>
                    </tr>
                    <tr className={game.currentHalfInning === 'bottom' ? 'bg-gray-800/50' : ''}>
                      <td className="px-2 py-1 text-gray-300 font-bold w-16 truncate">{game.home.abbreviation || game.home.name?.slice(0, 3).toUpperCase() || 'HME'}</td>
                      <td className="px-2 py-1 text-white font-bold text-right w-8">{homeRuns}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] leading-none text-yellow-400">
                    {game.currentHalfInning === 'top' ? '▲' : '▼'}
                  </span>
                  <span className="text-sm font-bold text-white">{game.currentInning}</span>
                </div>
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className={`w-2 h-2 rounded-full ${
                        i < game.outs ? 'bg-yellow-400' : 'bg-gray-700 border border-gray-600'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Batters */}
            {batter && (
              <div>
                <div className="text-sm truncate">
                  <span className="text-gray-500 tabular-nums">{batterPos}.</span>{' '}
                  <span className="font-semibold text-white">{batter.lastName}</span>
                  {batter.number && <span className="text-gray-500 ml-1">#{batter.number}</span>}
                </div>
                {(() => {
                  const side = game.currentHalfInning === 'top' ? 'away' : 'home'
                  const team = game[side]
                  const lineupSize = team.lineup.length
                  const getUpcoming = (offset: number) => {
                    const idx = (batterPos - 1 + offset) % lineupSize
                    const slot = team.lineup[idx]
                    if (!slot?.entries.length) return null
                    const entry = slot.entries[slot.entries.length - 1]
                    const player = team.players.find(p => p.id === entry.playerId)
                    return player ? { pos: idx + 1, name: player.lastName, number: player.number } : null
                  }
                  const onDeck = getUpcoming(1)
                  const inHole = getUpcoming(2)
                  return (
                    <div className="mt-0.5">
                      {onDeck && (
                        <div className="text-xs text-gray-500 truncate">
                          <span className="text-gray-600 tabular-nums">{onDeck.pos}.</span> {onDeck.name}
                          {onDeck.number && <span className="text-gray-600 ml-1">#{onDeck.number}</span>}
                        </div>
                      )}
                      {inHole && (
                        <div className="text-xs text-gray-600 truncate">
                          <span className="text-gray-700 tabular-nums">{inHole.pos}.</span> {inHole.name}
                          {inHole.number && <span className="text-gray-700 ml-1">#{inHole.number}</span>}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Lineups button */}
            <button
              onClick={() => setShowLineupEditor(true)}
              className="text-xs px-2 py-1 text-gray-400 hover:text-white border border-gray-600 hover:border-gray-400 rounded transition-colors self-start"
            >
              Lineups
            </button>
          </div>

          {/* Right column: Diamond */}
          <div className="flex-shrink-0">
            <DiamondDisplay />
          </div>
        </div>
      </div>

      <div className="mx-3 border-t border-gray-700" />
      {/* Action Area */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 pt-3">
        {pendingOutcome ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-yellow-400">
                Recording: {pendingOutcome}
              </span>
              <button
                onClick={handleCancel}
                className="text-xs text-gray-400 hover:text-white"
              >
                Cancel
              </button>
            </div>

            {showFielderInput && (
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider">
                  Fielders (e.g. 6-3)
                </label>
                <input
                  value={pendingFielders}
                  onChange={e => {
                    // Auto-insert dashes between digits
                    const raw = e.target.value.replace(/[^0-9]/g, '')
                    const masked = raw.split('').join('-')
                    setPendingFielders(masked)
                    // For DP/TP, infer which runners are out from the fielder sequence
                    if (pendingOutcome && ['DP', 'TP'].includes(pendingOutcome)) {
                      setPendingMovements(inferRunnerOuts(masked, pendingOutcome, game.runners))
                    }
                  }}
                  placeholder="6-4-3"
                  className="w-full mt-1 px-3 py-2 bg-[var(--scoring-surface)] border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>
            )}

            {pendingOutcome && ['DP', 'TP'].includes(pendingOutcome) && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 uppercase tracking-wider">Batter:</span>
                <button
                  onClick={() => setPendingBatterOut(true)}
                  className={`px-2 py-1 text-xs rounded ${pendingBatterOut ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                >Out</button>
                <button
                  onClick={() => setPendingBatterOut(false)}
                  className={`px-2 py-1 text-xs rounded ${!pendingBatterOut ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                >Safe at 1B</button>
              </div>
            )}

            {pendingMovements.length > 0 ? (
              <RunnerControls
                movements={pendingMovements}
                onUpdate={setPendingMovements}
                onConfirm={handleConfirm}
              />
            ) : (
              <button
                onClick={() => handleConfirm([])}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm rounded transition-colors"
              >
                Confirm Play
              </button>
            )}
          </div>
        ) : (
          <OutcomeGrid onSelect={handleOutcome} runners={game.runners} outs={game.outs} />
        )}

        {/* Baserunning actions */}
        {hasRunners && !pendingOutcome && (
          <div className="mt-3 border-t border-gray-700 pt-3">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Baserunning</div>
            <div className="flex flex-wrap gap-1">
              {game.runners.first && (
                <>
                  <button onClick={() => recordBaserunning('SB', game.runners.first!, 1)}
                    className="text-xs px-2 py-1 bg-blue-900 hover:bg-blue-800 text-blue-200 rounded transition-colors">
                    SB 1→2
                  </button>
                  <button onClick={() => recordBaserunning('CS', game.runners.first!, 1)}
                    className="text-xs px-2 py-1 bg-red-900 hover:bg-red-800 text-red-200 rounded transition-colors">
                    CS 1→2
                  </button>
                  <button onClick={() => recordBaserunning('PKO', game.runners.first!, 1)}
                    className="text-xs px-2 py-1 bg-red-900 hover:bg-red-800 text-red-200 rounded transition-colors">
                    PK 1st
                  </button>
                </>
              )}
              {game.runners.second && (
                <>
                  <button onClick={() => recordBaserunning('SB', game.runners.second!, 2)}
                    className="text-xs px-2 py-1 bg-blue-900 hover:bg-blue-800 text-blue-200 rounded transition-colors">
                    SB 2→3
                  </button>
                  <button onClick={() => recordBaserunning('CS', game.runners.second!, 2)}
                    className="text-xs px-2 py-1 bg-red-900 hover:bg-red-800 text-red-200 rounded transition-colors">
                    CS 2→3
                  </button>
                  <button onClick={() => recordBaserunning('PKO', game.runners.second!, 2)}
                    className="text-xs px-2 py-1 bg-red-900 hover:bg-red-800 text-red-200 rounded transition-colors">
                    PK 2nd
                  </button>
                </>
              )}
              {game.runners.third && (
                <>
                  <button onClick={() => recordBaserunning('SB', game.runners.third!, 3)}
                    className="text-xs px-2 py-1 bg-blue-900 hover:bg-blue-800 text-blue-200 rounded transition-colors">
                    SB 3→H
                  </button>
                  <button onClick={() => recordBaserunning('CS', game.runners.third!, 3)}
                    className="text-xs px-2 py-1 bg-red-900 hover:bg-red-800 text-red-200 rounded transition-colors">
                    CS 3→H
                  </button>
                  <button onClick={() => recordBaserunning('PKO', game.runners.third!, 3)}
                    className="text-xs px-2 py-1 bg-red-900 hover:bg-red-800 text-red-200 rounded transition-colors">
                    PK 3rd
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <div className="mt-3 border-t border-gray-700 pt-3">
          <GameLog />
        </div>
      </div>
    </div>
  )
}
