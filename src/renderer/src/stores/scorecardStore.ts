import { create } from 'zustand'
import { deepMerge } from '@/engine/generate'
import { setByPath, computeOverrides } from '@/engine/configUtils'
import defaults from '@/engine/defaults.json'
import presets from '@/engine/presets'

export interface ScorecardStore {
  activePreset: string
  overrides: Record<string, unknown>
  config: Record<string, unknown>

  applyPreset: (name: string) => void
  updateConfig: (path: string, value: unknown) => void
  resetConfig: () => void
  getOverrides: () => Record<string, unknown> | undefined
}

function computeConfig(presetName: string, overrides: Record<string, unknown>) {
  const preset = presets.find(p => p.name === presetName)
  const base = preset ? deepMerge(defaults, preset.overrides) : { ...defaults }
  return deepMerge(base, overrides)
}

export const useScorecardStore = create<ScorecardStore>((set, get) => ({
  activePreset: 'Standard',
  overrides: {},
  config: computeConfig('Standard', {}),

  applyPreset: (name) => {
    const config = computeConfig(name, {})
    set({ activePreset: name, overrides: {}, config })
  },

  updateConfig: (path, value) => {
    const state = get()
    const newOverrides = setByPath(state.overrides, path, value)
    const config = computeConfig(state.activePreset, newOverrides)
    set({ overrides: newOverrides, config })
  },

  resetConfig: () => {
    const state = get()
    const config = computeConfig(state.activePreset, {})
    set({ overrides: {}, config })
  },

  getOverrides: () => {
    const state = get()
    return computeOverrides(state.config, defaults)
  }
}))
