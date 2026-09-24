import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const DEFAULT_WEBHOOK_URL = 'https://n8n.gsgestao.com.br/webhook/morning-call/evolution';

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function buildInboundMessage({ contact, reportType }) {
  const phone = onlyDigits(contact.phone);
  const isFinancial = reportType === 'financial';
  const text = reportType === 'preview'
    ? contact.previewConfirmationPhrase || 'Prévia Morning Call'
    : isFinancial
      ? contact.receivablesConfirmationPhrase || 'Receber Morning Call Financeiro'
      : contact.confirmationPhrase || 'Receber Morning Call';

  return {
    event: 'messages.upsert',
    instance: process.env.EVOLUTION_INSTANCE || 'Morning Call',
    date_time: new Date().toISOString(),
    sender: `${phone}@s.whatsapp.net`,
    server_url: process.env.EVOLUTION_BASE_URL || 'https://evolution.gsgestao.com.br',
    data: {
      key: {
        remoteJid: `${phone}@s.whatsapp.net`,
        fromMe: false,
        id: `ai-control-${reportType}-${Date.now()}`
      },
      pushName: contact.name || 'AI Control',
      status: 'SERVER_ACK',
      message: { conversation: text },
      messageType: 'conversation',
      source: 'ai-control-manual'
    }
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const contact = body?.contact || {};
    const reportType = body?.reportType;
    const phone = onlyDigits(contact.phone);

    if (!['commercial', 'financial', 'preview'].includes(reportType)) {
      return NextResponse.json({ error: 'Tipo de Morning Call invalido.' }, { status: 400 });
    }

    if (!contact.id || !contact.tenant || phone.length < 10) {
      return NextResponse.json(
        { error: 'O contato selecionado nao possui empresa ou telefone valido.' },
        { status: 400 }
      );
    }

    if (contact.active === false) {
      return NextResponse.json({ error: 'O contato selecionado esta inativo.' }, { status: 409 });
    }

    if (reportType === 'commercial' && contact.allowManualSend === false) {
      return NextResponse.json(
        { error: 'O envio manual do Morning Call comercial esta desabilitado para este contato.' },
        { status: 409 }
      );
    }

    if (reportType === 'financial' && contact.allowReceivablesMorningCall !== true) {
      return NextResponse.json(
        { error: 'O Morning Call financeiro esta desabilitado para este contato.' },
        { status: 409 }
      );
    }

    if (reportType === 'preview' && (
      !String(contact.tenant).toLowerCase().includes('gradual') ||
      contact.allowPreviewMorningCall !== true
    )) {
      return NextResponse.json(
        { error: 'A prévia está disponível apenas para contatos Gradual habilitados.' },
        { status: 409 }
      );
    }

    const response = await fetch(
      process.env.MORNING_CALL_INBOUND_WEBHOOK_URL || DEFAULT_WEBHOOK_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildInboundMessage({ contact: { ...contact, phone }, reportType })),
        cache: 'no-store'
      }
    );

    const responseText = await response.text();
    let result = null;

    try {
      result = responseText ? JSON.parse(responseText) : null;
    } catch {
      result = responseText;
    }

    const firstResult = Array.isArray(result) ? result[0] : result;

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            firstResult?.message ||
            firstResult?.error ||
            `O n8n respondeu com status ${response.status}.`
        },
        { status: 502 }
      );
    }

    if (firstResult?.ignored || firstResult?.success === false) {
      return NextResponse.json(
        {
          error:
            firstResult?.responseText ||
            firstResult?.reason ||
            firstResult?.errorReason ||
            'O fluxo recusou o envio manual.'
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      ok: true,
      message:
        reportType === 'financial'
          ? 'Morning Call financeiro enviado para a fila de processamento.'
          : reportType === 'preview'
            ? 'Prévia do Morning Call enviada para a fila de processamento.'
            : 'Morning Call comercial enviado para a fila de processamento.'
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || 'Nao foi possivel iniciar o envio manual.' },
      { status: 500 }
    );
  }
}
