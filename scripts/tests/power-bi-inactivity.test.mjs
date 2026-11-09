import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createDashboardActivityClock, dashboardActivityLease, DASHBOARD_INACTIVITY_MS } from '../../lib/power-bi-inactivity.mjs'

test('reading and automatic heartbeats expire at 30 minutes, not 10', () => {
  let now = 0
  const clock = createDashboardActivityClock(() => now)
  now = 10 * 60 * 1000
  assert.equal(clock.expired(), false)
  now = DASHBOARD_INACTIVITY_MS - 1
  assert.equal(clock.expired(), false)
  now++
  assert.equal(clock.expired(), true)
})

test('human activity renews the 30 minute window', () => {
  let now = 0
  const clock = createDashboardActivityClock(() => now)
  now = 29 * 60 * 1000
  clock.touch()
  now += 29 * 60 * 1000
  assert.equal(clock.expired(), false)
  now += 60 * 1000
  assert.equal(clock.expired(), true)
})

test('server lease cannot outlast human inactivity or transport timeout', () => {
  const now = Date.parse('2026-11-09T12:00:00Z')
  assert.equal(dashboardActivityLease(now, 0).getTime(), now + 600000)
  assert.equal(dashboardActivityLease(now, 29 * 60000).getTime(), now + 60000)
  assert.equal(dashboardActivityLease(now, DASHBOARD_INACTIVITY_MS).getTime(), now)
  assert.equal(dashboardActivityLease(now, Infinity).getTime(), now)
  assert.equal(dashboardActivityLease(now, 'invalid').getTime(), now)
  assert.equal(dashboardActivityLease(now, -1).getTime(), now + 600000)
})

test('viewer tracks iframe interactions but not automatic rendering, and guards token renewal', () => {
  const source = readFileSync(new URL('../../components/company/PowerBiEmbeddedView.jsx', import.meta.url), 'utf8')
  for (const name of ['visualClicked', 'dataSelected', 'buttonClicked', 'selectionChanged']) {
    assert.ok(source.includes(`['${name}', noteDashboardActivity]`))
  }
  assert.ok(source.includes("endDashboardSession('inactivity')"))
  assert.ok(source.includes('idleMs: dashboardActivityRef.current.idleMs()'))
  assert.ok(source.includes('if (dashboardSessionEndedRef.current || dashboardActivityRef.current?.expired()) return'))
  assert.ok(!source.includes("['rendered', noteDashboardActivity]"))
  const api = readFileSync(new URL('../../app/api/power-bi/session/route.js', import.meta.url), 'utf8')
  assert.ok(api.includes('idleMs: payload?.idleMs'))
})
