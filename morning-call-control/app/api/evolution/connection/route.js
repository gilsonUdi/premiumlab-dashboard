import { NextResponse } from 'next/server';
import {
  getEvolutionConnectionQr,
  getEvolutionConnectionState
} from '@/lib/evolution-server';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const evolutionConfig = body.evolutionConfig || {};

    if (body.action === 'qr') {
      return NextResponse.json(
        await getEvolutionConnectionQr({ evolutionConfig })
      );
    }

    return NextResponse.json(
      await getEvolutionConnectionState({ evolutionConfig })
    );
  } catch (error) {
    return NextResponse.json(
      {
        state: 'error',
        error: error.message || 'Nao foi possivel consultar a conexao da Evolution API.'
      },
      { status: 502 }
    );
  }
}
