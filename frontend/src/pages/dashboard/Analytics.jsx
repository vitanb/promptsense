import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import { promptApi } from '../../services/api';
import { MetricCard, Card, PageHeader, Spinner } from '../../components/UI';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#7F77DD','#1D9E75','#D85A30','#378ADD','#BA7517','#E24B4A'];

// ── Tiny sub-components ────────────────────────────────────────────────────────

function SectionTitle({ children }) {
  return <div style={{ fontSize:13, fontWeight:600, marginBottom:'1rem' }}>{children}</div>;
}

function MiniBar({ value, max, color = 'var(--c-purple)' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ flex:1, height:5, background:'var(--c-border)', borderRadius:3, overflow:'hidden' }}>
      <div style={{ width: pct + '%', height:'100%', background: color, borderRadius:3, transition:'width 0.4s' }} />
    </div>
  );
}

function FlagBadge({ count }) {
  if (!count || count === '0') return <span style={{ fontSize:11, color:'var(--c-text3)' }}>—</span>;
  return (
    <span style={{ fontSize:11, padding:'1px 7px', borderRadius:10, background:'var(--c-red)18', color:'var(--c-red)', fontWeight:500 }}>
      {Number(count).toLocaleString()}
    </span>
  );
}

function CostBadge({ val }) {
  const n = parseFloat(val || 0);
  return (
    <span style={{ fontSize:11, color:'var(--c-text2)', fontFamily:'monospace' }}>
      ${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}
    </span>
  );
}

// ── User breakdown table ──────────────────────────────────────────────────────

