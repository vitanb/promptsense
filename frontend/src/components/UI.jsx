import { useState } from 'react';

// ── Button ────────────────────────────────────────────────────────────────────
export function Btn({ children, onClick, variant = 'primary', size = 'md', disabled, loading, style = {}, type = 'button' }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const sizes = {
    sm: { fontSize: 11, padding: '4px 11px', gap: 5 },
    md: { fontSize: 13, padding: '7px 16px', gap: 6 },
    lg: { fontSize: 14, padding: '10px 22px', gap: 7 },
  };

  const variants = {
    primary: {
      background: hovered && !disabled && !loading ? '#6e66cc' : 'var(--c-purple)',
      color: '#fff',
      border: 'none',
      boxShadow: hovered && !disabled && !loading ? '0 2px 8px rgba(127,119,221,0.35)' : '0 1px 2px rgba(127,119,221,0.2)',
    },
    secondary: {
      background: hovered && !disabled && !loading ? 'var(--c-bg2)' : 'transparent',
      color: 'var(--c-text)',
      border: '0.5px solid var(--c-border2)',
      boxShadow: 'none',
    },
    danger: {
      background: hovered && !disabled && !loading ? 'var(--c-red)11' : 'transparent',
      color: 'var(--c-red)',
      border: `0.5px solid var(--c-red)`,
      boxShadow: 'none',
    },
    ghost: {
      background: hovered && !disabled && !loading ? 'var(--c-bg2)' : 'transparent',
      color: 'var(--c-text2)',
      border: 'none',
      padding: size === 'sm' ? '3px 6px' : '5px 8px',
      boxShadow: 'none',
    },
  };

  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 500, borderRadius: 'var(--radius)', cursor: disabled || loading ? 'not-allowed' : 'pointer',
    transition: 'all var(--transition)',
    opacity: disabled || loading ? 0.5 : 1,
    transform: pressed && !disabled && !loading ? 'scale(0.97)' : 'scale(1)',
    fontFamily: 'inherit', lineHeight: 1.4, whiteSpace: 'nowrap',
    letterSpacing: '0.01em',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{ ...base, ...sizes[size], ...variants[variant], ...style }}
    >
      {loading
        ? <><span style={{ width: size === 'sm' ? 10 : 12, height: size === 'sm' ? 10 : 12, border: '1.5px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} /> {typeof children === 'string' ? children : 'Loading…'}</>
        : children}
    </button>
  );
}

