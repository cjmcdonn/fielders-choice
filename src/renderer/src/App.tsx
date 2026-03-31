import { useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import SplitPanel from '@/components/layout/SplitPanel'
import GameSetup from '@/components/scoring/GameSetup'
import ScoringPanel from '@/components/scoring/ScoringPanel'
import ScorecardPanel from '@/components/scorecard/ScorecardPanel'

export default function App() {
  const status = useGameStore(state => state.game.status)
  const newGame = useGameStore(state => state.newGame)
  const loadGame = useGameStore(state => state.loadGame)
  const [showNewGameDialog, setShowNewGameDialog] = useState(false)

  const handleNew = () => {
    const game = useGameStore.getState().game
    if (game.status !== 'setup') {
      setShowNewGameDialog(true)
    } else {
      newGame()
    }
  }

  const handleNewGameSave = async () => {
    await handleSave()
    setShowNewGameDialog(false)
    newGame()
  }

  const handleNewGameNo = () => {
    setShowNewGameDialog(false)
    newGame()
  }

  const handleNewGameCancel = () => {
    setShowNewGameDialog(false)
  }

  const handleSave = async () => {
    const game = useGameStore.getState().game
    await window.api.saveGame(JSON.stringify(game, null, 2))
  }

  const handleLoad = async () => {
    const json = await window.api.loadGame()
    if (json) {
      try {
        const game = JSON.parse(json)
        loadGame(game)
      } catch (e) {
        console.error('Failed to parse game file:', e)
      }
    }
  }

  const leftPanel = (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#0d1117] border-b border-gray-800">
        <span className="font-bold text-white text-sm tracking-wide">Fielder's Choice</span>
        <div className="flex-1" />
        <button
          onClick={handleNew}
          className="text-xs px-2 py-1 text-gray-400 hover:text-white transition-colors"
        >
          New
        </button>
        <button
          onClick={handleSave}
          className="text-xs px-2 py-1 text-gray-400 hover:text-white transition-colors"
        >
          Save
        </button>
        <button
          onClick={handleLoad}
          className="text-xs px-2 py-1 text-gray-400 hover:text-white transition-colors"
        >
          Load
        </button>
      </div>
      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {status === 'setup' ? <GameSetup /> : <ScoringPanel />}
      </div>
    </div>
  )

  return (
    <>
      <SplitPanel
        left={leftPanel}
        right={<ScorecardPanel />}
      />
      {showNewGameDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[#1c2128] border border-gray-700 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-white font-bold text-sm mb-2">Game in progress</h3>
            <p className="text-gray-400 text-sm mb-5">Would you like to save before starting a new game?</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleNewGameCancel}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleNewGameNo}
                className="px-4 py-2 text-sm bg-gray-600 hover:bg-gray-500 text-white rounded transition-colors"
              >
                Discard
              </button>
              <button
                onClick={handleNewGameSave}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
