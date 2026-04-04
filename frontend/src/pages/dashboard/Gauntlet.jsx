import { useState, useEffect, useCallback, useRef } from 'react';
import { gauntletApi, orgApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

// ── Helpers ───────────────────────────────────────────────────────────────────
const SEV_COLOR = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high:     'bg-orange-100 text-orange-800 border-orange-200',
  medium:   'bg-yellow-100 text-yellow-800 border-yellow-200',
  low:      'bg-blue-100 text-blue-800 border-blue-200',
};

const SEV_DOT = {
  critical: 'bg-red-500',
  high:     'bg-orange-400',
  medium:   'bg-yellow-400',
  low:      'bg-blue-400',
};

function SeverityBadge({ sev }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${SEV_COLOR[sev] || 'bg-gray-100 text-gray-600'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${SEV_DOT[sev] || 'bg-gray-400'}`} />
      {sev}
    </span>
  );
}

function StatusPill({ status }) {
  const map = {
    pending:   'bg-gray-100 text-gray-600',
    running:   'bg-blue-100 text-blue-700 animate-pulse',
    completed: 'bg-green-100 text-green-700',
    failed:    'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] || 'bg-gray-100'}`}>
      {status}
    </span>
  );
}

function ScoreGauge({ blocked, total }) {
  if (!total) return <span className="text-gray-400 text-sm">—</span>;
  const pct = Math.round((blocked / total) * 100);
  const color = pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-600';
  const ring  = pct >= 80 ? 'stroke-green-500' : pct >= 50 ? 'stroke-yellow-400' : 'stroke-red-500';
  const r = 18, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div className="flex items-center gap-2">
      <svg width="44" height="44" viewBox="0 0 44 44" className="-rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="#e5e7eb" strokeWidth="4" />
        <circle cx="22" cy="22" r={r} fill="none" className={ring} strokeWidth="4"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <div>
        <div className={`text-lg font-bold leading-tight ${color}`}>{pct}%</div>
        <div className="text-xs text-gray-400">blocked</div>
      </div>
    </div>
  );
}

