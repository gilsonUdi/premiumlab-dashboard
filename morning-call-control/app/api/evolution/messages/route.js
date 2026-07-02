import { NextResponse } from 'next/server';
import { findEvolutionMessages } from '@/lib/evolution-server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  try {
    const result = await findEvolutionMessages({
      remoteJid: searchParams.get('remoteJid') || '',
      whatsappId: searchParams.get('whatsappId') || '',
      phone: searchParams.get('phone') || '',
      limit: searchParams.get('limit') || 120
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        source: 'evolution',
        messages: [],
        error: error.message || 'Nao foi possivel carregar mensagens da Evolution API.'
      },
      { status: 200 }
    );
  }
}
