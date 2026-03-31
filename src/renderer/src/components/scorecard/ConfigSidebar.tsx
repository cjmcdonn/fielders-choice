import { useScorecardStore } from '@/stores/scorecardStore'
import presets from '@/engine/presets'

export default function ConfigSidebar() {
  const { activePreset, applyPreset, updateConfig, config } = useScorecardStore()
  const theme = (config as any)?.theme || {}
  const grid = (config as any)?.grid || {}

  return (
    <div className="p-3 space-y-4 text-sm">
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Preset</label>
        <select
          value={activePreset}
          onChange={e => applyPreset(e.target.value)}
          className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
        >
          {presets.map(p => (
            <option key={p.name} value={p.name}>{p.name} — {p.description}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Primary Color</label>
        <input
          type="color"
          value={theme?.colors?.primary || '#3a9bd5'}
          onChange={e => {
            // Import deriveColors and apply full palette
            import('@/engine/colorUtils').then(({ deriveColors }) => {
              const colors = deriveColors(e.target.value)
              Object.entries(colors).forEach(([key, value]) => {
                updateConfig(`theme.colors.${key}`, value)
              })
            })
          }}
          className="w-full mt-1 h-8 cursor-pointer"
        />
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Innings</label>
        <input
          type="number"
          min={7}
          max={20}
          value={grid?.innings || 12}
          onChange={e => updateConfig('grid.innings', parseInt(e.target.value))}
          className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
        />
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Player Rows</label>
        <input
          type="number"
          min={9}
          max={15}
          value={grid?.rows || 10}
          onChange={e => updateConfig('grid.rows', parseInt(e.target.value))}
          className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
        />
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Cell Width (px)</label>
        <input
          type="range"
          min={40}
          max={80}
          value={theme?.sizing?.inningCellWidth || 64}
          onChange={e => updateConfig('theme.sizing.inningCellWidth', parseInt(e.target.value))}
          className="w-full mt-1"
        />
        <span className="text-xs text-gray-400">{theme?.sizing?.inningCellWidth || 64}px</span>
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Row Height (px)</label>
        <input
          type="range"
          min={40}
          max={80}
          value={theme?.sizing?.rowHeight || 66}
          onChange={e => updateConfig('theme.sizing.rowHeight', parseInt(e.target.value))}
          className="w-full mt-1"
        />
        <span className="text-xs text-gray-400">{theme?.sizing?.rowHeight || 66}px</span>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Toggles</label>
        {[
          { label: 'Show Outcomes', path: 'cell.outcomes.show' },
          { label: 'Show Diamond', path: 'cell.diamond.show' },
          { label: 'Show Count', path: 'cell.count.show' },
          { label: 'Show Header', path: 'header.show' },
          { label: 'Show Scoreboard', path: 'scoreboard.show' },
          { label: 'Show Notes', path: 'notes.show' },
        ].map(toggle => {
          const value = toggle.path.split('.').reduce((obj: any, key) => obj?.[key], config)
          return (
            <label key={toggle.path} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={value !== false}
                onChange={e => updateConfig(toggle.path, e.target.checked)}
                className="rounded"
              />
              <span className="text-gray-600">{toggle.label}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
