import { useState, useRef, useEffect } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens (mirrors CSS variables — useful for JS-computed values)
// ─────────────────────────────────────────────────────────────────────────────
const T = {
  accent: '#8b5cf6',
  accentDark: '#7c3aed',
  accentLight: '#a78bfa',
  accentDim: 'rgba(139,92,246,0.12)',
  accentBorder: 'rgba(139,92,246,0.35)',
  green: '#22c55e',
  red: '#ef4444',
  amber: '#f59e0b',
  blue: '#3b82f6',
  bg: '#09090b',
  bg3: '#18181b',
  bg4: '#1c1c1f',
  bg5: '#232327',
  border: 'rgba(255,255,255,0.07)',
  border2: 'rgba(255,255,255,0.12)',
  border3: 'rgba(255,255,255,0.20)',
  text: '#f4f4f5',
  text2: '#a1a1aa',
  text3: '#71717a',
};

// ─────────────────────────────────────────────────────────────────────────────
// Button
// ─────────────────────────────────────────────────────────────────────────────
export function Btn({
  children, onClick, variant = 'primary', size = 'md',
  disabled, loading, style = {}, type = 'button',
}) {
  const [hov, setHov] = useState(false);
  const [press, setPress] = useState(false);

  const sizes = {
    sm: { fontSize: 11, padding: '4px 12px', gap: 5, height: 28 },
    md: { fontSize: 13, padding: '0 16px',   gap: 6, height: 34 },
    lg: { fontSize: 14, padding: '0 22px',   gap: 7, height: 40 },
  };

  const variantStyle = (() => {
    const off = disabled || loading;
    switch (variant) {
      case 'primary':
        return {
          background: off ? T.accentDark : hov ? '#9333ea' : T.accentDark,
          color: '#fff',
          border: 'none',
          boxShadow: hov && !off
            ? `0 0 0 1px ${T.accentBorder}, 0 4px 12px rgba(139,92,246,0.35)`
            : '0 1px 2px rgba(0,0,0,0.4)',
        };
      case 'secondary':
        return {
          background: hov && !off ? T.bg5 : T.bg4,
          color: hov && !off ? T.text : T.text2,
          border: `1px solid ${hov && !off ? T.border3 : T.border2}`,
          boxShadow: 'none',
        };
      case 'danger':
        return {
          background: hov && !off ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.07)',
          color: T.red,
          border: `1px solid rgba(239,68,68,${hov && !off ? 0.4 : 0.25})`,
          boxShadow: 'none',
        };
      case 'ghost':
        return {
          background: hov && !off ? T.bg5 : 'transparent',
          color: hov && !off ? T.text : T.text2,
          border: 'none',
          boxShadow: 'none',
        };
      default:
        return {};
    }
  })();

  const s = sizes[size] || sizes.md;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setPress(false); }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        height: s.height, padding: s.padding, gap: s.gap, fontSize: s.fontSize,
        fontWeight: 500, borderRadius: 'var(--radius)', cursor: disabled || loading ? 'not-allowed' : 'pointer',
        transition: 'all var(--transition)', fontFamily: 'inherit', lineHeight: 1,
        whiteSpace: 'nowrap', letterSpacing: '0.01em',
        opacity: disabled || loading ? 0.45 : 1,
        transform: press && !disabled && !loading ? 'scale(0.97)' : 'scale(1)',
        ...variantStyle, ...style,
      }}
    >
      {loading ? (
        <>
          <span style={{
            width: size === 'sm' ? 10 : 12, height: size === 'sm' ? 10 : 12,
            border: '1.5px solid currentColor', borderTopColor: 'transparent',
            borderRadius: '50%', animation: 'spin 0.65s linear infinite', display: 'inline-block', flexShrink: 0,
          }} />
          {typeof children === 'string' ? children : 'Loading…'}
        </>
      ) : children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Input
// ─────────────────────────────────────────────────────────────────────────────
export function Input({ label, error, hint, type = 'text', style = {}, inputStyle = {}, prefix, suffix, ...props }) {
  const [focused, setFocused] = useState(false);

  const base = {
    width: '100%', height: 36, padding: prefix ? '0 10px 0 32px' : '0 10px',
    borderRadius: 'var(--radius)',
    border: error
      ? `1px solid rgba(239,68,68,0.5)`
      : focused
        ? `1px solid ${T.accentBorder}`
        : `1px solid ${T.border2}`,
    background: focused ? T.bg5 : T.bg4,
    color: T.text, outline: 'none', fontSize: 13,
    transition: 'border-color var(--transition), background var(--transition), box-shadow var(--transition)',
    boxShadow: focused && !error ? `0 0 0 3px rgba(139,92,246,0.14)` : 'none',
    boxSizing: 'border-box',
    ...inputStyle,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, ...style }}>
      {label && (
        <label style={{
          fontSize: 11, fontWeight: 500, color: T.text2,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {label}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        {prefix && (
          <span style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            color: T.text3, fontSize: 13, pointerEvents: 'none',
          }}>
            {prefix}
          </span>
        )}
        <input
          type={type}
          style={base}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...props}
        />
        {suffix && (
          <span style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            color: T.text3, fontSize: 13, pointerEvents: 'none',
          }}>
            {suffix}
          </span>
        )}
      </div>
      {error && <span style={{ fontSize: 11, color: T.red, display: 'flex', alignItems: 'center', gap: 4 }}>⊗ {error}</span>}
      {hint && !error && <span style={{ fontSize: 11, color: T.text3 }}>{hint}</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Select
// ─────────────────────────────────────────────────────────────────────────────
export function Select({ label, children, style = {}, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, ...style }}>
      {label && (
        <label style={{ fontSize: 11, fontWeight: 500, color: T.text2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </label>
      )}
      <select
        style={{
          width: '100%', height: 36, padding: '0 10px',
          borderRadius: 'var(--radius)',
          border: focused ? `1px solid ${T.accentBorder}` : `1px solid ${T.border2}`,
          background: focused ? T.bg5 : T.bg4,
          color: T.text, fontSize: 13, outline: 'none', cursor: 'pointer',
          transition: 'border-color var(--transition), background var(--transition), box-shadow var(--transition)',
          boxShadow: focused ? `0 0 0 3px rgba(139,92,246,0.14)` : 'none',
          appearance: 'auto',
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

// ─────────────────────────────────────────────────────────────────────────────
// Textarea
// ─────────────────────────────────────────────────────────────────────────────
export function Textarea({ label, error, style = {}, rows = 4, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, ...style }}>
      {label && (
        <label style={{ fontSize: 11, fontWeight: 500, color: T.text2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </label>
      )}
      <textarea
        rows={rows}
        style={{
          width: '100%', padding: '9px 10px', borderRadius: 'var(--radius)',
          border: error
            ? `1px solid rgba(239,68,68,0.5)`
            : focused ? `1px solid ${T.accentBorder}` : `1px solid ${T.border2}`,
          background: focused ? T.bg5 : T.bg4,
          color: T.text, outline: 'none', fontSize: 13,
          transition: 'border-color var(--transition), background var(--transition), box-shadow var(--transition)',
          boxShadow: focused && !error ? `0 0 0 3px rgba(139,92,246,0.14)` : 'none',
          resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box',
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...props}
      />
      {error && <span style={{ fontSize: 11, color: T.red }}>⊗ {error}</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card
// ─────────────────────────────────────────────────────────────────────────────
export function Card({ children, style = {}, hoverable = false, accent = false }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={hoverable ? () => setHov(true) : undefined}
      onMouseLeave={hoverable ? () => setHov(false) : undefined}
      style={{
        background: T.bg4,
        border: `1px solid ${hov && hoverable ? T.border3 : T.border}`,
        borderRadius: 'var(--radius-lg)', padding: '1.1rem',
        boxShadow: hov && hoverable ? 'var(--shadow-md)' : 'var(--shadow)',
        transform: hov && hoverable ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'box-shadow var(--transition), transform var(--transition), border-color var(--transition)',
        ...(accent ? { borderLeft: `2px solid ${T.accent}` } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Badge
// ─────────────────────────────────────────────────────────────────────────────
export function Badge({ text, color = T.accent, small }) {
  const dimmed = color + (color.startsWith('#') ? '1a' : '');
  const bordered = color + (color.startsWith('#') ? '40' : '');
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      fontSize: small ? 10 : 11, fontWeight: 500,
      padding: small ? '1px 7px' : '2px 9px',
      borderRadius: 99,
      background: `${color}18`,
      color,
      border: `1px solid ${color}35`,
      whiteSpace: 'nowrap', letterSpacing: '0.01em',
    }}>
      {text}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Toggle
// ─────────────────────────────────────────────────────────────────────────────
export function Toggle({ checked, onChange, size = 34, disabled = false }) {
  const [hov, setHov] = useState(false);
  const h = Math.round(size * 0.55);
  return (
    <div
      role="switch"
      aria-checked={checked}
      onClick={disabled ? undefined : onChange}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: size, height: h, borderRadius: h, cursor: disabled ? 'not-allowed' : 'pointer',
        background: checked
          ? (hov && !disabled ? '#16a34a' : T.green)
          : (hov && !disabled ? T.border3 : T.border2),
        position: 'relative',
        transition: 'background 0.2s',
        flexShrink: 0,
        opacity: disabled ? 0.4 : 1,
        boxShadow: hov && !disabled ? `0 0 0 3px ${checked ? 'rgba(34,197,94,0.18)' : 'rgba(255,255,255,0.06)'}` : 'none',
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: checked ? size - h + 2 : 2,
        width: h - 4, height: h - 4, borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.2s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
      }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Alert
// ─────────────────────────────────────────────────────────────────────────────
const ALERT_CFG = {
  error:   { color: T.red,   icon: '⊗',  bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)'   },
  success: { color: T.green, icon: '✓',  bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.25)'   },
  warning: { color: T.amber, icon: '⚠',  bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)'  },
  info:    { color: T.blue,  icon: 'ℹ',  bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.25)'  },
};

export function Alert({ type = 'error', message }) {
  if (!message) return null;
  const { color, icon, bg, border } = ALERT_CFG[type] || ALERT_CFG.error;
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 'var(--radius)',
      background: bg, border: `1px solid ${border}`,
      color, fontSize: 13, display: 'flex', alignItems: 'flex-start',
      gap: 9, animation: 'fadeIn 0.15s ease',
    }}>
      <span style={{ flexShrink: 0, fontWeight: 700, marginTop: 1 }}>{icon}</span>
      <span style={{ lineHeight: 1.5 }}>{message}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Spinner
// ─────────────────────────────────────────────────────────────────────────────
export function Spinner({ size = 20, color }) {
  return (
    <div style={{
      width: size, height: size, flexShrink: 0,
      border: `2px solid ${T.border3}`,
      borderTop: `2px solid ${color || T.accent}`,
      borderRadius: '50%', animation: 'spin 0.65s linear infinite',
    }} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton
// ─────────────────────────────────────────────────────────────────────────────
export function Skeleton({ width = '100%', height = 16, style = {} }) {
  return <div className="skeleton" style={{ width, height, ...style }} />;
}

export function SkeletonBlock({ rows = 3, gap = 8 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} width={i === rows - 1 ? '55%' : '100%'} height={14} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, width = 480 }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '1rem', animation: 'fadeIn 0.15s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: T.bg3,
          border: `1px solid ${T.border2}`,
          borderRadius: 'var(--radius-xl)', padding: '1.5rem',
          width: '100%', maxWidth: width, maxHeight: '88vh', overflowY: 'auto',
          boxShadow: 'var(--shadow-lg)', animation: 'scaleIn 0.18s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: T.text, letterSpacing: '-0.01em' }}>{title}</h3>
          <CloseBtn onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}

function CloseBtn({ onClick }) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        background: h ? T.bg5 : 'none', border: 'none',
        color: h ? T.text : T.text3, fontSize: 18, cursor: 'pointer',
        lineHeight: 1, width: 28, height: 28, borderRadius: 6,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all var(--transition)', flexShrink: 0,
      }}
    >
      ×
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────
export function Empty({ icon, title, description, action }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '4rem 2rem',
      textAlign: 'center', gap: 14, animation: 'fadeIn 0.2s ease',
    }}>
      {icon && (
        <div style={{
          width: 60, height: 60, borderRadius: 14,
          background: `linear-gradient(135deg, ${T.accentDim}, ${T.bg5})`,
          border: `1px solid ${T.border2}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, marginBottom: 4,
        }}>
          {icon}
        </div>
      )}
      <div style={{ fontSize: 14, fontWeight: 600, color: T.text, letterSpacing: '-0.01em' }}>{title}</div>
      {description && (
        <div style={{ fontSize: 12, color: T.text3, maxWidth: 280, lineHeight: 1.65 }}>{description}</div>
      )}
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MetricCard
// ─────────────────────────────────────────────────────────────────────────────
export function MetricCard({ label, value, sub, accent, delta }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: T.bg4,
        border: `1px solid ${hov ? T.border2 : T.border}`,
        borderRadius: 'var(--radius-lg)', padding: '16px 20px', flex: 1, minWidth: 0,
        boxShadow: hov ? 'var(--shadow-md)' : 'var(--shadow)',
        transform: hov ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'box-shadow var(--transition), transform var(--transition), border-color var(--transition)',
      }}
    >
      <div style={{ fontSize: 10, color: T.text3, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: accent || T.text, letterSpacing: '-0.03em', lineHeight: 1 }}>
          {value}
        </span>
        {delta && (
          <span style={{
            fontSize: 11, fontWeight: 600,
            color: delta.startsWith('+') ? T.green : T.red,
          }}>
            {delta}
          </span>
        )}
      </div>
      {sub && <div style={{ fontSize: 11, color: T.text3, marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TabBar
// ─────────────────────────────────────────────────────────────────────────────
export function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{
      display: 'flex',
      borderBottom: `1px solid ${T.border}`,
      gap: 0, overflowX: 'auto', marginBottom: '1.5rem',
    }}>
      {tabs.map(t => <TabBarItem key={t.id} t={t} active={active === t.id} onChange={onChange} />)}
    </div>
  );
}

function TabBarItem({ t, active, onChange }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={() => onChange(t.id)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '9px 16px 11px', fontSize: 13,
        fontWeight: active ? 600 : 400, background: 'none', border: 'none',
        borderBottom: active ? `2px solid ${T.accent}` : '2px solid transparent',
        color: active ? T.accentLight : hov ? T.text : T.text2,
        cursor: 'pointer', whiteSpace: 'nowrap',
        transition: 'color var(--transition), border-color var(--transition)',
        fontFamily: 'inherit',
      }}
    >
      {t.label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PageHeader
// ─────────────────────────────────────────────────────────────────────────────
export function PageHeader({ title, description, action, breadcrumb }) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      {breadcrumb && (
        <div style={{
          fontSize: 11, color: T.text3, marginBottom: 7,
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          {breadcrumb}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 3, letterSpacing: '-0.025em', color: T.text }}>
            {title}
          </h2>
          {description && (
            <p style={{ fontSize: 12, color: T.text3, lineHeight: 1.55, maxWidth: 480 }}>{description}</p>
          )}
        </div>
        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip
// ─────────────────────────────────────────────────────────────────────────────
export function Tooltip({ children, text, position = 'top' }) {
  const [vis, setVis] = useState(false);
  const posStyles = {
    top:    { bottom: 'calc(100% + 7px)', left: '50%', transform: 'translateX(-50%)' },
    bottom: { top:    'calc(100% + 7px)', left: '50%', transform: 'translateX(-50%)' },
    left:   { right:  'calc(100% + 7px)', top:  '50%', transform: 'translateY(-50%)' },
    right:  { left:   'calc(100% + 7px)', top:  '50%', transform: 'translateY(-50%)' },
  };
  return (
    <div
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setVis(true)}
      onMouseLeave={() => setVis(false)}
    >
      {children}
      {vis && text && (
        <div style={{
          position: 'absolute', ...posStyles[position],
          background: '#1a1a1e', color: T.text,
          border: `1px solid ${T.border3}`,
          fontSize: 11, fontWeight: 500,
          padding: '5px 10px', borderRadius: 6,
          whiteSpace: 'nowrap', zIndex: 9999,
          pointerEvents: 'none', animation: 'fadeIn 0.1s ease',
          boxShadow: 'var(--shadow-md)',
        }}>
          {text}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Divider
// ─────────────────────────────────────────────────────────────────────────────
export function Divider({ label, style = {} }) {
  if (!label) return <div style={{ height: '1px', background: T.border, margin: '1.25rem 0', ...style }} />;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '1.25rem 0', ...style }}>
      <div style={{ flex: 1, height: '1px', background: T.border }} />
      <span style={{ fontSize: 11, color: T.text3, fontWeight: 500, whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: '1px', background: T.border }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatusDot
// ─────────────────────────────────────────────────────────────────────────────
export function StatusDot({ active, size = 7 }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: active ? T.green : T.border3,
      boxShadow: active ? `0 0 6px ${T.green}66` : 'none',
    }} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CodeBlock
// ─────────────────────────────────────────────────────────────────────────────
export function CodeBlock({ children, style = {} }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(String(children)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <div style={{
      position: 'relative', background: T.bg,
      border: `1px solid ${T.border2}`, borderRadius: 'var(--radius)',
      padding: '12px 14px', paddingRight: 44, ...style,
    }}>
      <pre style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: T.text2, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {children}
      </pre>
      <button
        onClick={copy}
        title="Copy"
        style={{
          position: 'absolute', top: 8, right: 8,
          background: T.bg5, border: `1px solid ${T.border2}`,
          borderRadius: 5, padding: '3px 7px', fontSize: 10,
          color: copied ? T.green : T.text3, cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        {copied ? '✓' : 'copy'}
      </button>
    </div>
  );
}
