import { useState, useRef, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import { promptApi, configApi } from '../../services/api';
import { MetricCard, Badge, Toggle, Alert, Btn } from '../../components/UI';

const PROVIDER_COLORS = { anthropic:'#D85A30', openai:'#10a37f', azure:'#0078D4', gemini:'#4285F4', mistral:'#FF7000', cohere:'#39594D', custom:'#7F77DD' };

export default function Playground() {
  const { currentOrg, orgDetail } = useOrg();
  const orgId = currentOrg?.org_id;

  const [providers, setProviders] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [activeProvider, setActiveProvider] = useState('anthropic');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const outputRef = useRef(null);

  useEffect(() => {
    if (!orgId) return;
    configApi.templates(orgId).then(setTemplates).catch(() => {});
    promptApi.audit(orgId, { limit: 1 }).then(data => {}).catch(() => {});
    // Load providers
    import('../../services/api').then(({ orgApi }) => {
      orgApi.providers(orgId).then(p => {
        setProviders(p.filter(pr => pr.enabled));
        if (p[0]) setActiveProvider(p[0].provider);
      }).catch(() => {});
    });
  }, [orgId]);

  useEffect(() => { if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight; }, [output]);

  const run = async () => {
    if (!input.trim() || loading || !orgId) return;
    setLoading(true); setOutput(''); setResult(null); setError('');
    try {
      const data = await promptApi.run(orgId, { prompt: input, provider: activeProvider });
      setOutput(data.output);
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Request failed');
    } finally { setLoading(false); }
  };

  const favTemplates = templates.filter(t => t.is_favorite).slice(0, 5);

  return (
    <div>
      <div style={{ marginBottom:'1.25rem' }}>
        <h2 style={{ fontSize:16, fontWeight:500, marginBottom:3 }}>Playground</h2>
        <p style={{ fontSize:12, color:'var(--c-text2)' }}>Test prompts through your configured guardrail pipeline.</p>
      </div>

      {/* Provider selector */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, flexWrap:'wrap' }}>
        <span style={{ fontSize:12, color:'var(--c-text2)' }}>Provider:</span>
        {providers.length === 0 && <span style={{ fontSize:12, color:'var(--c-text3)' }}>No providers connected — go to Integrations</span>}
        {providers.map(p => (
          <button key={p.provider} onClick={() => setActiveProvider(p.provider)}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:'var(--radius)', fontSize:12, cursor:'pointer',
              background: activeProvider === p.provider ? 'var(--c-bg2)' : 'transparent',
              border: activeProvider === p.provider ? '0.5px solid var(--c-border2)' : '0.5px solid var(--c-border)',
              color:'var(--c-text)' }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background: PROVIDER_COLORS[p.provider] || '#888', flexShrink:0 }} />
            {p.provider}
          </button>
        ))}
      </div>

      {/* Favourite templates */}
      {favTemplates.length > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10, flexWrap:'wrap' }}>
          <span style={{ fontSize:11, color:'var(--c-text3)' }}>Quick insert:</span>
          {favTemplates.map(t => (
            <button key={t.id} onClick={() => setInput(t.prompt)}
              style={{ fontSize:11, padding:'3px 9px', borderRadius:'var(--radius)', background:'var(--c-bg2)', border:'0.5px solid var(--c-border)', color:'var(--c-text2)', cursor:'pointer' }}>
              {t.name}
            </button>
          ))}
        </div>
      )}

      {/* IO panels */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
        <div>
          <div style={{ fontSize:11, color:'var(--c-text2)', marginBottom:5, fontWeight:500, textTransform:'uppercase', letterSpacing:'0.04em' }}>Input</div>
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run(); }}
            placeholder="Enter prompt… (Ctrl+Enter to run)"
            style={{ width:'100%', height:180, resize:'vertical', boxSizing:'border-box', fontSize:13, padding:'10px 12px',
              borderRadius:'var(--radius)', border: result?.inputFlags?.length ? '1px solid var(--c-red)' : '0.5px solid var(--c-border2)',
              background:'var(--c-bg)', color:'var(--c-text)', outline:'none', fontFamily:'inherit', lineHeight:1.6 }} />
          {result?.inputFlags?.length > 0 && (
            <div style={{ display:'flex', gap:4, marginTop:4, flexWrap:'wrap' }}>
              {result.inputFlags.map(f => <Badge key={f} text={'⊗ ' + f} color="var(--c-red)" />)}
            </div>
          )}
        </div>
        <div>
          <div style={{ fontSize:11, color:'var(--c-text2)', marginBottom:5, fontWeight:500, textTransform:'uppercase', letterSpacing:'0.04em',
            display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span>Output</span>
            {result && <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0 }}>{result.latency}ms · {result.tokens}t · via {result.route}</span>}
          </div>
          <div ref={outputRef} style={{ height:180, overflowY:'auto', fontSize:13, padding:'10px 12px', borderRadius:'var(--radius)',
            border: result?.outputFlags?.length ? '1px solid var(--c-amber)' : '0.5px solid var(--c-border)',
            background:'var(--c-bg2)', color: output ? 'var(--c-text)' : 'var(--c-text3)', whiteSpace:'pre-wrap', lineHeight:1.6 }}>
            {loading && !output ? 'Processing…' : output || 'Response will appear here'}
          </div>
          {result?.outputFlags?.length > 0 && (
            <div style={{ display:'flex', gap:4, marginTop:4, flexWrap:'wrap' }}>
              {result.outputFlags.map(f => <Badge key={f} text={'⚠ ' + f} color="var(--c-amber)" />)}
            </div>
          )}
        </div>
      </div>

      <Alert type="error" message={error} />

      <div style={{ display:'flex', gap:8, alignItems:'center', marginTop: error ? 10 : 0 }}>
        <Btn onClick={run} disabled={!input.trim() || providers.length === 0} loading={loading}>
          Run prompt
        </Btn>
        <span style={{ fontSize:11, color:'var(--c-text3)' }}>Ctrl+Enter</span>
        {result && (
          <span style={{ marginLeft:'auto', fontSize:11, padding:'3px 8px', borderRadius:'var(--radius)',
            background: result.passed ? 'var(--c-green)18' : 'var(--c-red)18',
            color: result.passed ? 'var(--c-green)' : 'var(--c-red)',
            border: `0.5px solid ${result.passed ? 'var(--c-green)' : 'var(--c-red)'}44` }}>
            {result.passed ? '✓ Passed all guardrails' : '✗ Guardrail triggered'}
          </span>
        )}
      </div>
    </div>
  );
}
