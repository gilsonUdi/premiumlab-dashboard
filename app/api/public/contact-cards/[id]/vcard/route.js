import { NextResponse } from 'next/server'
import { getFirebaseAdminDb } from '@/lib/firebase-admin'
import { montarVcard } from '@/lib/vcard'

export const dynamic = 'force-dynamic'

function nomeArquivo(nome) {
  return String(nome || 'contato')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'contato'
}

export async function GET(_request, { params }) {
  const snapshot = await getFirebaseAdminDb().collection('publicContactCards').doc(String(params.id || '')).get()
  if (!snapshot.exists || snapshot.data()?.active === false) {
    return NextResponse.json({ error: 'Contato não encontrado.' }, { status: 404 })
  }

  const contato = snapshot.data()
  return new NextResponse(montarVcard(contato), {
    headers: {
      // O Safari do iPhone usa estes dois cabeçalhos para encaminhar o arquivo
      // ao visualizador nativo de contatos, em vez de trata-lo como download.
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': `inline; filename="${nomeArquivo(contato.nome)}.vcf"`,
      'Cache-Control': 'public, max-age=300',
    },
  })
}
