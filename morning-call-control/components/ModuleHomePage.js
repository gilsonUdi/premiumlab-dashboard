'use client';

import { BarChart3, Bot, LifeBuoy, MessageSquareText, PhoneCall, Users } from 'lucide-react';
import { Panel } from '@/components/ui';

export default function ModuleHomePage({
  morningCallCounts,
  consultationCounts,
  sacCounts,
  onOpenMorningCall,
  onOpenConsultation,
  onOpenSac
}) {
  return (
    <div className="moduleHome">
      <div className="moduleHero">
        <span className="sectionEyebrow">Painel Axis AI</span>
        <h1>Escolha a ferramenta</h1>
        <p>
          Controle os produtos de IA da GS em ambientes separados, com empresas, clientes e
          configuracoes independentes.
        </p>
      </div>

      <div className="moduleGrid">
        <button type="button" className="moduleCard" onClick={onOpenMorningCall}>
          <span className="moduleIcon gold">
            <PhoneCall size={24} />
          </span>
          <strong>IA 360°</strong>
          <span>Relatorios matinais via WhatsApp, avisos diarios e acompanhamento operacional.</span>
          <div className="moduleStats">
            <em>{morningCallCounts.companies} empresas</em>
            <em>{morningCallCounts.clients} clientes</em>
          </div>
        </button>

        <button type="button" className="moduleCard" onClick={onOpenConsultation}>
          <span className="moduleIcon cyan">
            <Bot size={24} />
          </span>
          <strong>Atendimento AI</strong>
          <span>Ferramenta de atendimento por IA para consultas controladas pelo WhatsApp.</span>
          <div className="moduleStats">
            <em>{consultationCounts.companies} empresas</em>
            <em>{consultationCounts.clients} clientes</em>
          </div>
        </button>

        <button type="button" className="moduleCard" onClick={onOpenSac}>
          <span className="moduleIcon green">
            <LifeBuoy size={24} />
          </span>
          <strong>SAC</strong>
          <span>Notificacoes de abertura e atualizacao de solicitacoes pelo WhatsApp.</span>
          <div className="moduleStats">
            <em>{sacCounts.companies} empresas</em>
          </div>
        </button>
      </div>

      <Panel title="Separacao dos dados" icon={BarChart3} className="n8nPanel">
        <div className="homeInfoGrid">
          <div>
            <MessageSquareText size={18} />
            <strong>IA 360°</strong>
            <span>Usa colecoes proprias para tenants, contatos, Power BI e execucoes.</span>
          </div>
          <div>
            <Users size={18} />
            <strong>Atendimento AI</strong>
            <span>Usa empresas e clientes independentes, mesmo quando o laboratorio for o mesmo.</span>
          </div>
          <div>
            <LifeBuoy size={18} />
            <strong>SAC</strong>
            <span>Mantem empresas e conexoes Evolution exclusivas para notificacoes de SAC.</span>
          </div>
        </div>
      </Panel>
    </div>
  );
}
