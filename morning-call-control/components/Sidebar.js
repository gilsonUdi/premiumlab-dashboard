'use client';

import {
  Activity,
  BarChart3,
  Bot,
  Building2,
  Home,
  LayoutDashboard,
  MessageCircle,
  Users
} from 'lucide-react';

const MORNING_CALL_NAV_ITEMS = [
  { id: 'overview', label: 'Visao geral', icon: LayoutDashboard },
  { id: 'companies', label: 'Empresas', icon: Building2 },
  { id: 'clients', label: 'Clientes', icon: Users },
  { id: 'powerbi', label: 'Power BI', icon: BarChart3 },
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'activity', label: 'Atividade', icon: Activity }
];

const CONSULTATION_NAV_ITEMS = [
  { id: 'consultation-overview', label: 'Visao geral', icon: LayoutDashboard },
  { id: 'consultation-companies', label: 'Empresas', icon: Building2 },
  { id: 'consultation-clients', label: 'Clientes', icon: Users },
  { id: 'consultation-chat', label: 'Chat', icon: MessageCircle }
];

const SAC_NAV_ITEMS = [
  { id: 'sac-companies', label: 'Empresas', icon: Building2 },
  { id: 'sac-chat', label: 'Chat', icon: MessageCircle }
];

export default function Sidebar({
  page,
  module,
  onNavigate,
  onHome,
  counts,
  firebaseReady,
  errorCount
}) {
  const navItems =
    module === 'sac'
      ? SAC_NAV_ITEMS
      : module === 'consultation'
      ? CONSULTATION_NAV_ITEMS
      : module === 'morning-call'
        ? MORNING_CALL_NAV_ITEMS
        : [];

  return (
    <aside className="sidebar">
      <div className="sidebarBrand">
        <span className="brandMark">
          <img src="/logo-axis-ai.png" alt="Axis AI" />
        </span>
        <div>
          <strong>Axis AI</strong>
          <span>GS Controladoria</span>
        </div>
      </div>

      <nav className="sidebarNav" aria-label="Navegacao do painel">
        {module ? (
          <button type="button" className="navItem" onClick={onHome}>
            <Home size={17} />
            <span>Home</span>
          </button>
        ) : null}

        {module ? (
          <div className="moduleBadge">
            <Bot size={14} />
            <span>
              {module === 'consultation'
                ? 'Atendimento AI'
                : module === 'sac'
                  ? 'SAC'
                  : 'IA 360°'}
            </span>
          </div>
        ) : null}

        {navItems.map(item => {
          const Icon = item.icon;
          const count = counts?.[item.id];
          const showAlert = item.id === 'activity' && errorCount > 0;

          return (
            <button
              key={item.id}
              type="button"
              className={`navItem ${page === item.id ? 'active' : ''}`.trim()}
              onClick={() => onNavigate(item.id)}
            >
              <Icon size={17} />
              <span>{item.label}</span>
              {showAlert ? (
                <em className="navBadge alert">{errorCount}</em>
              ) : typeof count === 'number' ? (
                <em className="navBadge">{count}</em>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="sidebarFooter">
        <span className={`fbStatus ${firebaseReady ? 'ok' : 'off'}`}>
          <i />
          {firebaseReady ? 'Firestore conectado' : 'Firebase nao configurado'}
        </span>
      </div>
    </aside>
  );
}
