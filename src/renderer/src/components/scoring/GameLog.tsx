import { useGameStore } from '@/stores/gameStore'
import { getAtBats, atBatDisplayText } from '@/types/game'

export default function GameLog() {
  const game = useGameStore(state => state.game)
  const undo = useGameStore(state => state.undo)
  const historyLength = useGameStore(state => state.history.length)

  const allPlays = game.halfInnings
    .flatMap(halfInning =>
      getAtBats(halfInning).map(atBat => ({
        ...atBat,
        half: halfInning.half,
        inning: halfInning.inning
      }))
    )
    .reverse()

  if (allPlays.length === 0) {
    return (
      <div className="text-center text-gray-500 text-sm py-4">
        No plays recorded yet
      </div>
    )
  }

  const getSide = (half: string) => half === 'top' ? 'away' : 'home'

  const getPlayerName = (batterId: string, half: string): string => {
    const team = game[getSide(half)]
    const player = team.players.find(p => p.id === batterId)
    return player ? player.lastName : 'Unknown'
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wider text-gray-400">Play Log</span>
        {historyLength > 0 && (
          <button
            onClick={undo}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            Undo Last
          </button>
        )}
      </div>
      {allPlays.slice(0, 20).map((play) => (
        <div
          key={play.id}
          className="flex items-center gap-2 text-xs py-1.5 px-2 bg-[var(--scoring-surface)] rounded"
        >
          <span className="text-gray-500 w-12">
            {play.half === 'top' ? 'T' : 'B'}{play.inning}
          </span>
          <span className="text-gray-300 flex-1 truncate">
            {getPlayerName(play.batterId, play.half)}
          </span>
          <span className="font-mono font-bold text-white">
            {atBatDisplayText(play)}
          </span>
          {play.rbis > 0 && (
            <span className="text-yellow-400 text-[10px]">{play.rbis} RBI</span>
          )}
        </div>
      ))}
    </div>
  )
}
