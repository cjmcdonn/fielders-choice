import { useGameStore } from '@/stores/gameStore'

// Fielder positions with approximate locations on the diamond
const FIELDER_POSITIONS = [
  { num: 1, label: 'P', x: 70, y: 95 },
  { num: 2, label: 'C', x: 70, y: 145 },
  { num: 3, label: '1B', x: 100, y: 67 },
  { num: 4, label: '2B', x: 84, y: 50 },
  { num: 5, label: '3B', x: 40, y: 67 },
  { num: 6, label: 'SS', x: 56, y: 50 },
  { num: 7, label: 'LF', x: 25, y: 38 },
  { num: 8, label: 'CF', x: 70, y: 3 },
  { num: 9, label: 'RF', x: 115, y: 38 },
]

// Diamond geometry (shifted down so CF has room above)
// Home at bottom, 2B at top, 1B right, 3B left
const HOME = { x: 70, y: 135 }
const FIRST = { x: 125, y: 80 }
const SECOND = { x: 70, y: 25 }
const THIRD = { x: 15, y: 80 }

// Base size in SVG units
const BASE = 10

// Pitcher's mound is ~95.25% of the way from home to center (60.5/63.64)
const MOUND = { x: 70, y: HOME.y - (HOME.y - SECOND.y) * 0.5 * (60.5 / 63.64) * 2 }

export default function DiamondDisplay() {
  const game = useGameStore(state => state.game)
  const { runners } = game

  const getPlayerName = (playerId: string | null): string => {
    if (!playerId) return ''
    const side = game.currentHalfInning === 'top' ? 'away' : 'home'
    const player = game[side].players.find(p => p.id === playerId)
    return player ? player.lastName : ''
  }

  return (
    <div className="flex justify-center py-3">
      <svg viewBox="0 0 140 150" width="140" height="150">
        {/* Fielder position numbers */}
        {FIELDER_POSITIONS.map(fp => (
          <text
            key={fp.num}
            x={fp.x}
            y={fp.y}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#334155"
            fontSize="10"
            fontWeight="500"
          >
            {fp.num}
          </text>
        ))}

        {/* Baselines */}
        <line x1={HOME.x} y1={HOME.y} x2={FIRST.x} y2={FIRST.y} stroke="#475569" strokeWidth="1.5" />
        <line x1={FIRST.x} y1={FIRST.y} x2={SECOND.x} y2={SECOND.y} stroke="#475569" strokeWidth="1.5" />
        <line x1={SECOND.x} y1={SECOND.y} x2={THIRD.x} y2={THIRD.y} stroke="#475569" strokeWidth="1.5" />
        <line x1={THIRD.x} y1={THIRD.y} x2={HOME.x} y2={HOME.y} stroke="#475569" strokeWidth="1.5" />

        {/* Home plate - pentagon, point at basepath corner facing catcher */}
        <polygon
          points={`
            ${HOME.x - 6},${HOME.y - 12}
            ${HOME.x + 6},${HOME.y - 12}
            ${HOME.x + 6},${HOME.y - 6}
            ${HOME.x},${HOME.y}
            ${HOME.x - 6},${HOME.y - 6}
          `}
          fill="#64748b"
        />

        {/* 1st base - outside corner at basepath intersection, base extends into fair territory */}
        <rect
          x={-BASE / 2} y={-BASE / 2} width={BASE} height={BASE}
          transform={`translate(${FIRST.x - BASE * Math.SQRT2 / 2},${FIRST.y}) rotate(45)`}
          fill={runners.first ? '#f59e0b' : '#475569'}
          className="transition-colors"
        />
        {runners.first && (
          <text x={FIRST.x} y={FIRST.y - 8} textAnchor="middle" fill="#fbbf24" fontSize="8" fontWeight="bold">
            {getPlayerName(runners.first)}
          </text>
        )}

        {/* 2nd base - bottom corner at basepath intersection, base extends toward outfield */}
        <rect
          x={-BASE / 2} y={-BASE / 2} width={BASE} height={BASE}
          transform={`translate(${SECOND.x},${SECOND.y + BASE * Math.SQRT2 / 2}) rotate(45)`}
          fill={runners.second ? '#f59e0b' : '#475569'}
          className="transition-colors"
        />
        {runners.second && (
          <text x={SECOND.x} y={SECOND.y - 10} textAnchor="middle" fill="#fbbf24" fontSize="8" fontWeight="bold">
            {getPlayerName(runners.second)}
          </text>
        )}

        {/* 3rd base - outside corner at basepath intersection, base extends into fair territory */}
        <rect
          x={-BASE / 2} y={-BASE / 2} width={BASE} height={BASE}
          transform={`translate(${THIRD.x + BASE * Math.SQRT2 / 2},${THIRD.y}) rotate(45)`}
          fill={runners.third ? '#f59e0b' : '#475569'}
          className="transition-colors"
        />
        {runners.third && (
          <text x={THIRD.x} y={THIRD.y - 8} textAnchor="middle" fill="#fbbf24" fontSize="8" fontWeight="bold">
            {getPlayerName(runners.third)}
          </text>
        )}

        {/* Out indicators - centered in diamond */}
        {[0, 1, 2].map(i => (
          <circle
            key={i}
            cx={55 + i * 15}
            cy={80}
            r="5"
            fill={i < game.outs ? '#ef4444' : 'none'}
            stroke={i < game.outs ? '#ef4444' : '#475569'}
            strokeWidth="1.5"
          />
        ))}
      </svg>
    </div>
  )
}
