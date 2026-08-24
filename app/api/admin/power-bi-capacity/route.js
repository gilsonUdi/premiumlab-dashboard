import { getPowerBiCapacityMetrics } from '@/lib/power-bi-capacity'
import { requireAdmin } from '@/lib/server-auth'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    await requireAdmin(request)
    return NextResponse.json(await getPowerBiCapacityMetrics())
  } catch (error) {
    console.error('[admin-power-bi-capacity:get]', error)
    const message = String(error?.message || '')
    const status = message.includes('Nao autorizado') ? 401 : message.includes('administrativo') ? 403 : 500
    return NextResponse.json({ error: error?.message || 'Falha ao carregar metricas da capacidade Power BI.' }, { status })
  }
}
