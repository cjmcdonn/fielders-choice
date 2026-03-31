import type { AtBatOutcome, Runners } from '@/types/game'

interface OutcomeGridProps {
  onSelect: (outcome: AtBatOutcome) => void
  runners: Runners
  outs: number
}

interface OutcomeButton {
  label: string
  outcome: AtBatOutcome
  color: string
}

const OUTCOME_GROUPS: { title: string; buttons: OutcomeButton[] }[] = [
  {
    title: 'Hits',
    buttons: [
      { label: '1B', outcome: '1B', color: 'bg-green-600 hover:bg-green-500' },
      { label: '2B', outcome: '2B', color: 'bg-green-600 hover:bg-green-500' },
      { label: '3B', outcome: '3B', color: 'bg-green-600 hover:bg-green-500' },
      { label: 'HR', outcome: 'HR', color: 'bg-green-800 hover:bg-green-700' },
    ]
  },
  {
    title: 'Walk / HBP',
    buttons: [
      { label: 'BB', outcome: 'BB', color: 'bg-blue-600 hover:bg-blue-500' },
      { label: 'IBB', outcome: 'IBB', color: 'bg-blue-600 hover:bg-blue-500' },
      { label: 'HBP', outcome: 'HBP', color: 'bg-blue-600 hover:bg-blue-500' },
    ]
  },
  {
    title: 'Outs',
    buttons: [
      { label: 'GO', outcome: 'GO', color: 'bg-red-600 hover:bg-red-500' },
      { label: 'FO', outcome: 'FO', color: 'bg-red-600 hover:bg-red-500' },
      { label: 'LO', outcome: 'LO', color: 'bg-red-600 hover:bg-red-500' },
      { label: 'PO', outcome: 'PO', color: 'bg-red-600 hover:bg-red-500' },
    ]
  },
  {
    title: 'Strikeouts / Multi-Out',
    buttons: [
      { label: 'K', outcome: 'K', color: 'bg-red-800 hover:bg-red-700' },
      { label: 'KL', outcome: 'KL', color: 'bg-red-800 hover:bg-red-700' },
      { label: 'DP', outcome: 'DP', color: 'bg-red-950 hover:bg-red-900' },
      { label: 'TP', outcome: 'TP', color: 'bg-red-950 hover:bg-red-900' },
    ]
  },
  {
    title: 'Other',
    buttons: [
      { label: 'FC', outcome: 'FC', color: 'bg-orange-700 hover:bg-orange-600' },
      { label: 'E', outcome: 'E', color: 'bg-orange-700 hover:bg-orange-600' },
      { label: 'SAC', outcome: 'SAC', color: 'bg-gray-600 hover:bg-gray-500' },
      { label: 'SF', outcome: 'SF', color: 'bg-gray-600 hover:bg-gray-500' },
    ]
  }
]

function isImpossible(outcome: AtBatOutcome, runners: Runners, outs: number): boolean {
  const runnersOn = [runners.first, runners.second, runners.third].filter(Boolean).length
  const outsLeft = 3 - outs

  // DP needs at least 1 runner on base AND at least 2 outs still available (including this play)
  if (outcome === 'DP') return runnersOn === 0 || outsLeft < 2

  // TP needs at least 2 runners on base AND all 3 outs still available
  if (outcome === 'TP') return runnersOn < 2 || outsLeft < 3

  // FC requires a runner on base (fielder chose to get the other runner)
  if (outcome === 'FC') return runnersOn === 0

  // SAC bunt requires a runner on base to advance
  if (outcome === 'SAC') return runnersOn === 0

  // SF requires at least a runner on base (usually 3rd, but can tag from 2nd)
  if (outcome === 'SF') return runnersOn === 0

  return false
}

export default function OutcomeGrid({ onSelect, runners, outs }: OutcomeGridProps) {
  return (
    <div className="space-y-2">
      {OUTCOME_GROUPS.map(group => (
        <div key={group.title}>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 px-1">
            {group.title}
          </div>
          <div className="flex flex-wrap gap-1">
            {group.buttons.map(btn => {
              const disabled = isImpossible(btn.outcome, runners, outs)
              return (
                <button
                  key={btn.outcome}
                  onClick={() => onSelect(btn.outcome)}
                  disabled={disabled}
                  className={`${disabled ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : btn.color + ' text-white'} font-bold text-xs px-2 py-1 rounded transition-colors min-w-[3rem]`}
                >
                  {btn.outcome === 'KL' ? (
                    <span style={{ display: 'inline-block', transform: 'scaleX(-1)' }}>K</span>
                  ) : btn.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