// ── Input ─────────────────────────────────────────────────────────────────────
export function Input({ label, error, type = 'text', style = {}, ...props }) {
  const [focused, setFocused] = useState(false);
  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: 'var(--radius)',
    border: error ? '1px solid var(--c-red)' : focused ? '1px solid var(--c-purple)' : '0.5px solid var(--c-border2)',
    background: 'var(--c-bg)', color: 'var(--c-text)', outline: 'none', fontSize: 13,
    boxSizing: 'border-box', transition: 'border-color var(--transition), box-shadow var(--transition)',
    boxShadow: focused && !error ? '0 0 0 3px rgba(127,119,221,0.15)' : 'none',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      {label && <label style={{ fontSize: 11, color: 'var(--c-text2)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>}
      <input type={type} style={inputStyle} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} {...props} />
      {error && <span style={{ fontSize: 11, color: 'var(--c-red)' }}>{error}</span>}
    </div>
  );
}

// ── Select ────────────────────────────────────────────────────────────────────
export function Select({ label, children, style = {}, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      {label && <label style={{ fontSize: 11, color: 'var(--c-text2)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>}
      <select
        style={{
          width: '100%', padding: '8px 10px', borderRadius: 'var(--radius)',
          border: focused ? '1px solid var(--c-purple)' : '0.5px solid var(--c-border2)',
          background: 'var(--c-bg)', color: 'var(--c-text)', fontSize: 13, outline: 'none',
          transition: 'border-color var(--transition), box-shadow var(--transition)',
          boxShadow: focused ? '0 0 0 3px rgba(127,119,221,0.15)' : 'none',
          cursor: 'pointer', appearance: 'auto',
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({ children, style = {}, hoverable = false }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={hoverable ? () => setHovered(true) : undefined}
      onMouseLeave={hoverable ? () => setHovered(false) : undefined}
      style={{
        background: 'var(--c-bg)', border: '0.5px solid var(--c-border)',
        borderRadius: 'var(--radius-lg)', padding: '1.25rem',
        boxShadow: hoverable && hovered ? 'var(--shadow-md)' : 'var(--shadow)',
        transform: hoverable && hovered ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'box-shadow var(--transition), transform var(--transition)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
export function Badge({ text, color = '#7F77DD', small }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: small ? 10 : 11, fontWeight: 500,
      padding: small ? '1px 6px' : '2px 8px', borderRadius: 4,
      background: color + '18', color, border: `0.5px solid ${color}44`,
      whiteSpace: 'nowrap', letterSpacing: '0.01em',
    }}>
      {text}
    </span>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────
export function Toggle({ checked, onChange, size = 34 }) {
  const [hovered, setHovered] = useState(false);
  const h = Math.round(size * 0.56);
  return (
    <div
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: size, height: h, borderRadius: h, cursor: 'pointer',
        background: checked ? 'var(--c-green)' : hovered ? 'var(--c-text3)' : 'var(--c-border2)',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
        boxShadow: hovered ? '0 0 0 3px ' + (checked ? 'rgba(29,158,117,0.2)' : 'rgba(0,0,0,0.1)') : 'none',
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: checked ? size - h + 2 : 2,
        width: h - 4, height: h - 4, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </div>
  );
}

// ── Alert ─────────────────────────────────────────────────────────────────────
const ALERT_ICONS = { error: '⊗', success: '✓', warning: '⚠', info: 'ℹ' };

export function Alert({ type = 'error', message }) {
  if (!message) return null;
  const colors = { error: 'var(--c-red)', success: 'var(--c-green)', warning: 'var(--c-amber)', info: 'var(--c-blue)' };
  const c = colors[type];
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 'var(--radius)',
      background: c + '12', border: `1px solid ${c}33`, color: c, fontSize: 13,
      display: 'flex', alignItems: 'flex-start', gap: 8, animation: 'fadeIn 0.15s ease',
    }}>
      <span style={{ flexShrink: 0, marginTop: 1, fontWeight: 600 }}>{ALERT_ICONS[type]}</span>
      <span>{message}</span>
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ size = 20, color }) {
  return (
    <div style={{
      width: size, height: size,
      border: `2px solid var(--c-border2)`,
      borderTop: `2px solid ${color || 'var(--c-purple)'}`,
      borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0,
    }} />
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
export function Skeleton({ width = '100%', height = 16, style = {} }) {
  return <div className="skeleton" style={{ width, height, ...style }} />;
}

export function SkeletonBlock({ rows = 3, gap = 8 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} width={i === rows - 1 ? '60%' : '100%'} height={14} />
      ))}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, width = 480 }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '1rem', animation: 'fadeIn 0.15s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--c-bg)', borderRadius: 'var(--radius-lg)', padding: '1.5rem',
          width: '100%', maxWidth: width, maxHeight: '90vh', overflowY: 'auto',
          boxShadow: 'var(--shadow-lg)', border: '0.5px solid var(--c-border)',
          animation: 'scaleIn 0.18s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>{title}</h3>
          <ModalCloseBtn onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalCloseBtn({ onClick }) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        background: h ? 'var(--c-bg2)' : 'none', border: 'none',
        color: h ? 'var(--c-text)' : 'var(--c-text2)', fontSize: 18,
        cursor: 'pointer', lineHeight: 1, width: 28, height: 28,
        borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all var(--transition)', flexShrink: 0,
      }}
    >
      ×
    </button>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
export function Empty({ icon, title, description, action }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '4rem 2rem', textAlign: 'center', gap: 12, animation: 'fadeIn 0.2s ease',
    }}>
      {icon && (
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--c-purple-light), var(--c-bg2))',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
          marginBottom: 4, border: '0.5px solid var(--c-border)',
        }}>
          {icon}
        </div>
      )}
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', letterSpacing: '-0.01em' }}>{title}</div>
      {description && <div style={{ fontSize: 12, color: 'var(--c-text2)', maxWidth: 300, lineHeight: 1.6 }}>{description}</div>}
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  );
}