function UserTable({ rows }) {
  const [sort, setSort] = useState('total');
  if (!rows?.length) return (
    <div style={{ textAlign:'center', padding:'2rem', color:'var(--c-text3)', fontSize:13 }}>
      No prompt activity in this period. User data appears once prompts are sent through the proxy.
    </div>
  );

  const sorted = [...rows].sort((a, b) => Number(b[sort]) - Number(a[sort]));
  const maxTotal = Number(sorted[0]?.total || 1);

  const SortBtn = ({ col, label }) => (
    <button onClick={() => setSort(col)}
      style={{ fontSize:11, fontWeight: sort === col ? 600 : 400, color: sort === col ? 'var(--c-purple)' : 'var(--c-text3)', background:'none', border:'none', cursor:'pointer', padding:'0 4px' }}>
      {label}{sort === col ? ' ↓' : ''}
    </button>
  );

  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
        <thead>
          <tr style={{ borderBottom:'0.5px solid var(--c-border)' }}>
            <th style={{ textAlign:'left', padding:'8px 10px', fontSize:11, color:'var(--c-text3)', fontWeight:500 }}>User</th>
            <th style={{ textAlign:'left', padding:'8px 10px', fontSize:11, color:'var(--c-text3)', fontWeight:500 }}>Department</th>
            <th style={{ textAlign:'right', padding:'8px 10px' }}><SortBtn col="total"   label="Requests" /></th>
            <th style={{ textAlign:'center', padding:'8px 10px' }}><SortBtn col="flagged" label="Flagged" /></th>
            <th style={{ textAlign:'right', padding:'8px 10px' }}><SortBtn col="tokens"  label="Tokens" /></th>
            <th style={{ textAlign:'right', padding:'8px 10px' }}><SortBtn col="est_cost_usd" label="Est. cost" /></th>
            <th style={{ width:100, padding:'8px 10px' }} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const flagRate = row.total > 0 ? Math.round((row.flagged / row.total) * 100) : 0;
            return (
              <tr key={row.user_id} style={{ borderBottom:'0.5px solid var(--c-border)', background: i % 2 === 0 ? 'var(--c-bg)' : 'var(--c-bg2)' }}>
                <td style={{ padding:'9px 10px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:26, height:26, borderRadius:'50%', background:'var(--c-purple)18', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:600, color:'var(--c-purple)', flexShrink:0 }}>
                      {(row.name || '?').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize:12, fontWeight:500, whiteSpace:'nowrap' }}>{row.name}</div>
                      {row.email && row.email !== row.name && (
                        <div style={{ fontSize:10, color:'var(--c-text3)' }}>{row.email}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td style={{ padding:'9px 10px', fontSize:12, color:'var(--c-text2)' }}>
                  {row.department || <span style={{ color:'var(--c-text3)', fontSize:11 }}>—</span>}
                </td>
                <td style={{ padding:'9px 10px', textAlign:'right', fontWeight:500 }}>
                  {Number(row.total).toLocaleString()}
                </td>
                <td style={{ padding:'9px 10px', textAlign:'center' }}>
                  <FlagBadge count={row.flagged} />
                  {row.flagged > 0 && <span style={{ fontSize:10, color:'var(--c-text3)', marginLeft:4 }}>{flagRate}%</span>}
                </td>
                <td style={{ padding:'9px 10px', textAlign:'right', fontSize:12, color:'var(--c-text2)', fontFamily:'monospace' }}>
                  {Number(row.tokens || 0).toLocaleString()}
                </td>
                <td style={{ padding:'9px 10px', textAlign:'right' }}>
                  <CostBadge val={row.est_cost_usd} />
                </td>
                <td style={{ padding:'9px 10px' }}>
                  <MiniBar value={Number(row.total)} max={maxTotal} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Department breakdown ──────────────────────────────────────────────────────

function DepartmentBreakdown({ rows }) {
  if (!rows?.length) return (
    <div style={{ textAlign:'center', padding:'2rem', color:'var(--c-text3)', fontSize:13 }}>
      No data yet. Assign departments to team members to see this breakdown.
    </div>
  );

  const maxTotal = Number(rows[0]?.total || 1);

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.5rem', alignItems:'start' }}>
      {/* Bar chart */}
      <div>
        <ResponsiveContainer width="100%" height={Math.max(rows.length * 36, 120)}>
          <BarChart layout="vertical" data={rows.map(r => ({ name: r.department, requests: Number(r.total), flagged: Number(r.flagged) }))}
            margin={{ top:0, right:20, left:0, bottom:0 }}>
            <XAxis type="number" tick={{ fontSize:10 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize:11 }} width={90} />
            <Tooltip />
            <Bar dataKey="requests" fill="#7F77DD55" stackId="a" radius={[0,2,2,0]} />
            <Bar dataKey="flagged"  fill="#E24B4A55" stackId="a" radius={[0,2,2,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ borderBottom:'0.5px solid var(--c-border)' }}>
              <th style={{ textAlign:'left', padding:'6px 8px', fontSize:11, color:'var(--c-text3)', fontWeight:500 }}>Department</th>
              <th style={{ textAlign:'right', padding:'6px 8px', fontSize:11, color:'var(--c-text3)', fontWeight:500 }}>Requests</th>
              <th style={{ textAlign:'center', padding:'6px 8px', fontSize:11, color:'var(--c-text3)', fontWeight:500 }}>Flagged</th>
              <th style={{ textAlign:'right', padding:'6px 8px', fontSize:11, color:'var(--c-text3)', fontWeight:500 }}>Tokens</th>
              <th style={{ textAlign:'right', padding:'6px 8px', fontSize:11, color:'var(--c-text3)', fontWeight:500 }}>Est. cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.department} style={{ borderBottom:'0.5px solid var(--c-border)', background: i%2===0?'var(--c-bg)':'var(--c-bg2)' }}>
                <td style={{ padding:'7px 8px', fontWeight:500 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ width:8, height:8, borderRadius:2, background: COLORS[i % COLORS.length], flexShrink:0 }} />
                    {row.department}
                  </div>
                </td>
                <td style={{ padding:'7px 8px', textAlign:'right', fontWeight:500 }}>{Number(row.total).toLocaleString()}</td>
                <td style={{ padding:'7px 8px', textAlign:'center' }}><FlagBadge count={row.flagged} /></td>
                <td style={{ padding:'7px 8px', textAlign:'right', fontFamily:'monospace', color:'var(--c-text2)' }}>{Number(row.tokens||0).toLocaleString()}</td>
                <td style={{ padding:'7px 8px', textAlign:'right' }}><CostBadge val={row.est_cost_usd} /></td>
              </tr>
            ))}
          </tbody>
          {rows.length > 1 && (
            <tfoot>
              <tr style={{ borderTop:'0.5px solid var(--c-border2)', background:'var(--c-bg2)' }}>
                <td style={{ padding:'7px 8px', fontSize:11, fontWeight:600, color:'var(--c-text3)' }}>Total</td>
                <td style={{ padding:'7px 8px', textAlign:'right', fontWeight:600 }}>{rows.reduce((s,r)=>s+Number(r.total),0).toLocaleString()}</td>
                <td style={{ padding:'7px 8px', textAlign:'center' }}><FlagBadge count={rows.reduce((s,r)=>s+Number(r.flagged),0)} /></td>
                <td style={{ padding:'7px 8px', textAlign:'right', fontFamily:'monospace', color:'var(--c-text2)' }}>{rows.reduce((s,r)=>s+Number(r.tokens||0),0).toLocaleString()}</td>
                <td style={{ padding:'7px 8px', textAlign:'right' }}><CostBadge val={rows.reduce((s,r)=>s+parseFloat(r.est_cost_usd||0),0).toFixed(4)} /></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Analytics() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.org_id;
  const [data, setData] = useState(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview'); // 'overview' | 'users' | 'departments'

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    promptApi.analytics(orgId, { days }).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [orgId, days]);

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:'4rem' }}><Spinner size={32} /></div>;
  if (!data) return <div style={{ color:'var(--c-text2)', padding:'2rem', textAlign:'center' }}>Could not load analytics data.</div>;

  const { summary, byProvider, byHour, flagSummary, currentPeriod, byUser, byDepartment } = data;
  const passRate = summary.total > 0 ? Math.round((summary.passed / summary.total) * 100) : 100;

  const DaySelect = (
    <select value={days} onChange={e => setDays(Number(e.target.value))}
      style={{ fontSize:12, padding:'5px 10px', borderRadius:'var(--radius)', border:'0.5px solid var(--c-border2)', background:'var(--c-bg)', color:'var(--c-text)', cursor:'pointer' }}>
      {[7,14,30,90].map(d => <option key={d} value={d}>Last {d} days</option>)}
    </select>
  );

  const TabBtn = ({ id, label }) => (
    <button onClick={() => setTab(id)}
      style={{ fontSize:12, fontWeight: tab===id ? 600 : 400, padding:'6px 14px', borderRadius:'var(--radius)',
        background: tab===id ? 'var(--c-purple)' : 'transparent', color: tab===id ? '#fff' : 'var(--c-text2)',
        border: tab===id ? 'none' : '0.5px solid var(--c-border2)', cursor:'pointer' }}>
      {label}
    </button>
  );

  return (
    <div>
      <PageHeader title="Analytics" description="Request volume, guardrail performance, and team usage." action={DaySelect} />

      {/* Summary metrics */}
      <div style={{ display:'flex', gap:10, marginBottom:'1.5rem', flexWrap:'wrap' }}>
        <MetricCard label="Total requests"   value={Number(summary.total||0).toLocaleString()}          sub={`${days}-day period`} />
        <MetricCard label="Pass rate"        value={passRate + '%'}                                      accent={passRate > 70 ? 'var(--c-green)' : 'var(--c-red)'} sub={`${summary.failed||0} flagged`} />
        <MetricCard label="Avg latency"      value={Math.round(summary.avg_latency||0) + ' ms'}         sub="end-to-end" />
        <MetricCard label="Tokens used"      value={Number(summary.total_tokens||0).toLocaleString()}   sub="this period" />
        <MetricCard label="Est. cost"        value={'$' + (Number(summary.total_tokens||0) * 0.00001).toFixed(2)} sub="~$0.01/1K tokens avg" />
        <MetricCard label="This month"       value={Number(currentPeriod.requests||0).toLocaleString()} sub={`${currentPeriod.blocked||0} blocked`} />
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:6, marginBottom:'1.5rem' }}>
        <TabBtn id="overview"     label="Overview" />
        <TabBtn id="users"        label={`Users (${byUser?.length || 0})`} />
        <TabBtn id="departments"  label={`Departments (${byDepartment?.length || 0})`} />
      </div>

      {/* ── Overview tab ── */}
      {tab === 'overview' && (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'1.25rem', marginBottom:'1.25rem' }}>
            <Card>
              <SectionTitle>Request volume</SectionTitle>
              {byHour?.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={byHour.map(h => ({ time: new Date(h.hour).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}), passed: h.total - h.flagged, flagged: parseInt(h.flagged||0) }))}>
                    <XAxis dataKey="time" tick={{ fontSize:10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize:10 }} />
                    <Tooltip />
                    <Bar dataKey="passed"  fill="#378ADD55" stackId="a" />
                    <Bar dataKey="flagged" fill="#E24B4A55" stackId="a" radius={[2,2,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--c-text3)', fontSize:13 }}>No data for this period</div>}
            </Card>

            <Card>
              <SectionTitle>By provider</SectionTitle>
              {byProvider?.length > 0 ? (
                <>
                  <PieChart width={160} height={160} style={{ margin:'0 auto' }}>
                    <Pie data={byProvider} dataKey="count" nameKey="provider" cx="50%" cy="50%" innerRadius={45} outerRadius={70}>
                      {byProvider.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                  <div style={{ display:'flex', flexDirection:'column', gap:5, marginTop:8 }}>
                    {byProvider.map((p, i) => (
                      <div key={p.provider} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11 }}>
                        <span style={{ width:8, height:8, borderRadius:2, background:COLORS[i%COLORS.length], flexShrink:0 }} />
                        <span style={{ flex:1, color:'var(--c-text2)' }}>{p.provider}</span>
                        <span style={{ fontWeight:500 }}>{p.count}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : <div style={{ height:180, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--c-text3)', fontSize:13 }}>No data</div>}
            </Card>
          </div>

          {flagSummary?.length > 0 && (
            <Card>
              <SectionTitle>Top guardrail flags</SectionTitle>
              {flagSummary.map((f, i) => {
                const max = flagSummary[0]?.count || 1;
                const pct = Math.round((f.count / max) * 100);
                return (
                  <div key={f.flag} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                    <div style={{ fontSize:12, color:'var(--c-text2)', width:160, flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.flag}</div>
                    <div style={{ flex:1, height:6, background:'var(--c-border)', borderRadius:3 }}>
                      <div style={{ width:pct+'%', height:'100%', background:COLORS[i%COLORS.length], borderRadius:3 }} />
                    </div>
                    <div style={{ fontSize:11, color:'var(--c-text2)', width:32, textAlign:'right' }}>{f.count}</div>
                  </div>
                );
              })}
            </Card>
          )}
        </>
      )}

      {/* ── Users tab ── */}
      {tab === 'users' && (
        <Card>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem' }}>
            <SectionTitle>Usage by user</SectionTitle>
            <span style={{ fontSize:11, color:'var(--c-text3)' }}>
              Est. cost uses ~$0.01/1K tokens — assign departments in <a href="/dashboard/members" style={{ color:'var(--c-purple)', textDecoration:'none' }}>Members</a>
            </span>
          </div>
          <UserTable rows={byUser} />
        </Card>
      )}

      {/* ── Departments tab ── */}
      {tab === 'departments' && (
        <Card>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem' }}>
            <SectionTitle>Usage by department</SectionTitle>
            <span style={{ fontSize:11, color:'var(--c-text3)' }}>
              Assign departments to members in <a href="/dashboard/members" style={{ color:'var(--c-purple)', textDecoration:'none' }}>Team settings</a>
            </span>
          </div>
          <DepartmentBreakdown rows={byDepartment} />
        </Card>
      )}
    </div>
  );
}