function ProgressBar({ value, max, color = 'bg-indigo-500' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-2">
      <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Category selector chip ────────────────────────────────────────────────────
function CategoryChip({ cat, selected, onToggle }) {
  return (
    <button
      onClick={() => onToggle(cat.id)}
      className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
        selected
          ? 'bg-indigo-600 border-indigo-600 text-white'
          : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300 hover:text-indigo-600'
      }`}
    >
      {cat.label}
      <span className={`ml-1.5 text-xs ${selected ? 'text-indigo-200' : 'text-gray-400'}`}>
        {cat.probeCount}
      </span>
    </button>
  );
}

// ── New Run Modal ─────────────────────────────────────────────────────────────
function NewRunModal({ providers, categories, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [provider, setProvider] = useState(providers[0]?.provider || '');
  const [selected, setSelected] = useState([]); // empty = all
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const totalProbes = selected.length === 0
    ? categories.reduce((s, c) => s + c.probeCount, 0)
    : categories.filter(c => selected.includes(c.id)).reduce((s, c) => s + c.probeCount, 0);

  function toggleCat(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Give this run a name'); return; }
    if (!provider)    { setError('Select a provider'); return; }
    setLoading(true);
    setError('');
    try {
      const run = await onCreate({ name: name.trim(), provider, categories: selected });
      onClose(run);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold text-gray-900">New Gauntlet Run</h2>
          <p className="text-sm text-gray-500 mt-0.5">Fire adversarial probes at your configured LLM provider to find guardrail gaps.</p>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Run name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Production baseline · Q2 2026"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Target provider</label>
            <select
              value={provider}
              onChange={e => setProvider(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {providers.map(p => (
                <option key={p.provider} value={p.provider}>{p.label || p.provider}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Attack categories
              <span className="ml-2 text-gray-400 font-normal">(leave all unselected to run everything)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <CategoryChip key={cat.id} cat={cat} selected={selected.includes(cat.id)} onToggle={toggleCat} />
              ))}
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-600">
            This will fire <strong>{totalProbes} probes</strong> — each probe is a real API call to your provider.
            Depending on provider latency, runs typically complete in 1–5 minutes.
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => onClose(null)}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || providers.length === 0}
              className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Starting…' : 'Start run'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Result detail row ─────────────────────────────────────────────────────────
function ResultRow({ r }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr
        className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${r.escaped ? 'bg-red-50' : ''}`}
        onClick={() => setOpen(!open)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={`text-base ${r.escaped ? '⚠️' : r.blocked ? '🛡️' : r.error ? '⚡' : '—'}`}>
              {r.escaped ? '⚠️' : r.blocked ? '🛡️' : r.error ? '⚡' : '—'}
            </span>
            <span className="text-sm font-medium text-gray-800">{r.attack_name}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-xs text-gray-500 capitalize">{r.category?.replace(/_/g, ' ')}</td>
        <td className="px-4 py-3"><SeverityBadge sev={r.severity} /></td>
        <td className="px-4 py-3">
          {r.escaped  && <span className="text-red-600 text-xs font-semibold">ESCAPED</span>}
          {r.blocked  && <span className="text-green-600 text-xs font-semibold">BLOCKED</span>}
          {r.error    && <span className="text-orange-500 text-xs font-semibold">ERROR</span>}
        </td>
        <td className="px-4 py-3 text-xs text-gray-400">{r.latency_ms ? `${r.latency_ms}ms` : '—'}</td>
        <td className="px-4 py-3 text-gray-400 text-xs">{open ? '▲' : '▼'}</td>
      </tr>
      {open && (
        <tr className="bg-gray-50 border-b border-gray-100">
          <td colSpan={6} className="px-4 pb-4 pt-2">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Probe prompt</div>
                <pre className="bg-white border border-gray-200 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
                  {r.probe_prompt}
                </pre>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                  Model response {r.escaped ? '⚠️ harmful content not filtered' : r.blocked ? '🛡️ blocked / refused' : ''}
                </div>
                <pre className="bg-white border border-gray-200 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
                  {r.response || r.error || '(no response)'}
                </pre>
              </div>
            </div>
            {r.flags?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {r.flags.map(f => (
                  <span key={f} className="bg-indigo-50 text-indigo-700 text-xs px-2 py-0.5 rounded-full border border-indigo-100">{f}</span>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ── Run detail panel ──────────────────────────────────────────────────────────
function RunDetail({ run: initialRun, orgId, onBack }) {
  const [run, setRun] = useState(initialRun);
  const [results, setResults] = useState([]);
  const [filter, setFilter] = useState('all'); // all | escaped | blocked
  const [catFilter, setCatFilter] = useState('');
  const pollRef = useRef(null);

  const loadResults = useCallback(async () => {
    try {
      const params = {};
      if (filter === 'escaped') params.escaped = 'true';
      if (filter === 'blocked') params.escaped = 'false';
      if (catFilter) params.category = catFilter;
      const rows = await gauntletApi.results(orgId, run.id, params);
      setResults(rows);
    } catch (_) {}
  }, [orgId, run.id, filter, catFilter]);

  const refreshRun = useCallback(async () => {
    try {
      const updated = await gauntletApi.getRun(orgId, run.id);
      setRun(updated);
      if (updated.status === 'completed' || updated.status === 'failed') {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch (_) {}
  }, [orgId, run.id]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  useEffect(() => {
    if (run.status === 'running') {
      pollRef.current = setInterval(() => {
        refreshRun();
        loadResults();
      }, 3000);
    }
    return () => clearInterval(pollRef.current);
  }, [run.status, refreshRun, loadResults]);

  const categories = [...new Set(results.map(r => r.category))].sort();
  const displayed = results; // already filtered server-side

  const escapedCount  = run.escaped || 0;
  const blockedCount  = run.blocked || 0;
  const erroredCount  = run.errored || 0;
  const totalProbes   = run.total_probes || 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <button onClick={onBack} className="mt-1 text-gray-400 hover:text-gray-700 text-lg">←</button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-gray-900">{run.name}</h2>
            <StatusPill status={run.status} />
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            Provider: <strong>{run.provider}</strong>
            {run.model && <> · Model: <strong>{run.model}</strong></>}
            {run.created_at && <> · {new Date(run.created_at).toLocaleString()}</>}
          </p>
        </div>
        <ScoreGauge blocked={blockedCount} total={totalProbes} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total probes', value: totalProbes,  color: 'text-gray-900' },
          { label: 'Blocked / refused', value: blockedCount,  color: 'text-green-600' },
          { label: 'Escaped',      value: escapedCount,  color: escapedCount > 0 ? 'text-red-600 font-bold' : 'text-gray-400' },
          { label: 'Errors',       value: erroredCount,  color: 'text-orange-500' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Severity breakdown */}
      {results.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <div className="text-sm font-semibold text-gray-700 mb-3">Escaped by severity</div>
          <div className="space-y-2">
            {['critical', 'high', 'medium', 'low'].map(sev => {
              const sevEscaped = results.filter(r => r.severity === sev && r.escaped).length;
              const sevTotal   = results.filter(r => r.severity === sev).length;
              return (
                <div key={sev} className="flex items-center gap-3">
                  <SeverityBadge sev={sev} />
                  <ProgressBar
                    value={sevEscaped}
                    max={sevTotal}
                    color={sev === 'critical' ? 'bg-red-500' : sev === 'high' ? 'bg-orange-400' : sev === 'medium' ? 'bg-yellow-400' : 'bg-blue-400'}
                  />
                  <span className="text-xs text-gray-500 whitespace-nowrap">{sevEscaped} / {sevTotal}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Result filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {['all', 'escaped', 'blocked'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                filter === f ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f === 'all' ? 'All' : f === 'escaped' ? '⚠️ Escaped' : '🛡️ Blocked'}
            </button>
          ))}
        </div>
        {categories.length > 1 && (
          <select
            value={catFilter}
            onChange={e => setCatFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="">All categories</option>
            {categories.map(c => (
              <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
            ))}
          </select>
        )}
        <span className="ml-auto text-xs text-gray-400">{displayed.length} results</span>
      </div>

      {/* Results table */}
      {run.status === 'running' && results.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <div className="text-4xl mb-3 animate-spin inline-block">⚙️</div>
          <p className="text-gray-500 text-sm">Probes running — results will appear here shortly…</p>
        </div>
      ) : displayed.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
          No results match the current filter.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Attack</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Severity</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Outcome</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Latency</th>
                <th className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {displayed.map(r => <ResultRow key={r.id} r={r} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Runs list ─────────────────────────────────────────────────────────────────
function RunsList({ runs, onSelect, onNew, canCreate }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Gauntlet</h2>
          <p className="text-sm text-gray-500 mt-0.5">Adversarial red-team testing for your LLM guardrails</p>
        </div>
        {canCreate && (
          <button
            onClick={onNew}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
          >
            + New run
          </button>
        )}
      </div>

      {runs.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-16 text-center">
          <div className="text-5xl mb-4">🎯</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No runs yet</h3>
          <p className="text-gray-400 text-sm mb-6 max-w-sm mx-auto">
            Start a Gauntlet run to fire {' '}
            <strong>adversarial probes</strong> at your LLM provider and discover what bypasses your guardrails.
          </p>
          {canCreate && (
            <button
              onClick={onNew}
              className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700"
            >
              Start first run
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map(run => (
            <div
              key={run.id}
              onClick={() => onSelect(run)}
              className="bg-white border border-gray-200 rounded-xl px-5 py-4 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-4">
                <ScoreGauge blocked={run.blocked} total={run.total_probes} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-900 truncate">{run.name}</span>
                    <StatusPill status={run.status} />
                  </div>
                  <div className="text-xs text-gray-400 flex items-center gap-3">
                    <span>Provider: {run.provider}</span>
                    {run.total_probes > 0 && (
                      <>
                        <span>·</span>
                        <span className="text-green-600 font-medium">{run.blocked} blocked</span>
                        {run.escaped > 0 && (
                          <><span>·</span><span className="text-red-600 font-medium">{run.escaped} escaped</span></>
                        )}
                      </>
                    )}
                    <span>·</span>
                    <span>{new Date(run.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="text-gray-300 text-lg">›</div>
              </div>
              {run.status === 'running' && (
                <div className="mt-3">
                  <ProgressBar
                    value={run.blocked + run.escaped + run.errored}
                    max={run.total_probes}
                    color="bg-indigo-500"
                  />
                  <div className="text-xs text-gray-400 mt-1">
                    {run.blocked + run.escaped + run.errored} / {run.total_probes} probes completed
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Gauntlet() {
  const { currentOrg, user } = useAuth();
  const orgId = currentOrg?.org_id;

  const [view, setView] = useState('list'); // list | detail
  const [selectedRun, setSelectedRun] = useState(null);
  const [runs, setRuns] = useState([]);
  const [categories, setCategories] = useState([]);
  const [providers, setProviders] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const canCreate = ['developer', 'administrator'].includes(currentOrg?.role);

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      const [{ runs: r }, cats, provs] = await Promise.all([
        gauntletApi.runs(orgId),
        gauntletApi.categories(orgId),
        orgApi.providers(orgId),
      ]);
      setRuns(r || []);
      setCategories(cats || []);
      setProviders(provs || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load Gauntlet data');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  // Poll list while any run is running
  useEffect(() => {
    const hasRunning = runs.some(r => r.status === 'running');
    if (!hasRunning) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [runs, load]);

  async function handleCreate(data) {
    const run = await gauntletApi.createRun(orgId, data);
    await load();
    return run;
  }

  function handleModalClose(run) {
    setShowModal(false);
    if (run) {
      setSelectedRun(run);
      setView('detail');
    }
  }

  function handleSelect(run) {
    setSelectedRun(run);
    setView('detail');
  }

  function handleBack() {
    setSelectedRun(null);
    setView('list');
    load(); // refresh list
  }

  if (!orgId) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-sm">Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      {providers.length === 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
          ⚠️ No provider configured. Go to <strong>Integrations</strong> and connect an LLM provider before running Gauntlet.
        </div>
      )}

      {view === 'list' ? (
        <RunsList runs={runs} onSelect={handleSelect} onNew={() => setShowModal(true)} canCreate={canCreate} />
      ) : (
        <RunDetail run={selectedRun} orgId={orgId} onBack={handleBack} />
      )}

      {showModal && (
        <NewRunModal
          providers={providers}
          categories={categories}
          onClose={handleModalClose}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
