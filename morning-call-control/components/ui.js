'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { getStatusMeta } from '@/lib/constants';
import { initialsOf } from '@/lib/format';

export function Panel({ title, description, icon: Icon, action, children, className = '' }) {
  return (
    <section className={`panel ${className}`.trim()}>
      {title ? (
        <header className="panelHead">
          <div className="panelTitleGroup">
            {Icon ? (
              <span className="panelIcon">
                <Icon size={16} />
              </span>
            ) : null}
            <div>
              <h2 className="panelTitle">{title}</h2>
              {description ? <p className="panelSub">{description}</p> : null}
            </div>
          </div>
          {action ? <div className="panelAction">{action}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`field ${className}`.trim()}>
      <span className="fieldLabel">{label}</span>
      {children}
      {hint ? <span className="fieldHint">{hint}</span> : null}
    </label>
  );
}

export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="empty">
      {Icon ? <Icon size={22} /> : null}
      {title ? <strong>{title}</strong> : null}
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function StatusBadge({ status }) {
  const meta = getStatusMeta(status);
  return (
    <span className={`badge ${meta.tone}`}>
      <i className="badgeDot" />
      {meta.label}
    </span>
  );
}

export function ActiveBadge({ active, activeText = 'Ativo', inactiveText = 'Inativo' }) {
  return (
    <span className={`badge ${active ? 'green' : 'gray'}`}>
      <i className="badgeDot" />
      {active ? activeText : inactiveText}
    </span>
  );
}

export function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? 'on' : ''}`.trim()}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="switchKnob" />
    </button>
  );
}

export function SwitchRow({ label, description, checked, onChange, disabled }) {
  return (
    <div className="switchRow">
      <div>
        <strong>{label}</strong>
        {description ? <span>{description}</span> : null}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} label={label} />
    </div>
  );
}

export function Avatar({ name, size = 'md', tone = 'gold' }) {
  return <span className={`avatar ${size} ${tone}`}>{initialsOf(name)}</span>;
}

export function ConfirmDeleteButton({ onConfirm, disabled, label = 'Excluir' }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  function handleClick() {
    if (!armed) {
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), 3000);
      return;
    }

    clearTimeout(timer.current);
    setArmed(false);
    onConfirm();
  }

  return (
    <button
      type="button"
      className={`iconBtn danger ${armed ? 'armed' : ''}`.trim()}
      onClick={handleClick}
      disabled={disabled}
      title={armed ? 'Clique de novo para confirmar' : label}
    >
      {armed ? (
        <>
          <Check size={14} />
          Confirmar?
        </>
      ) : (
        <Trash2 size={15} />
      )}
    </button>
  );
}

export function ChipRow({ options, value, onChange }) {
  return (
    <div className="chipRow">
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          className={`chip ${value === option.id ? 'active' : ''}`.trim()}
          onClick={() => onChange(option.id)}
        >
          {option.label}
          {typeof option.count === 'number' ? <em>{option.count}</em> : null}
        </button>
      ))}
    </div>
  );
}
