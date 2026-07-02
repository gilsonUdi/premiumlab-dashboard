'use client';

import {
  Activity,
  BarChart3,
  Building2,
  LayoutDashboard,
  MessageCircle,
  Users
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'companies', label: 'Empresas', icon: Building2 },
  { id: 'clients', label: 'Clientes', icon: Users },
  { id: 'powerbi', label: 'Power BI', icon: BarChart3 },
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'activity', label: 'Atividade', icon: Activity }
];

export default function Sidebar({ page, onNavigate, counts, firebaseReady, errorCount }) {
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

      <nav className="sidebarNav" aria-label="Navegação do painel">
        {NAV_ITEMS.map(item => {
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
          {firebaseReady ? 'Firestore conectado' : 'Firebase não configurado'}
        </span>
      </div>
    </aside>
  );
}
