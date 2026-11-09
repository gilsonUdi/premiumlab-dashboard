export const DASHBOARD_INACTIVITY_MS = 30 * 60 * 1000

// Use elapsed time, not the client's wall clock, across the API boundary.
export function dashboardActivityLease(nowMs, idleMs = 0, transportTimeoutMs = 10 * 60 * 1000) {
  const elapsed = Number(idleMs)
  const remaining = DASHBOARD_INACTIVITY_MS - (Number.isFinite(elapsed) ? Math.max(0, elapsed) : DASHBOARD_INACTIVITY_MS)
  return new Date(nowMs + Math.max(0, Math.min(remaining, transportTimeoutMs)))
}

export function createDashboardActivityClock(now = () => Date.now()) {
  let lastActivity = now()
  return {
    touch() { lastActivity = now() },
    idleMs() { return Math.max(0, now() - lastActivity) },
    expired() { return now() - lastActivity >= DASHBOARD_INACTIVITY_MS },
  }
}
