import ScorecardPreview from './ScorecardPreview'

export default function ScorecardPanel() {
  return (
    <div className="flex h-full">
      <div className="flex-1 relative min-h-0">
        <div className="absolute inset-0 overflow-auto">
          <ScorecardPreview />
        </div>
      </div>
    </div>
  )
}