// ── Metric card ───────────────────────────────────────────────────────────────
export function MetricCard({ label, value, sub, accent, delta }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--c-bg)', borderRadius: 'var(--radius-lg)', padding: '16px 18px', flex: 1, minWidth: 0,
        border: '0.5px solid var(--c-border)',
        boxShadow: hovered ? 'var(--shadow-md)' : 'var(--shadow)',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'box-shadow var(--transition), transform var(--transition)',
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--c-text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 24, fontWeight: 600, color: accent || 'var(--c-text)', letterSpacing: '-0.02em' }}>{value}</span>
        {delta && (
          <span style={{ fontSize: 11, fontWeight: 500, color: delta.startsWith('+') ? 'var(--c-green)' : 'var(--c-red)' }}>
            {delta}
          </span>
        )}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--c-text3)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────
export function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', borderBottom: '0.5px solid var(--c-border)', gap: 0, overflowX: 'auto', marginBottom: '1.5rem' }}>
      {tabs.map(t => <TabBarItem key={t.id} t={t} active={active === t.id} onChange={onChange} />)}
    </div>
  );
}

function TabBarItem({ t, active, onChange }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={() => onChange(t.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '8px 14px 10px', fontSize: 13, fontWeight: active ? 600 : 400, background: 'none', border: 'none',
        borderBottom: active ? '2px solid var(--c-purple)' : '2px solid transparent',
        color: active ? 'var(--c-purple)' : hovered ? 'var(--c-text)' : 'var(--c-text2)',
        cursor: 'pointer', whiteSpace: 'nowrap',
        transition: 'color var(--transition), border-color var(--transition)',
      }}
    >
      {t.label}
    </button>
  );
}

// ── Page header ───────────────────────────────────────────────────────────────
export function PageHeader({ title, description, action, breadcrumb }) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      {breadcrumb && (
        <div style={{ fontSize: 11, color: 'var(--c-text3)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
          {breadcrumb}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 3, letterSpacing: '-0.02em', color: 'var(--c-text)' }}>{title}</h2>
          {description && <p style={{ fontSize: 12, color: 'var(--c-text2)', lineHeight: 1.5 }}>{description}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
export function Tooltip({ children, text, position = 'top' }) {
  const [visible, setVisible] = useState(false);
  const posStyles = {
    top:    { bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)' },
    bottom: { top:    'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)' },
    left:   { right:  'calc(100% + 6px)', top:  '50%', transform: 'translateY(-50%)' },
    right:  { left:   'calc(100% + 6px)', top:  '50%', transform: 'translateY(-50%)' },
  };
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && text && (
        <div style={{
          position: 'absolute', ...posStyles[position],
          background: '#1a1a1a', color: '#fff', fontSize: 11, fontWeight: 500,
          padding: '4px 9px', borderRadius: 5, whiteSpace: 'nowrap', zIndex: 9999,
          pointerEvents: 'none', animation: 'fadeIn 0.1s ease',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}>
          {text}
        </div>
      )}
    </div>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────
export function Divider({ label, style = {} }) {
  if (!label) return <div style={{ height: '0.5px', background: 'var(--c-border)', margin: '1rem 0', ...style }} />;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '1rem 0', ...style }}>
      <div style={{ flex: 1, height: '0.5px', background: 'var(--c-border)' }} />
      <span style={{ fontSize: 11, color: 'var(--c-text3)', fontWeight: 500, whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: '0.5px', background: 'var(--c-border)' }} />
    </div>
  );
}
