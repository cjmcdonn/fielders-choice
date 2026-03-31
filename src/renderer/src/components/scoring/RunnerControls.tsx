import { useGameStore } from '@/stores/gameStore'
import type { RunnerMovement } from '@/types/game'

interface RunnerControlsProps {
  onConfirm: (movements: RunnerMovement[]) => void
  movements: RunnerMovement[]
  onUpdate: (movements: RunnerMovement[]) => void
}

export default function RunnerControls({ onConfirm, movements, onUpdate }: RunnerControlsProps) {
  const game = useGameStore(state => state.game)
  const side = game.currentHalfInning === 'top' ? 'away' : 'home'

  const getPlayerName = (id: string): string => {
    const player = game[side].players.find(p => p.id === id)
    return player ? player.lastName : 'Unknown'
  }

  const updateMovement = (idx: number, endBase: 0 | 1 | 2 | 3 | 4) => {
    const updated = movements.map((m, i) =>
      i === idx ? {
        ...m,
        endBase,
        result: endBase === 0 ? 'out' as const :
                endBase === 4 ? 'scored' as const : 'safe' as const
      } : m
    )
    onUpdate(updated)
  }

  if (movements.length === 0) return null

  return (
    <div className="bg-[var(--scoring-surface)] rounded-lg p-3 border border-gray-600">
      <div className="text-xs uppercase tracking-wider text-gray-400 mb-2">Runner Advancement</div>
      <div className="space-y-2">
        {movements.map((m, idx) => (
          <div key={m.runnerId} className="flex items-center gap-2">
            <span className="text-sm w-20 truncate">{getPlayerName(m.runnerId)}</span>
            <span className="text-xs text-gray-500">from {m.startBase}B →</span>
            <div className="flex gap-1">
              {m.startBase < 4 && (
                <>
                  {m.startBase < 2 && (
                    <button
                      onClick={() => updateMovement(idx, 2)}
                      className={`px-2 py-1 text-xs rounded ${m.endBase === 2 ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                    >2B</button>
                  )}
                  {m.startBase < 3 && (
                    <button
                      onClick={() => updateMovement(idx, 3)}
                      className={`px-2 py-1 text-xs rounded ${m.endBase === 3 ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                    >3B</button>
                  )}
                  <button
                    onClick={() => updateMovement(idx, 4)}
                    className={`px-2 py-1 text-xs rounded ${m.endBase === 4 ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                  >Score</button>
                  <button
                    onClick={() => updateMovement(idx, 0)}
                    className={`px-2 py-1 text-xs rounded ${m.endBase === 0 ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                  >Out</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={() => onConfirm(movements)}
        className="mt-3 w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm rounded transition-colors"
      >
        Confirm Play
      </button>
    </div>
  )
}
