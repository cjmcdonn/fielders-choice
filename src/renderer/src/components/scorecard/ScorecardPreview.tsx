import { useRef, useEffect, useMemo } from 'react'
import { generatePage } from '@/engine/generate'
import { useScorecardStore } from '@/stores/scorecardStore'
import { useGameStore } from '@/stores/gameStore'
import { mapGameToScorecard } from '@/engine/mapper'
import type { FullScorecardData } from '@/engine/mapper'

/**
 * Injects game data into the generated scorecard HTML.
 * Modifies the DOM inside the shadow root to fill in player names,
 * at-bat cells, stats, scoreboard, and header fields.
 */
/** Set text on an element and mark it as handwritten ink */
function setInk(el: Element, text: string): void {
  el.textContent = text
  el.classList.add('ink-handwritten')
}

function injectGameData(shadow: ShadowRoot, data: FullScorecardData): { away: Element | null, home: Element | null } {
  const lastFilledCells: { away: Element | null, home: Element | null } = { away: null, home: null }
  const pages = shadow.querySelectorAll('.print-page')
  if (pages.length === 0) return lastFilledCells

  // Inject header data
  const headerFields = shadow.querySelectorAll('.header-field')
  headerFields.forEach(field => {
    const label = field.querySelector('label')
    const input = field.querySelector('.header-input')
    if (!label || !input) return
    const key = label.textContent?.toLowerCase().replace(/\s+/g, '') || ''
    // Map label text to data keys
    const keyMap: Record<string, string> = {
      date: 'date', start: 'start', end: 'end',
      away: 'awayTeam', home: 'homeTeam',
      venue: 'venue', weather: 'weather'
    }
    const dataKey = keyMap[key]
    if (dataKey && data.header[dataKey]) {
      setInk(input, data.header[dataKey])
    }
  })

  // Inject into each half-inning section
  const halfInnings = shadow.querySelectorAll('.half-inning')
  const sides: ('away' | 'home')[] = ['away', 'home']

  halfInnings.forEach((section, idx) => {
    const side = sides[idx]
    if (!side || !data[side]) return
    const sideData = data[side]

    // Player names and positions
    const grid = section.querySelector('.scoring-grid')
    if (!grid) return
    // Relabel inning headers for columns shifted by batting around
    // Only update headers for columns that have been used
    const headerCells = grid.querySelectorAll('thead th.col-inning')
    sideData.columnInnings.forEach((actualInning, column) => {
      const headerCell = headerCells[column - 1] as HTMLElement
      if (!headerCell) return
      const printedInning = column // columns are 1-based, printed headers are 1,2,3...
      if (actualInning !== printedInning) {
        // Only relabel if this column has cell data (has been used)
        let hasData = false
        for (const [key] of sideData.cells) {
          if (key.endsWith(`-${column}`)) { hasData = true; break }
        }
        if (!hasData) return

        // Slash through old number and write new one
        headerCell.style.position = 'relative'
        headerCell.innerHTML = ''
        // Old number with slash overlay
        const wrapper = document.createElement('span')
        wrapper.style.cssText = 'position: relative; display: inline-block;'
        const oldSpan = document.createElement('span')
        oldSpan.textContent = String(printedInning)
        oldSpan.style.cssText = 'opacity: 0.4;'
        wrapper.appendChild(oldSpan)
        const slash = document.createElement('span')
        slash.textContent = '/'
        slash.classList.add('ink-handwritten')
        slash.style.cssText = 'position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); font-size: 14px; color: var(--ink);'
        wrapper.appendChild(slash)
        headerCell.appendChild(wrapper)
        // New inning number in ink
        const newSpan = document.createElement('span')
        newSpan.textContent = String(actualInning)
        newSpan.classList.add('ink-handwritten')
        newSpan.style.cssText = 'margin-left: 2px; font-size: 14px; color: var(--ink);'
        headerCell.appendChild(newSpan)
      }
    })

    const rows = grid.querySelectorAll('tbody tr')

    rows.forEach((row, rowIdx) => {
      if (rowIdx >= sideData.players.length) return
      const player = sideData.players[rowIdx]

      const playerCell = row.querySelector('.cell-player')
      const posCell = row.querySelector('.cell-pos')
      if (playerCell && player.name) {
        setInk(playerCell, player.name)
      }
      if (posCell && player.position) {
        setInk(posCell, player.position)
      }

      // At-bat cells
      const inningCells = row.querySelectorAll('.cell-inning')
      inningCells.forEach((cell, inningIdx) => {
        const key = `${rowIdx + 1}-${inningIdx + 1}`
        const cellData = sideData.cells.get(key)
        if (!cellData) return

        const atBatDiv = cell.querySelector('.at-bat-cell')
        if (!atBatDiv) return
        lastFilledCells[side] = cell

        // Add outcome text overlay
        const textEl = document.createElement('div')
        textEl.className = 'ink-handwritten'
        textEl.style.cssText = `
          position: absolute; top: 55%; left: 50%; transform: translate(-50%, -50%);
          font-weight: 500; font-size: 14px; z-index: 2;
          color: var(--ink); white-space: nowrap;
        `
        if (cellData.text === 'KL') {
          const span = document.createElement('span')
          span.textContent = 'K'
          span.style.display = 'inline-block'
          span.style.transform = 'scaleX(-1)'
          textEl.appendChild(span)
        } else {
          textEl.textContent = cellData.text
        }
        ;(cell as HTMLElement).style.position = 'relative'
        cell.appendChild(textEl)

        // Draw diamond annotations (paths, CS half-paths, SB labels, ticks, scored overlay)
        const hasDiamondContent = (cellData.diamondPaths && cellData.diamondPaths.length > 0)
          || (cellData.caughtStealing && cellData.caughtStealing.length > 0)
          || (cellData.sbAnnotations && cellData.sbAnnotations.length > 0)
          || (cellData.pkoAnnotations && cellData.pkoAnnotations.length > 0)
          || cellData.scored

        if (hasDiamondContent) {
          const svg = atBatDiv.querySelector('svg')
          if (svg) {
            // Shade diamond if runner scored
            if (cellData.scored) {
              const rect = svg.querySelector('rect')
              if (rect) {
                const overlay = rect.cloneNode() as SVGRectElement
                overlay.style.fill = 'var(--ink)'
                overlay.style.fillOpacity = '0.5'
                overlay.style.stroke = 'none'
                rect.after(overlay)
              }
            }

            // Base positions on the diamond (viewBox 0 0 20 20)
            const baseCoords: Record<string, [number, number]> = {
              home:   [10, 20],
              first:  [20, 10],
              second: [10, 0],
              third:  [0, 10]
            }

            const pathSegments: Record<string, [number, number, number, number]> = {
              'home-first':    [10, 20, 20, 10],
              'first-second':  [20, 10, 10, 0],
              'second-third':  [10, 0, 0, 10],
              'third-home':    [0, 10, 10, 20]
            }

            // Draw full base path lines
            if (cellData.diamondPaths) {
              for (const path of cellData.diamondPaths) {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
                line.setAttribute('stroke', 'var(--ink)')
                line.setAttribute('stroke-width', '0.85')
                line.setAttribute('stroke-linecap', 'round')
                const [x1, y1, x2, y2] = pathSegments[path] || [0, 0, 0, 0]
                line.setAttribute('x1', String(x1))
                line.setAttribute('y1', String(y1))
                line.setAttribute('x2', String(x2))
                line.setAttribute('y2', String(y2))
                svg.appendChild(line)
              }
            }

            // Draw caught stealing half-paths with perpendicular tick
            if (cellData.caughtStealing) {
              const csInfo: Record<string, { start: [number,number], mid: [number,number], perp: [number,number] }> = {
                'home-first':   { start: [10,20], mid: [15,15], perp: [0.707, 0.707] },
                'first-second': { start: [20,10], mid: [15,5],  perp: [0.707, -0.707] },
                'second-third': { start: [10,0],  mid: [5,5],   perp: [-0.707, -0.707] },
                'third-home':   { start: [0,10],  mid: [5,15],  perp: [-0.707, 0.707] },
              }

              for (const path of cellData.caughtStealing) {
                const info = csInfo[path]
                if (!info) continue

                // Half-line from start base to midpoint
                const halfLine = document.createElementNS('http://www.w3.org/2000/svg', 'line')
                halfLine.setAttribute('stroke', 'var(--ink)')
                halfLine.setAttribute('stroke-width', '0.85')
                halfLine.setAttribute('stroke-linecap', 'round')
                halfLine.setAttribute('x1', String(info.start[0]))
                halfLine.setAttribute('y1', String(info.start[1]))
                halfLine.setAttribute('x2', String(info.mid[0]))
                halfLine.setAttribute('y2', String(info.mid[1]))
                svg.appendChild(halfLine)

                // Perpendicular tick at the midpoint
                const tickLen = 1.8
                const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line')
                tick.setAttribute('stroke', 'var(--ink)')
                tick.setAttribute('stroke-width', '0.85')
                tick.setAttribute('stroke-linecap', 'round')
                tick.setAttribute('x1', String(info.mid[0] - info.perp[0] * tickLen))
                tick.setAttribute('y1', String(info.mid[1] - info.perp[1] * tickLen))
                tick.setAttribute('x2', String(info.mid[0] + info.perp[0] * tickLen))
                tick.setAttribute('y2', String(info.mid[1] + info.perp[1] * tickLen))
                svg.appendChild(tick)
              }
            }

            // Draw SB annotations outside the diamond
            if (cellData.sbAnnotations) {
              const sbPositions: Record<string, [number, number]> = {
                'home-first':   [17.5, 17.5],
                'first-second': [17.5, 2.5],
                'second-third': [2.5, 2.5],
                'third-home':   [2.5, 17.5],
              }

              for (const path of cellData.sbAnnotations) {
                const pos = sbPositions[path]
                if (!pos) continue

                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
                text.setAttribute('x', String(pos[0]))
                text.setAttribute('y', String(pos[1]))
                text.setAttribute('text-anchor', 'middle')
                text.setAttribute('dominant-baseline', 'central')
                text.setAttribute('fill', 'var(--ink)')
                text.setAttribute('font-size', '4.5')
                text.setAttribute('font-family', "'Special Elite', monospace")
                text.setAttribute('font-weight', '500')
                text.textContent = 'SB'
                svg.appendChild(text)
              }
            }

            // Draw PK annotations next to the base where runner was picked off
            if (cellData.pkoAnnotations) {
              // Position PO label just outside the diamond near the base
              const pkoPositions: Record<number, [number, number]> = {
                1: [22, 12],   // outside 1B
                2: [12, -2],   // above 2B
                3: [-2, 12],   // outside 3B
              }

              for (const base of cellData.pkoAnnotations) {
                const pos = pkoPositions[base]
                if (!pos) continue

                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
                text.setAttribute('x', String(pos[0]))
                text.setAttribute('y', String(pos[1]))
                text.setAttribute('text-anchor', 'middle')
                text.setAttribute('dominant-baseline', 'central')
                text.setAttribute('fill', 'var(--ink)')
                text.setAttribute('font-size', '4.5')
                text.setAttribute('font-family', "'Special Elite', monospace")
                text.setAttribute('font-weight', '500')
                text.textContent = 'PK'
                svg.appendChild(text)
              }
            }

            // Draw tick marks at every base the runner stopped at
            if (cellData.stoppedAt) {
              const baseNames = ['', 'first', 'second', 'third']
              const tIn = 2.5
              const tOut = 2

              for (const base of cellData.stoppedAt) {
                const baseName = baseNames[base]
                const [bx, by] = baseCoords[baseName]

                const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line')
                tick.setAttribute('stroke', 'var(--ink)')
                tick.setAttribute('stroke-width', '0.85')
                tick.setAttribute('stroke-linecap', 'round')

                if (base === 2) {
                  tick.setAttribute('x1', String(bx))
                  tick.setAttribute('y1', String(by - tOut))
                  tick.setAttribute('x2', String(bx))
                  tick.setAttribute('y2', String(by + tIn))
                } else if (base === 1) {
                  tick.setAttribute('x1', String(bx - tIn))
                  tick.setAttribute('y1', String(by))
                  tick.setAttribute('x2', String(bx + tOut))
                  tick.setAttribute('y2', String(by))
                } else {
                  tick.setAttribute('x1', String(bx - tOut))
                  tick.setAttribute('y1', String(by))
                  tick.setAttribute('x2', String(bx + tIn))
                  tick.setAttribute('y2', String(by))
                }

                svg.appendChild(tick)
              }
            }
          }
        }

        // RBI indicator (bottom-left)
        if (cellData.rbis && cellData.rbis > 0) {
          const rbiEl = document.createElement('div')
          rbiEl.className = 'ink-handwritten'
          rbiEl.style.cssText = `
            position: absolute; bottom: 1px; left: 2px;
            font-size: 8px; font-weight: 700; color: var(--primary);
          `
          rbiEl.textContent = String(cellData.rbis)
          cell.appendChild(rbiEl)
        }

        // Out number (bottom-right)
        if (cellData.outNumber) {
          const outEl = document.createElement('div')
          outEl.className = 'ink-handwritten'
          outEl.style.cssText = `
            position: absolute; bottom: 1px; right: 3px;
            font-size: 14px; font-weight: 500; color: var(--ink);
          `
          outEl.textContent = String(cellData.outNumber)
          cell.appendChild(outEl)
        }
      })

      // Stats
      const statCells = row.querySelectorAll('.cell-stat')
      const statKeys = ['AB', 'R', 'H', 'RBI']
      const rowStats = sideData.stats.get(String(rowIdx + 1))
      if (rowStats) {
        statCells.forEach((cell, statIdx) => {
          const val = rowStats.get(statKeys[statIdx])
          if (val) setInk(cell, val)
        })
      }
    })

    // Scoreboard
    const scoreboard = section.querySelector('.scoreboard-table')
    if (scoreboard) {
      const sbRows = scoreboard.querySelectorAll('tbody tr')
      const sideScores = [data.scoreboard.away, data.scoreboard.home]

      sbRows.forEach((row, rowIdx) => {
        const cells = row.querySelectorAll('td')
        // First cell is team name
        if (cells[0]) {
          setInk(cells[0], rowIdx === 0 ? data.header.awayTeam || '' : data.header.homeTeam || '')
        }
        // Inning scores
        const scores = sideScores[rowIdx]
        if (scores) {
          for (let i = 0; i < scores.length && i + 1 < cells.length; i++) {
            if (scores[i] !== null) {
              setInk(cells[i + 1], String(scores[i]))
            }
          }
        }
        // Totals
        if (scores) {
          const totalStart = cells.length - 3 // R, H, E
          const total = scores.reduce((s: number, v) => s + (v || 0), 0)
          if (totalStart >= 0 && cells[totalStart]) {
            setInk(cells[totalStart], String(total))
          }
        }
      })
    }

    // Pitcher data
    const pitcherTable = section.querySelector('.pitcher-table')
    if (pitcherTable && sideData.pitchers.length > 0) {
      const pitcherRows = pitcherTable.querySelectorAll('tbody tr')
      sideData.pitchers.forEach((pitcher, pIdx) => {
        if (pIdx >= pitcherRows.length) return
        const cells = pitcherRows[pIdx].querySelectorAll('td')
        if (cells[0]) setInk(cells[0], pitcher.name)
        const statKeys = ['IP', 'H', 'R', 'ER', 'BB', 'K']
        statKeys.forEach((key, sIdx) => {
          if (cells[sIdx + 1] && pitcher.stats[key]) {
            setInk(cells[sIdx + 1], pitcher.stats[key])
          }
        })
      })
    }
  })
  return lastFilledCells
}

