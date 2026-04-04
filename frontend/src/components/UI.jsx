import { useState } from 'react';

// ── Button ────────────────────────────────────────────────────────────────────
export function Btn({ children, onClick, variant = 'primary', size = 'md', disabled, loading, style = {}, type = 'button' }) {
  const base = { display:'inline-flex', alignItems:'center', gap:6, fontWeight:500, borderRadius:'var(--radius)', border:'none', cursor: disabled||loading ? 'not-allowed' : 'pointer', transition:'opacity 0.15s', opacity: disabled||loading ? 0.5 : 1, fontFamily:'inherit' };
  const sizes = { sm: { fontSize:11, padding:'4px 10px' }, md: { fontSize:13, padding:'8px 16px' }, lg: { fontSize:14, padding:'11px 22px' } };
  const variants = {
    primary:  { background:'var(--c-purple)', color:'#fff' },
    secondary:{ background:'transparent', color:'var(--c-text)', border:'0.5px solid var(--c-border2)' },
    danger:   { background:'transparent', color:'var(--c-red)', border:'0.5px solid var(--c-red)' },
    ghost:    { background:'transparent', color:'var(--c-text2)', border:'none', padding:0 },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled||loading} style={{ ...base, ...sizes[size], ...variants[variant], ...style }}>
      {loading ? '…' : children}
    </button>
  );
}

// ── Input ─────────────────────────────────────────────────────────────────────
export function Input({ label, error, type = 'text', style = {}, ...props }) {
  const inputStyle = { width:'100%', padding:'8px 10px', borderRadius:'var(--radius)', border: error ? '1px solid var(--c-red)' : '0.5px solid var(--c-border2)', background:'var(--c-bg)', color:'var(--c-text)', outline:'none', fontSize:13, boxSizing:'border-box' };
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4, ...style }}>
      {label && <label style={{ fontSize:11, color:'var(--c-text2)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.04em' }}>{label}</label>}
      <input type={type} style={inputStyle} {...props} />
      {error && <span style={{ fontSize:11, color:'var(--c-red)' }}>{error}</span>}
    </div>
  );
}

// ── Select ────────────────────────────────────────────────────────────────────
export function Select({ label, children, style = {}, ...props }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4, ...style }}>
      {label && <label style={{ fontSize:11, color:'var(--c-text2)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.04em' }}>{label}</label>}
      <select style={{ width:'100%', padding:'8px 10px', borderRadius:'var(--radius)', border:'0.5px solid var(--c-border2)', background:'var(--c-bg)', color:'var(--c-text)', fontSize:13 }} {...props}>{children}</select>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({ children, style = {} }) {
  return <div style={{ background:'var(--c-bg)', border:'0.5px solid var(--c-border)', borderRadius:'var(--radius-lg)', padding:'1.25rem', ...style }}>{children}</div>;
}

// ── Badge ─────────────────────────────────────────────────────────────────────
export function Badge({ text, color = '#7F77DD', small }) {
  return (
    <span style={{ display:'inline-block', fontSize: small ? 10 : 11, fontWeight:500, padding: small ? '1px 5px' : '2px 8px', borderRadius:4, background: color+'22', color, border:`0.5px solid ${color}55`, whiteSpace:'nowrap' }}>
      {text}
    </span>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────
export function Toggle({ checked, onChange, size = 34 }) {
  const h = Math.round(size * 0.56);
  return (
    <div onClick={onChange} style={{ width:size, height:h, borderRadius:h, cursor:'pointer', background: checked ? 'var(--c-green)' : 'var(--c-border2)', position:'relative', transition:'background 0.18s', flexShrink:0 }}>
      <div style={{ position:'absolute', top:2, left: checked ? size-h+2 : 2, width:h-4, height:h-4, borderRadius:'50%', background:'#fff', transition:'left 0.18s' }} />
    </div>
  );
}

// ── Alert ─────────────────────────────────────────────────────────────────────
export function Alert({ type = 'error', message }) {
  if (!message) return null;
  const colors = { error: 'var(--c-red)', success: 'var(--c-green)', warning: 'var(--c-amber)', info: 'var(--c-blue)' };
  const c = colors[type];
  return <div style={{ padding:'10px 14px', borderRadius:'var(--radius)', background: c+'18', border:`0.5px solid ${c}44`, color:c, fontSize:13 }}>{message}</div>;
}

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ size = 20 }) {
  return (
    <div style={{ width:size, height:size, border:`2px solid var(--c-border2)`, borderTop:`2px solid var(--c-purple)`, borderRadius:'50%', animation:'spin 0.7s linear infinite' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, width = 480 }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'1rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'var(--c-bg)', borderRadius:'var(--radius-lg)', padding:'1.5rem', width:'100%', maxWidth:width, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 8px 32px rgba(0,0,0,0.2)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem' }}>
          <h3 style={{ fontSize:15, fontWeight:500 }}>{title}</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--c-text2)', fontSize:18, cursor:'pointer', lineHeight:1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
export function Empty({ icon, title, description, action }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'4rem 2rem', textAlign:'center', gap:12 }}>
      {icon && <div style={{ fontSize:32, opacity:0.3 }}>{icon}</div>}
      <div style={{ fontSize:14, fontWeight:500, color:'var(--c-text)' }}>{title}</div>
      {description && <div style={{ fontSize:12, color:'var(--c-text2)', maxWidth:300 }}>{description}</div>}
      {action}
    </div>
  );
}

// ── Metric card ───────────────────────────────────────────────────────────────
export function MetricCard({ label, value, sub, accent, delta }) {
  return (
    <div style={{ background:'var(--c-bg2)', borderRadius:'var(--radius)', padding:'14px 16px', flex:1, minWidth:0 }}>
      <div style={{ fontSize:10, color:'var(--c-text2)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</div>
      <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
        <span style={{ fontSize:22, fontWeight:500, color: accent || 'var(--c-text)' }}>{value}</span>
        {delta && <span style={{ fontSize:11, color: delta.startsWith('+') ? 'var(--c-green)' : 'var(--c-red)' }}>{delta}</span>}
      </div>
      {sub && <div style={{ fontSize:10, color:'var(--c-text3)', marginTop:2 }}>{sub}</div>}
    </div>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────
export function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display:'flex', borderBottom:'0.5px solid var(--c-border)', gap:0, overflowX:'auto', marginBottom:'1.5rem' }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{ padding:'8px 14px 10px', fontSize:13, fontWeight:500, background:'none', border:'none', borderBottom: active===t.id ? '2px solid var(--c-text)' : '2px solid transparent', color: active===t.id ? 'var(--c-text)' : 'var(--c-text2)', cursor:'pointer', whiteSpace:'nowrap' }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Page layout ───────────────────────────────────────────────────────────────
export function PageHeader({ title, description, action }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'1.5rem' }}>
      <div>
        <h2 style={{ fontSize:16, fontWeight:500, marginBottom:3 }}>{title}</h2>
        {description && <p style={{ fontSize:12, color:'var(--c-text2)' }}>{description}</p>}
      </div>
      {action}
    </div>
  );
}
