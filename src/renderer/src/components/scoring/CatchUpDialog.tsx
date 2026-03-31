import { useState, useCallback } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { replayPlays, type CatchUpProgress } from '@/services/catchUpService'

interface CatchUpDialogProps {
  gamePk: string
  gameStatus: string
  onComplete: () => void
  onSkip: () => void
}

export default function CatchUpDialog({ gamePk, gameStatus, onComplete, onSkip }: CatchUpDialogProps) {
  const [state, setState] = useState<'prompt' | 'loading' | 'done' | 'error'>('prompt')
  const [progress, setProgress] = useState<CatchUpProgress | null>(null)
  const [result, setResult] = useState<{ playsReplayed: number; errors: string[] } | null>(null)

  const store = useGameStore

  const handleCatchUp = useCallback(async () => {
    setState('loading')
    try {
      const storeApi = {
        getState: () => store.getState(),
        recordAtBatSilent: store.getState().recordAtBatSilent,
        recordBaserunningSilent: store.getState().recordBaserunningSilent,
        addPlayer: store.getState().addPlayer,
        addLineupEntry: store.getState().addLineupEntry,
        setMlbGamePk: store.getState().setMlbGamePk,
        setLastReplayedPlayIndex: store.getState().setLastReplayedPlayIndex,
      }

      const catchUpResult = await replayPlays(
        gamePk,
        storeApi,
        (prog) => setProgress(prog)
      )

      setResult(catchUpResult)
      setState('done')
    } catch (err) {
      console.error('[CatchUpDialog] Failed:', err)
      setResult({ playsReplayed: 0, errors: [err instanceof Error ? err.message : String(err)] })
      setState('error')
    }
  }, [gamePk, store])

  const statusLabel = gameStatus === 'Final' || gameStatus === 'Game Over'
    ? 'finished'
    : 'in progress'

  // ─── Prompt ────────────────────────────────────────────

  if (state === 'prompt') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-[var(--scoring-surface)] border border-gray-600 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
          <h3 className="text-lg font-bold text-white mb-2">Catch Up?</h3>
          <p className="text-sm text-gray-300 mb-4">
            This game is <span className="text-yellow-400 font-medium">{statusLabel}</span>.
            Would you like to automatically replay the plays that have already happened?
          </p>
          <p className="text-xs text-gray-500 mb-6">
            The scorecard and game state will be populated with all recorded plays from the MLB feed.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleCatchUp}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-sm transition-colors"
            >
              Catch Up
            </button>
            <button
              onClick={onSkip}
              className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium rounded-lg text-sm transition-colors"
            >
              Score Manually
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Loading ───────────────────────────────────────────

  if (state === 'loading') {
    const pct = progress ? Math.round((progress.current / progress.total) * 100) : 0
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-[var(--scoring-surface)] border border-gray-600 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
          <h3 className="text-lg font-bold text-white mb-4">Catching up...</h3>

          {/* Progress bar */}
          <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-blue-500 transition-all duration-150 ease-out rounded-full"
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="flex justify-between text-xs text-gray-400 mb-2">
            <span>
              {progress ? `${progress.current} / ${progress.total} plays` : 'Fetching play data...'}
            </span>
            <span>{pct}%</span>
          </div>

          {progress?.description && (
            <p className="text-xs text-gray-500 truncate">
              {progress.description}
            </p>
          )}
        </div>
      </div>
    )
  }

  // ─── Done / Error ──────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[var(--scoring-surface)] border border-gray-600 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-bold text-white mb-2">
          {state === 'done' ? 'Caught Up!' : 'Catch-Up Error'}
        </h3>

        {result && (
          <div className="mb-4">
            <p className="text-sm text-gray-300">
              Replayed <span className="text-green-400 font-bold">{result.playsReplayed}</span> plays.
            </p>
            {result.errors.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-yellow-500 font-medium mb-1">
                  {result.errors.length} play{result.errors.length > 1 ? 's' : ''} could not be replayed:
                </p>
                <div className="max-h-32 overflow-y-auto text-xs text-gray-500 bg-gray-800 rounded p-2">
                  {result.errors.map((err, i) => (
                    <div key={i} className="mb-1">{err}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <button
          onClick={onComplete}
          className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg text-sm transition-colors"
        >
          Start Scoring
        </button>
      </div>
    </div>
  )
}
