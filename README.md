# Fielder's Choice

A desktop baseball scoring app that pairs a GameChanger-style scoring interface with a live-updating, configurable scorecard.

![Electron](https://img.shields.io/badge/Electron-35-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)

## Overview

Score a baseball game on the left panel and watch a traditional paper scorecard fill in on the right — in real time. The scorecard uses Shadow DOM isolation and a typewriter font to mimic the look of hand-scored ink on paper.

**Scoring panel features:**
- TV-style scorebug with team names, score, inning, and outs
- Visual baseball diamond showing runners and fielder positions
- Full outcome recording: hits, outs, walks, errors, sacrifices, double/triple plays, fielder's choice
- Baserunning events: stolen bases, caught stealing, pickoffs
- On-deck and in-the-hole batter display
- Customizable runner advancement on every play
- Undo/redo support

**Scorecard features:**
- Traditional paper scorecard layout with diamond-path notation
- Automatic out numbering (correctly interleaved with baserunning events)
- Batting-around support — columns shift and headers relabel, just like a real scorecard
- Configurable appearance via OpenCard engine
- Auto-scrolling to follow the current batter

**Game setup:**
- Load lineups from live MLB games (MLB Stats API)
- Load lineups from NCAA games (ESPN API)
- Manual lineup entry

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- npm

### Install

```bash
git clone https://github.com/cjmcdonn/fielders-choice.git
cd fielders-choice
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Test

```bash
npm test            # single run
npm run test:watch  # watch mode
```

### Type checking

```bash
npm run typecheck
```

## Tech Stack

- **Electron** — desktop shell
- **React 19** — UI
- **TypeScript** — type safety
- **Vite** (via electron-vite) — build tooling
- **Tailwind CSS 4** — styling
- **Zustand** — state management
- **Vitest** — testing

## Architecture

```
src/
  main/           # Electron main process
  preload/        # Electron preload scripts
  renderer/src/
    components/
      scoring/    # Left panel — game scoring UI
      scorecard/  # Right panel — live scorecard
      layout/     # Split panel layout
    engine/       # Scorecard mapper (game state → cell data)
    stores/       # Zustand game store
    types/        # TypeScript types and game model
    services/     # MLB/NCAA lineup API integration
    __tests__/    # Scoring tests
```

### Data Model

Game events are stored in a single chronologically-ordered array per half-inning. At-bats and baserunning events are interleaved in the order they occurred, which ensures correct out numbering on the scorecard.

```
GameState
  └─ halfInnings[]
       └─ events[]  ← AtBat | BaserunningEvent, in order
```

Display text, out counts, and other derived values are computed on demand rather than stored, so there is a single source of truth with no possibility of conflicting data.

## License

See [LICENSE](LICENSE) for details.
