import { notFound } from 'next/navigation'
import PublicContactCard from '@/components/public/PublicContactCard'
import { getFirebaseAdminDb } from '@/lib/firebase-admin'

export const dynamic = 'force-dynamic'

async function carregarContato(id) {
  const snapshot = await getFirebaseAdminDb().collection('publicContactCards').doc(String(id || '')).get()
  if (!snapshot.exists || snapshot.data()?.active === false) return null
  return { id: snapshot.id, ...snapshot.data() }
}

export default async function ContatoPublicoPage({ params }) {
  const contato = await carregarContato(params.id)
  if (!contato) notFound()
  return <PublicContactCard contato={contato} />
}

