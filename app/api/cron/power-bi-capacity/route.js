import { reconcilePowerBiCapacity } from '@/lib/power-bi-capacity'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isAuthorized(request) {
  const secret = String(process.env.POWER_BI_CAPACITY_CRON_SECRET || '').trim()
  if (!secret) return false
  const authorization = String(request.headers.get('authorization') || '')
  return authorization === `Bearer ${secret}`
}

async function handle(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 })
  }
  try {
    const result = await reconcilePowerBiCapacity()
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error('[power-bi-capacity:cron]', error)
    return NextResponse.json({ error: error?.message || 'Falha ao reconciliar a capacidade Power BI.' }, { status: 500 })
  }
}

export async function GET(request) {
  return handle(request)
}

export async function POST(request) {
  return handle(request)
}
