/** Transport failures must not be interpreted as an expired dashboard lease. */
export function dashboardHeartbeatOutcome(status, payload) {
  if (status === 401 || status === 403 || status === 404) return 'ended';
  if (status < 200 || status >= 300) return 'retry';
  if (payload?.active === false) return 'ended';
  return payload?.active === true ? 'active' : 'retry';
}

export async function sendDashboardHeartbeat(fetcher, getAuthHeaders, body) {
  for (let attempt = 0; attempt < 2; attempt++) {
    // Firebase getIdToken renews credentials when necessary. Never reuse the
    // Authorization header captured when the report was first opened.
    const headers = await getAuthHeaders(attempt > 0);
    const response = await fetcher('/api/power-bi/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body), cache: 'no-store',
    });
    if (response.status === 401 && attempt === 0) continue;
    let payload;
    try { payload = await response.json(); } catch { payload = null; }
    return { outcome: dashboardHeartbeatOutcome(response.status, payload), status: response.status };
  }
}
