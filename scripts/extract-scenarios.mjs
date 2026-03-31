/**
 * Extracts unique scoring scenarios from MLB play-by-play data.
 *
 * Usage: node scripts/extract-scenarios.mjs
 *
 * Fetches all games from the first week of the 2025 MLB season,
 * extracts every unique combination of (runnerState, outs, eventType, event),
 * and writes the results to scripts/scenarios.json.
 */

import https from 'https'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (err) { reject(new Error(`Failed to parse JSON from ${url}: ${err.message}`)) }
      })
      res.on('error', reject)
    }).on('error', reject)
  })
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function runnerStateKey(onFirst, onSecond, onThird) {
  return `${onFirst ? '1' : '-'}${onSecond ? '2' : '-'}${onThird ? '3' : '-'}`
}

function extractFielders(runners) {
  const fielderPositions = []
  for (const runner of runners) {
    if (!runner.credits) continue
    for (const credit of runner.credits) {
      if (credit.credit === 'f_assist' || credit.credit === 'f_putout') {
        const posCode = parseInt(credit.position?.code, 10)
        if (posCode && !fielderPositions.includes(posCode)) {
          fielderPositions.push(posCode)
        }
      }
    }
  }
  return fielderPositions
}

async function main() {
  console.log('Fetching 2025 MLB schedule (March 27 - April 2)...')
  const schedule = await fetchJSON(
    'https://statsapi.mlb.com/api/v1/schedule?startDate=2025-03-27&endDate=2025-04-02&sportId=1'
  )

  const gameIds = []
  for (const date of schedule.dates || []) {
    for (const game of date.games || []) {
      if (game.status?.detailedState === 'Final' || game.status?.detailedState === 'Completed Early') {
        gameIds.push(game.gamePk)
      }
    }
  }

  console.log(`Found ${gameIds.length} completed games.`)

  const scenarioMap = new Map() // key -> scenario object
  let totalPlays = 0

  for (let i = 0; i < gameIds.length; i++) {
    const gamePk = gameIds[i]
    console.log(`Processing game ${i + 1}/${gameIds.length}: ${gamePk}`)

    try {
      const feed = await fetchJSON(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`)
      const allPlays = feed?.liveData?.plays?.allPlays || []

      let prevOnFirst = false
      let prevOnSecond = false
      let prevOnThird = false

      for (let playIdx = 0; playIdx < allPlays.length; playIdx++) {
        const play = allPlays[playIdx]
        if (!play.result?.eventType) continue
        if (!play.about?.isComplete) continue

        totalPlays++

        // Runner state before play
        const runnersOn = runnerStateKey(prevOnFirst, prevOnSecond, prevOnThird)
        const outsBeforePlay = play.count?.outs ?? 0
        const eventType = play.result.eventType
        const event = play.result.event

        // Extract runner movements
        const runnerMovements = []
        let batterEnd = null

        for (const runner of (play.runners || [])) {
          const originBase = runner.movement?.originBase
          const endBase = runner.movement?.end
          const isOut = runner.movement?.isOut ?? false

          if (originBase === null || originBase === undefined) {
            // This is the batter
            if (endBase === 'score') batterEnd = 'scored'
            else if (endBase) batterEnd = endBase
            else if (isOut) batterEnd = 'out'
          } else {
            runnerMovements.push({
              from: originBase,
              to: isOut ? 'out' : (endBase || 'out'),
              isOut
            })
          }
        }

        // Extract fielder sequence
        const fielders = extractFielders(play.runners || [])

        // Build scenario key
        const key = `${eventType}|${event}|${runnersOn}|${outsBeforePlay}`

        if (!scenarioMap.has(key)) {
          scenarioMap.set(key, {
            eventType,
            event,
            outs: outsBeforePlay,
            runnerState: runnersOn,
            batterEnd,
            runnerMovements,
            fielders,
            gamePk,
            description: play.result.description || ''
          })
        }

        // Update runner state for next play
        prevOnFirst = !!play.matchup?.postOnFirst
        prevOnSecond = !!play.matchup?.postOnSecond
        prevOnThird = !!play.matchup?.postOnThird

        // Reset on half-inning change
        if (playIdx + 1 < allPlays.length) {
          const nextPlay = allPlays[playIdx + 1]
          if (nextPlay.about?.halfInning !== play.about?.halfInning) {
            prevOnFirst = false
            prevOnSecond = false
            prevOnThird = false
          }
        }
      }
    } catch (err) {
      console.error(`  Error processing game ${gamePk}: ${err.message}`)
    }

    // Be nice to the API
    if (i % 10 === 9) await sleep(500)
  }

  // Sort scenarios
  const scenarios = [...scenarioMap.values()].sort((a, b) => {
    if (a.eventType !== b.eventType) return a.eventType.localeCompare(b.eventType)
    if (a.runnerState !== b.runnerState) return a.runnerState.localeCompare(b.runnerState)
    return a.outs - b.outs
  })

  // Write output
  const outputPath = path.join(__dirname, 'scenarios.json')
  fs.writeFileSync(outputPath, JSON.stringify(scenarios, null, 2))

  console.log(`\nDone!`)
  console.log(`Total games: ${gameIds.length}`)
  console.log(`Total plays: ${totalPlays}`)
  console.log(`Unique scenarios: ${scenarios.length}`)
  console.log(`Written to: ${outputPath}`)

  // Summary by eventType
  const byType = new Map()
  for (const s of scenarios) {
    byType.set(s.eventType, (byType.get(s.eventType) || 0) + 1)
  }
  console.log('\nScenarios by eventType:')
  for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
