import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useGameStore } from '@/stores/gameStore'
import type { Player, FieldingPosition } from '@/types/game'
import {
  fetchMLBGames, fetchMLBLineup,
  fetchNCAAGames, fetchNCAALineup,
  type GameOption, type LoadedLineup
} from '@/services/lineupService'

const POSITIONS: FieldingPosition[] = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF']

interface LineupRow {
  firstName: string
  lastName: string
  number: string
  position: FieldingPosition
}

const emptyRow = (): LineupRow => ({
  firstName: '',
  lastName: '',
  number: '',
  position: 'P'
})

type SetupStep = 'source' | 'pickGame' | 'lineup'
type LineupSource = 'mlb' | 'ncaa' | 'manual'

export default function GameSetup() {
  const { setupTeams, setPlayers, setLineup, startGame } = useGameStore()
  const [step, setStep] = useState<SetupStep>('source')
  const [source, setSource] = useState<LineupSource | null>(null)

  // Game picker state
  const [games, setGames] = useState<GameOption[]>([])
  const [loadingGames, setLoadingGames] = useState(false)
  const [loadingLineup, setLoadingLineup] = useState(false)
  const [gameError, setGameError] = useState<string | null>(null)
  const [searchDate, setSearchDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })

  // Lineup state
  const [awayName, setAwayName] = useState('')
  const [homeName, setHomeName] = useState('')
  const [awayLineup, setAwayLineup] = useState<LineupRow[]>(
    Array.from({ length: 9 }, (_, i) => ({ ...emptyRow(), position: POSITIONS[i] }))
  )
  const [homeLineup, setHomeLineup] = useState<LineupRow[]>(
    Array.from({ length: 9 }, (_, i) => ({ ...emptyRow(), position: POSITIONS[i] }))
  )
  const [activeTab, setActiveTab] = useState<'away' | 'home'>('away')

  const updateRow = (
    side: 'away' | 'home',
    idx: number,
    field: keyof LineupRow,
    value: string
  ) => {
    const setter = side === 'away' ? setAwayLineup : setHomeLineup
    setter(prev => prev.map((row, i) =>
      i === idx ? { ...row, [field]: value } : row
    ))
  }

  const handleSourceSelect = async (src: LineupSource) => {
    setSource(src)
    if (src === 'manual') {
      setStep('lineup')
      return
    }
    setStep('pickGame')
    setLoadingGames(true)
    setGameError(null)
    try {
      const fetcher = src === 'mlb' ? fetchMLBGames : fetchNCAAGames
      const result = await fetcher(searchDate)
      setGames(result)
      if (result.length === 0) {
        setGameError('No games found for this date')
      }
    } catch (e) {
      setGameError('Failed to load games. Check your internet connection.')
      console.error(e)
    } finally {
      setLoadingGames(false)
    }
  }

  const handleDateChange = async (newDate: string) => {
    setSearchDate(newDate)
    if (!source || source === 'manual') return
    setLoadingGames(true)
    setGameError(null)
    try {
      const fetcher = source === 'mlb' ? fetchMLBGames : fetchNCAAGames
      const result = await fetcher(newDate)
      setGames(result)
      if (result.length === 0) {
        setGameError('No games found for this date')
      }
    } catch (e) {
      setGameError('Failed to load games.')
      console.error(e)
    } finally {
      setLoadingGames(false)
    }
  }

  const handleGameSelect = async (game: GameOption) => {
    setLoadingLineup(true)
    setGameError(null)
    try {
      const fetcher = source === 'mlb' ? fetchMLBLineup : fetchNCAALineup
      const lineup: LoadedLineup = await fetcher(game.id)
      setAwayName(lineup.awayName)
      setHomeName(lineup.homeName)
      setAwayLineup(lineup.away.map(p => ({
        firstName: p.firstName,
        lastName: p.lastName,
        number: p.number,
        position: p.position
      })))
      setHomeLineup(lineup.home.map(p => ({
        firstName: p.firstName,
        lastName: p.lastName,
        number: p.number,
        position: p.position
      })))
      setStep('lineup')
    } catch (e) {
      setGameError('Failed to load lineup. The lineup may not be available yet.')
      console.error(e)
    } finally {
      setLoadingLineup(false)
    }
  }

  const handleStart = () => {
    setupTeams(awayName || 'Away', homeName || 'Home')

    for (const side of ['away', 'home'] as const) {
      const lineup = side === 'away' ? awayLineup : homeLineup
      const players: Player[] = lineup.map(row => ({
        id: uuid(),
        firstName: row.firstName,
        lastName: row.lastName || `Player`,
        number: row.number
      }))

      setPlayers(side, players)
      setLineup(
        side,
        players.map((p, i) => ({
          playerId: p.id,
          position: lineup[i].position
        }))
      )
    }

    startGame()
  }

  // ─── Step: Source Selection ────────────────────────────────

  if (step === 'source') {
    return (
      <div className="flex flex-col h-full bg-[var(--scoring-bg)] text-[var(--scoring-text)]">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold">New Game</h2>
          <p className="text-xs text-gray-400 mt-1">Choose how to set up lineups</p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
          <button
            onClick={() => handleSourceSelect('mlb')}
            className="w-full max-w-xs py-4 px-6 bg-[#1a3a5c] hover:bg-[#1e4a72] border border-[#2a5a8c] rounded-lg transition-colors text-left"
          >
            <div className="font-bold text-white text-sm">MLB Game</div>
            <div className="text-xs text-gray-400 mt-1">Load lineup from today's MLB games</div>
          </button>
          <button
            onClick={() => handleSourceSelect('ncaa')}
            className="w-full max-w-xs py-4 px-6 bg-[#3a2a1a] hover:bg-[#4a3622] border border-[#5a4a32] rounded-lg transition-colors text-left"
          >
            <div className="font-bold text-white text-sm">NCAA Game</div>
            <div className="text-xs text-gray-400 mt-1">Load lineup from college baseball</div>
          </button>
          <button
            onClick={() => handleSourceSelect('manual')}
            className="w-full max-w-xs py-4 px-6 bg-[var(--scoring-surface)] hover:bg-gray-700 border border-gray-600 rounded-lg transition-colors text-left"
          >
            <div className="font-bold text-white text-sm">Manual Entry</div>
            <div className="text-xs text-gray-400 mt-1">Enter lineups by hand</div>
          </button>
        </div>
      </div>
    )
  }

  // ─── Step: Pick Game ──────────────────────────────────────

  if (step === 'pickGame') {
    return (
      <div className="flex flex-col h-full bg-[var(--scoring-bg)] text-[var(--scoring-text)]">
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => setStep('source')}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              ← Back
            </button>
            <h2 className="text-lg font-bold">
              {source === 'mlb' ? 'MLB' : 'NCAA'} Games
            </h2>
          </div>
          <input
            type="date"
            value={searchDate}
            onChange={e => handleDateChange(e.target.value)}
            className="w-full px-3 py-2 bg-[var(--scoring-surface)] border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loadingGames && (
            <div className="text-center text-gray-400 text-sm py-8">Loading games...</div>
          )}
          {gameError && (
            <div className="text-center text-yellow-500 text-sm py-8">{gameError}</div>
          )}
          {!loadingGames && games.map(game => (
            <button
              key={game.id}
              onClick={() => handleGameSelect(game)}
              disabled={loadingLineup}
              className="w-full text-left mb-2 p-3 bg-[var(--scoring-surface)] hover:bg-gray-700 border border-gray-600 rounded-lg transition-colors disabled:opacity-50"
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-sm font-medium text-white">{game.away}</div>
                  <div className="text-xs text-gray-400">at</div>
                  <div className="text-sm font-medium text-white">{game.home}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">{game.time}</div>
                  <div className="text-xs text-gray-500 mt-1">{game.status}</div>
                </div>
              </div>
            </button>
          ))}
          {loadingLineup && (
            <div className="text-center text-gray-400 text-sm py-4">Loading lineup...</div>
          )}
        </div>
      </div>
    )
  }

  // ─── Step: Lineup Editor ──────────────────────────────────

  const activeLineup = activeTab === 'away' ? awayLineup : homeLineup

  return (
    <div className="flex flex-col h-full bg-[var(--scoring-bg)] text-[var(--scoring-text)]">
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center gap-2 mb-3">
          {source !== 'manual' && (
            <button
              onClick={() => setStep('pickGame')}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              ← Back
            </button>
          )}
          {source === 'manual' && (
            <button
              onClick={() => setStep('source')}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              ← Back
            </button>
          )}
          <h2 className="text-lg font-bold">Lineups</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider">Away Team</label>
            <input
              value={awayName}
              onChange={e => setAwayName(e.target.value)}
              placeholder="Away"
              className="w-full mt-1 px-3 py-2 bg-[var(--scoring-surface)] border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider">Home Team</label>
            <input
              value={homeName}
              onChange={e => setHomeName(e.target.value)}
              placeholder="Home"
              className="w-full mt-1 px-3 py-2 bg-[var(--scoring-surface)] border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setActiveTab('away')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            activeTab === 'away'
              ? 'bg-[var(--scoring-accent)] text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          {awayName || 'Away'} Lineup
        </button>
        <button
          onClick={() => setActiveTab('home')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            activeTab === 'home'
              ? 'bg-[var(--scoring-accent)] text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          {homeName || 'Home'} Lineup
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-[2rem_1fr_1fr_3rem_4rem] gap-1 mb-2 text-xs text-gray-500 uppercase tracking-wider px-1">
          <span>#</span>
          <span>First</span>
          <span>Last</span>
          <span>No.</span>
          <span>Pos</span>
        </div>
        {activeLineup.map((row, idx) => (
          <div key={idx} className="grid grid-cols-[2rem_1fr_1fr_3rem_4rem] gap-1 mb-1">
            <span className="flex items-center justify-center text-xs text-gray-500">{idx + 1}</span>
            <input
              value={row.firstName}
              onChange={e => updateRow(activeTab, idx, 'firstName', e.target.value)}
              placeholder="First"
              className="px-2 py-1.5 bg-[var(--scoring-surface)] border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
            />
            <input
              value={row.lastName}
              onChange={e => updateRow(activeTab, idx, 'lastName', e.target.value)}
              placeholder="Last"
              className="px-2 py-1.5 bg-[var(--scoring-surface)] border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
            />
            <input
              value={row.number}
              onChange={e => updateRow(activeTab, idx, 'number', e.target.value)}
              placeholder="#"
              className="px-2 py-1.5 bg-[var(--scoring-surface)] border border-gray-600 rounded text-sm text-center focus:outline-none focus:border-blue-500"
            />
            <select
              value={row.position}
              onChange={e => updateRow(activeTab, idx, 'position', e.target.value)}
              className="px-1 py-1.5 bg-[var(--scoring-surface)] border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
            >
              {POSITIONS.map(pos => (
                <option key={pos} value={pos}>{pos}</option>
              ))}
              <option value="DH">DH</option>
            </select>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-gray-700">
        <button
          onClick={handleStart}
          className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg text-sm uppercase tracking-wider transition-colors"
        >
          Start Game
        </button>
      </div>
    </div>
  )
}