export default function ScorecardPreview() {
  const containerRef = useRef<HTMLDivElement>(null)
  const shadowRef = useRef<ShadowRoot | null>(null)
  const config = useScorecardStore(state => state.config)
  const game = useGameStore(state => state.game)
  const getCurrentBatterLineupPos = useGameStore(state => state.getCurrentBatterLineupPos)

  const scorecardHtml = useMemo(() => {
    return generatePage(config as never)
  }, [config])

  const gameData = useMemo(() => {
    if (game.status === 'setup') return null
    return mapGameToScorecard(game)
  }, [game])

  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    if (!shadowRef.current) {
      shadowRef.current = containerRef.current.attachShadow({ mode: 'open' })
    }

    // Save scroll position before replacing content
    const shadowBody = shadowRef.current.querySelector('.shadow-body')
    const savedScrollTop = shadowBody?.scrollTop ?? 0
    const savedScrollLeft = shadowBody?.scrollLeft ?? 0

    // generatePage() produces a full HTML document. Shadow DOM strips <html>/<head>/<body>,
    // and :root CSS vars won't apply. We extract the <style> and body content,
    // then re-scope :root vars to :host so they work inside the shadow.
    const parser = new DOMParser()
    const doc = parser.parseFromString(scorecardHtml, 'text/html')

    // Extract all <style> blocks and re-scope :root to :host
    const styles = Array.from(doc.querySelectorAll('style'))
      .map(s => s.textContent || '')
      .join('\n')
      .replace(/:root/g, ':host')

    // Also apply body styles to :host so background/font/layout works
    const scopedStyles = styles
      .replace(/\bhtml\s*\{/g, ':host {')
      .replace(/\bbody\s*\{/g, ':host {')

    // Extract <link> tags (for Google Fonts)
    const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'))
      .map(l => l.outerHTML)
      .join('\n')

    // Extract body content
    const bodyContent = doc.body.innerHTML

    shadowRef.current.innerHTML = `
      ${links}
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link href="https://fonts.googleapis.com/css2?family=Special+Elite&display=swap" rel="stylesheet">
      <style>
        ${scopedStyles}
        .ink-handwritten {
          font-family: 'Special Elite', monospace !important;
        }
        .shadow-body {
          overflow: auto;
          width: 100%;
          height: 100%;
        }
        /* Override body padding re-scoped to :host */
        :host {
          padding: 0 !important;
        }
      </style>
      <div class="shadow-body" style="font-family: var(--font-body); background: var(--page-bg); color: var(--ink); display: flex; flex-direction: column; padding: 8px 8px 8px 0; min-width: fit-content;">
        ${bodyContent}
      </div>
    `

    // Restore scroll position immediately to avoid jump
    const newShadowBody = shadowRef.current.querySelector('.shadow-body')
    if (newShadowBody) {
      newShadowBody.scrollTop = savedScrollTop
      newShadowBody.scrollLeft = savedScrollLeft
    }

    if (gameData) {
      const lastCells = injectGameData(shadowRef.current, gameData)

      // Clear any pending scroll timer
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current)
      }

      // Determine current batting side: top = away, bottom = home
      const currentSide = game.currentHalfInning === 'bottom' ? 'home' : 'away'
      const lastCell = lastCells[currentSide]

      // After 3 seconds, smoothly scroll to the current batter's row
      scrollTimerRef.current = setTimeout(() => {
        const shadowBody = shadowRef.current?.querySelector('.shadow-body')
        if (!shadowBody) return

        // Find the current batter's row using the lineup position from game state
        const batterLineupPos = getCurrentBatterLineupPos() // 1-based
        const currentSideIdx = currentSide === 'away' ? 0 : 1
        const halfInningsSections = shadowRef.current?.querySelectorAll('.half-inning')
        const section = halfInningsSections?.[currentSideIdx]
        const rows = section?.querySelectorAll('.scoring-grid tbody tr')
        const targetRow = rows?.[batterLineupPos - 1] as HTMLElement
        if (!targetRow) return

        // Vertical: calculate scroll to center row, without touching horizontal
        const rowRect = targetRow.getBoundingClientRect()
        const bodyRect = (shadowBody as HTMLElement).getBoundingClientRect()
        const rowCenterY = rowRect.top - bodyRect.top + shadowBody.scrollTop + rowRect.height / 2
        const targetScrollTop = rowCenterY - bodyRect.height / 2

        // Horizontal: stay left unless the current cell isn't fully visible
        let targetScrollLeft = 0
        if (lastCell) {
          const cellRect = (lastCell as HTMLElement).getBoundingClientRect()
          if (cellRect.right > bodyRect.right) {
            targetScrollLeft = shadowBody.scrollLeft + (cellRect.right - bodyRect.right) + 8
          }
        }

        shadowBody.scrollTo({
          top: targetScrollTop,
          left: targetScrollLeft,
          behavior: 'smooth'
        })
      }, 1000)
    }

    return () => {
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current)
      }
    }
  }, [scorecardHtml, gameData])

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-auto bg-[#e8e0d6]"
    />
  )
}
