import { useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import type { FieldingPosition } from '@/types/game'

const POSITIONS: FieldingPosition[] = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']

interface LineupEditorProps {
  onClose: () => void
}

export default function LineupEditor({ onClose }: LineupEditorProps) {
  const game = useGameStore(state => state.game)
  const updatePlayer = useGameStore(state => state.updatePlayer)
  const updatePosition = useGameStore(state => state.updatePosition)
  const updateTeamName = useGameStore(state => state.updateTeamName)
  const [activeTab, setActiveTab] = useState<'away' | 'home'>('away')

  const team = game[activeTab]

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[var(--scoring-bg)] text-[var(--scoring-text)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-[var(--scoring-surface)]">
        <span className="font-bold text-sm">Edit Lineups</span>
        <button
          onClick={onClose}
          className="text-xs px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white rounded transition-colors"
        >
          Done
        </button>
      </div>

      {/* Team tabs */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setActiveTab('away')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            activeTab === 'away'
              ? 'bg-[var(--scoring-accent)] text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          {game.away.name}
        </button>
        <button
          onClick={() => setActiveTab('home')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            activeTab === 'home'
              ? 'bg-[var(--scoring-accent)] text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          {game.home.name}
        </button>
      </div>

      {/* Team name */}
      <div className="px-4 pt-3">
        <label className="text-xs text-gray-400 uppercase tracking-wider">Team Name</label>
        <input
          value={team.name}
          onChange={e => updateTeamName(activeTab, e.target.value)}
          className="w-full mt-1 px-3 py-2 bg-[var(--scoring-surface)] border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Lineup */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-[2rem_1fr_1fr_3rem_4rem] gap-1 mb-2 text-xs text-gray-500 uppercase tracking-wider px-1">
          <span>#</span>
          <span>First</span>
          <span>Last</span>
          <span>No.</span>
          <span>Pos</span>
        </div>
        {team.lineup.map((slot, idx) => {
          const entry = slot.entries[slot.entries.length - 1]
          if (!entry) return null
          const player = team.players.find(p => p.id === entry.playerId)
          if (!player) return null

          return (
            <div key={slot.orderPosition} className="grid grid-cols-[2rem_1fr_1fr_3rem_4rem] gap-1 mb-1">
              <span className="flex items-center justify-center text-xs text-gray-500">
                {idx + 1}
              </span>
              <input
                value={player.firstName}
                onChange={e => updatePlayer(activeTab, player.id, { firstName: e.target.value })}
                className="px-2 py-1.5 bg-[var(--scoring-surface)] border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
              />
              <input
                value={player.lastName}
                onChange={e => updatePlayer(activeTab, player.id, { lastName: e.target.value })}
                className="px-2 py-1.5 bg-[var(--scoring-surface)] border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
              />
              <input
                value={player.number}
                onChange={e => updatePlayer(activeTab, player.id, { number: e.target.value })}
                className="px-2 py-1.5 bg-[var(--scoring-surface)] border border-gray-600 rounded text-sm text-center focus:outline-none focus:border-blue-500"
              />
              <select
                value={entry.position}
                onChange={e => updatePosition(activeTab, idx, e.target.value as FieldingPosition)}
                className="px-1 py-1.5 bg-[var(--scoring-surface)] border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
              >
                {POSITIONS.map(pos => (
                  <option key={pos} value={pos}>{pos}</option>
                ))}
              </select>
            </div>
          )
        })}
      </div>
    </div>
  )
}
