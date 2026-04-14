import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useAuth } from '../../context/AuthContext';
import { orgApi } from '../../services/api';
import { Card, Btn, Input, Toggle, Alert, PageHeader, Spinner } from '../../components/UI';

// ── Provider catalogue ─────────────────────────────────────────────────────────
// openaiCompat: true  → backend uses OpenAI messages format
// keyRequired: false  → API key field is optional (e.g. Ollama)
// notes: string       → shown as info callout in the edit form
// comingSoon: true    → shown greyed-out, configuration not available yet
// tier: string        → groups providers in the UI
const PROVIDERS = [
  // ── Major cloud ─────────────────────────────────────────────────────────────
  {
    id: 'anthropic', label: 'Anthropic Claude', icon: '🤖', color: '#D85A30',
    tier: 'Major cloud providers',
    models: ['claude-opus-4-5','claude-sonnet-4-20250514','claude-3-7-sonnet-20250219','claude-haiku-4-5-20251001','claude-3-5-sonnet-20241022','claude-3-5-haiku-20241022','claude-3-opus-20240229'],
    defaultUrl: 'https://api.anthropic.com/v1/messages',
  },
  {
    id: 'openai', label: 'OpenAI', icon: '✦', color: '#10a37f',
    tier: 'Major cloud providers',
    models: ['gpt-4o','gpt-4o-mini','gpt-4.1','gpt-4.1-mini','gpt-4-turbo','gpt-4','o3','o3-mini','o1','o1-mini','gpt-3.5-turbo'],
    defaultUrl: 'https://api.openai.com/v1/chat/completions',
    openaiCompat: true,
  },
  {
    id: 'azure', label: 'Azure OpenAI', icon: '☁', color: '#0078D4',
    tier: 'Major cloud providers',
    models: ['gpt-4o','gpt-4o-mini','gpt-4','gpt-35-turbo'],
    defaultUrl: 'https://{resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version=2024-02-01',
    openaiCompat: true,
    notes: 'Replace {resource} with your Azure resource name and {deployment} with your deployment name in the Endpoint URL.',
  },
  {
    id: 'gemini', label: 'Google Gemini', icon: '✦', color: '#4285F4',
    tier: 'Major cloud providers',
    models: ['gemini-2.5-pro-preview-03-25','gemini-2.0-flash','gemini-2.0-flash-lite','gemini-1.5-pro','gemini-1.5-flash','gemini-1.5-flash-8b'],
    defaultUrl: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
    notes: 'The {model} placeholder in the Endpoint URL is filled automatically from the Model field.',
  },
  {
    id: 'vertex', label: 'Google Vertex AI', icon: '◈', color: '#34A853',
    tier: 'Major cloud providers',
    models: ['gemini-2.5-pro-preview-03-25','gemini-2.0-flash-001','gemini-1.5-pro-002','gemini-1.5-flash-002'],
    defaultUrl: '',
    comingSoon: true,
    notes: 'Vertex AI with service account authentication is coming soon.',
  },
  {
    id: 'bedrock', label: 'AWS Bedrock', icon: '☁', color: '#FF9900',
    tier: 'Major cloud providers',
    models: ['anthropic.claude-3-5-sonnet-20241022-v2:0','anthropic.claude-3-haiku-20240307-v1:0','meta.llama3-70b-instruct-v1:0','meta.llama3-8b-instruct-v1:0','amazon.titan-text-express-v1','mistral.mixtral-8x7b-instruct-v0:1','amazon.nova-lite-v1:0'],
    defaultUrl: '',
    notes: 'Enter credentials as ACCESS_KEY_ID|SECRET_ACCESS_KEY|REGION (pipe-separated) in the API Key field. Example: AKIAIOSFODNN7|wJalrXUtn/K7MDENG|us-east-1',
  },

  // ── Fast inference ───────────────────────────────────────────────────────────
  {
    id: 'groq', label: 'Groq', icon: '⚡', color: '#F55036',
    tier: 'Fast inference',
    models: ['llama-3.3-70b-versatile','llama-3.1-8b-instant','llama-3.2-90b-vision-preview','mixtral-8x7b-32768','gemma2-9b-it','qwen-qwq-32b','deepseek-r1-distill-llama-70b'],
    defaultUrl: 'https://api.groq.com/openai/v1/chat/completions',
    openaiCompat: true,
  },
  {
    id: 'mistral', label: 'Mistral AI', icon: 'M', color: '#FF7000',
    tier: 'Fast inference',
    models: ['mistral-large-latest','mistral-medium-latest','mistral-small-latest','codestral-latest','open-mistral-7b','open-mixtral-8x7b','open-mixtral-8x22b'],
    defaultUrl: 'https://api.mistral.ai/v1/chat/completions',
    openaiCompat: true,
  },
  {
    id: 'deepseek', label: 'DeepSeek', icon: '🐋', color: '#4D6BFE',
    tier: 'Fast inference',
    models: ['deepseek-chat','deepseek-reasoner'],
    defaultUrl: 'https://api.deepseek.com/v1/chat/completions',
    openaiCompat: true,
  },
  {
    id: 'xai', label: 'xAI / Grok', icon: '𝕏', color: '#333333',
    tier: 'Fast inference',
    models: ['grok-3','grok-3-fast','grok-3-mini','grok-2-1212','grok-2-vision-1212','grok-beta'],
    defaultUrl: 'https://api.x.ai/v1/chat/completions',
    openaiCompat: true,
  },
  {
    id: 'perplexity', label: 'Perplexity AI', icon: '◉', color: '#20808D',
    tier: 'Fast inference',
    models: ['sonar-pro','sonar','sonar-reasoning-pro','sonar-reasoning','sonar-deep-research','r1-1776'],
    defaultUrl: 'https://api.perplexity.ai/chat/completions',
    openaiCompat: true,
  },
  {
    id: 'cerebras', label: 'Cerebras', icon: '⚡', color: '#E5322D',
    tier: 'Fast inference',
    models: ['llama-4-scout-17b-16e-instruct','llama-3.3-70b','llama-3.1-8b','llama3.1-70b','llama3.1-8b','qwen-3-32b'],
    defaultUrl: 'https://api.cerebras.ai/v1/chat/completions',
    openaiCompat: true,
    notes: 'Cerebras runs on dedicated AI hardware delivering ultra-low latency inference. Get your API key at cloud.cerebras.ai.',
  },
  {
    id: 'sambanova', label: 'SambaNova Cloud', icon: 'SN', color: '#EE3E23',
    tier: 'Fast inference',
    models: ['Meta-Llama-3.3-70B-Instruct','Meta-Llama-3.1-405B-Instruct','Meta-Llama-3.1-70B-Instruct','Qwen2.5-72B-Instruct','DeepSeek-R1','DeepSeek-V3-0324','Llama-4-Scout-17B-16E-Instruct'],
    defaultUrl: 'https://api.sambanova.ai/v1/chat/completions',
    openaiCompat: true,
    notes: 'SambaNova runs on custom RDU hardware with high throughput for large models. Get your API key at cloud.sambanova.ai.',
  },

  // ── Cloud inference platforms ─────────────────────────────────────────────
  {
    id: 'together', label: 'Together AI', icon: '⊕', color: '#4B6FEE',
    tier: 'Cloud inference platforms',
    models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo','meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo','mistralai/Mixtral-8x7B-Instruct-v0.1','Qwen/Qwen2.5-72B-Instruct-Turbo','deepseek-ai/DeepSeek-V3','google/gemma-2-27b-it'],
    defaultUrl: 'https://api.together.xyz/v1/chat/completions',
    openaiCompat: true,
  },
  {
    id: 'fireworks', label: 'Fireworks AI', icon: '🔥', color: '#FF6B00',
    tier: 'Cloud inference platforms',
    models: ['accounts/fireworks/models/llama-v3p3-70b-instruct','accounts/fireworks/models/llama-v3p1-8b-instruct','accounts/fireworks/models/mixtral-8x22b-instruct','accounts/fireworks/models/qwen2p5-72b-instruct','accounts/fireworks/models/deepseek-v3','accounts/fireworks/models/phi-3-vision-128k-instruct'],
    defaultUrl: 'https://api.fireworks.ai/inference/v1/chat/completions',
    openaiCompat: true,
  },
  {
    id: 'openrouter', label: 'OpenRouter', icon: '🔀', color: '#6B46C1',
    tier: 'Cloud inference platforms',
    models: ['openai/gpt-4o','anthropic/claude-3.5-sonnet','google/gemini-2.0-flash-001','meta-llama/llama-3.3-70b-instruct','deepseek/deepseek-r1','qwen/qwen-2.5-72b-instruct','mistralai/mixtral-8x7b-instruct'],
    defaultUrl: 'https://openrouter.ai/api/v1/chat/completions',
    openaiCompat: true,
    notes: 'OpenRouter provides unified access to 300+ models from all major providers. Get your API key at openrouter.ai. Model names follow the pattern provider/model-name.',
  },
  {
    id: 'aimlapi', label: 'AI/ML API', icon: '◎', color: '#009688',
    tier: 'Cloud inference platforms',
    models: ['gpt-4o','claude-3-5-sonnet-20241022','gemini-1.5-pro','meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo','mistralai/Mistral-7B-Instruct-v0.2'],
    defaultUrl: 'https://api.aimlapi.com/v1/chat/completions',
    openaiCompat: true,
    notes: 'AI/ML API provides OpenAI-compatible access to 300+ models. Use standard model names like gpt-4o, claude-3-5-sonnet-20241022, etc.',
  },
  {
    id: 'cohere', label: 'Cohere', icon: 'C', color: '#39594D',
    tier: 'Cloud inference platforms',
    models: ['command-r-plus-08-2024','command-r-08-2024','command-r-plus','command-r','command','command-light'],
    defaultUrl: 'https://api.cohere.com/v1/chat',
  },
  {
    id: 'ai21', label: 'AI21 Labs', icon: '21', color: '#5B2D8E',
    tier: 'Cloud inference platforms',
    models: ['jamba-1.5-large','jamba-1.5-mini','jamba-instruct'],
    defaultUrl: 'https://api.ai21.com/studio/v1/chat/completions',
    openaiCompat: true,
  },
  {
    id: 'github', label: 'GitHub Models', icon: '⬡', color: '#24292E',
    tier: 'Cloud inference platforms',
    models: ['openai/gpt-4o','openai/gpt-4o-mini','Phi-4','Phi-3.5-MoE-instruct','meta/Llama-3.3-70B-Instruct','Mistral-large-2411','Cohere-command-r-plus-08-2024'],
    defaultUrl: 'https://models.inference.ai.azure.com/chat/completions',
    openaiCompat: true,
    notes: 'GitHub Models provides free access to AI models via GitHub. Get your token at github.com/marketplace/models. Use your GitHub Personal Access Token as the API key.',
  },
  {
    id: 'replicate', label: 'Replicate', icon: '◐', color: '#000000',
    tier: 'Cloud inference platforms',
    models: ['meta/llama-3.3-70b-instruct','meta/meta-llama-3-8b-instruct','mistralai/mistral-7b-instruct-v0.2','google-deepmind/gemma-2-27b-it'],
    defaultUrl: 'https://api.replicate.com/v1/models/{model}/predictions',
    notes: 'Enter model as owner/model-name (e.g. meta/llama-3.3-70b-instruct). Get your API token at replicate.com.',
  },
  {
    id: 'nvidia', label: 'NVIDIA NIM', icon: '▣', color: '#76B900',
    tier: 'Cloud inference platforms',
    models: ['meta/llama-3.3-70b-instruct','meta/llama-4-scout-17b-16e-instruct','nvidia/llama-3.1-nemotron-70b-instruct','mistralai/mistral-7b-instruct-v0.3','google/gemma-2-27b-it','microsoft/phi-3.5-moe-instruct'],
    defaultUrl: 'https://integrate.api.nvidia.com/v1/chat/completions',
    openaiCompat: true,
    notes: 'NVIDIA NIM provides optimized inference on NVIDIA hardware. Get your API key at build.nvidia.com (free tier available). Model names follow the pattern owner/model-name.',
  },
  {
    id: 'llamaapi', label: 'Meta Llama API', icon: '🦙', color: '#0064E0',
    tier: 'Cloud inference platforms',
    models: ['Llama-4-Maverick-17B-128E-Instruct-FP8','Llama-4-Scout-17B-16E-Instruct','Llama-3.3-70B-Instruct','Llama-3.1-405B-Instruct-FP8','Llama-3.2-90B-Vision-Instruct'],
    defaultUrl: 'https://api.llama.com/v1/chat/completions',
    openaiCompat: true,
    notes: 'Official Meta Llama API. Get your API key at llama.com. Provides access to the latest Llama 4 and Llama 3.x models.',
  },
  {
    id: 'watsonx', label: 'IBM WatsonX', icon: 'IBM', color: '#1F70C1',
    tier: 'Cloud inference platforms',
    models: ['ibm/granite-3-8b-instruct','ibm/granite-3-2b-instruct','meta-llama/llama-3-3-70b-instruct','meta-llama/llama-3-2-11b-vision-instruct','mistralai/mistral-large'],
    defaultUrl: 'https://us-south.ml.cloud.ibm.com/ml/v1/text/chat?version=2024-05-01',
    openaiCompat: true,
    notes: 'IBM WatsonX AI. Enter your IBM Cloud IAM API key. Set the Endpoint URL region prefix (us-south, eu-de, au-syd, jp-tok) to match your resource location.',
  },

  // ── Self-hosted & local ───────────────────────────────────────────────────
  {
    id: 'ollama', label: 'Ollama (Local)', icon: '🦙', color: '#555555',
    tier: 'Self-hosted & local',
    models: ['llama3.2','llama3.3','llama3.1','mistral','codellama','phi4','qwen2.5','deepseek-r1','gemma3','nomic-embed-text'],
    defaultUrl: 'http://localhost:11434/v1/chat/completions',
    openaiCompat: true,
    keyRequired: false,
    notes: 'Ollama runs locally — no API key required. Ensure Ollama is running and pull your model first with `ollama pull <model>`. Update the Endpoint URL if Ollama is on a remote host.',
  },
  {
    id: 'huggingface', label: 'Hugging Face', icon: '🤗', color: '#FF9D00',
    tier: 'Self-hosted & local',
    models: [],
    defaultUrl: 'https://api-inference.huggingface.co/models/{model}/v1/chat/completions',
    openaiCompat: true,
    notes: 'Enter the model repo ID (e.g. mistralai/Mistral-7B-Instruct-v0.3) in the Model field — it is substituted into the Endpoint URL. Use your HF Access Token as the API key.',
  },
  {
    id: 'litellm', label: 'LiteLLM Proxy', icon: '↔', color: '#0EA5E9',
    tier: 'Self-hosted & local',
    models: [],
    defaultUrl: 'http://localhost:4000/v1/chat/completions',
    openaiCompat: true,
    notes: 'LiteLLM is an OpenAI-compatible proxy that supports 400+ models. Point the Endpoint URL to your LiteLLM proxy. Enter your LiteLLM API key if authentication is enabled.',
  },
  {
    id: 'vllm', label: 'vLLM', icon: 'vL', color: '#8B5CF6',
    tier: 'Self-hosted & local',
    models: [],
    defaultUrl: 'http://localhost:8000/v1/chat/completions',
    openaiCompat: true,
    keyRequired: false,
    notes: 'vLLM is a high-throughput LLM serving engine with PagedAttention. Start with `vllm serve <model>` and point the Endpoint URL to your server. Enter the model name as deployed (e.g. mistralai/Mistral-7B-Instruct-v0.3). API key is optional if your server has auth disabled.',
  },
  {
    id: 'localai', label: 'LocalAI', icon: '🏠', color: '#059669',
    tier: 'Self-hosted & local',
    models: [],
    defaultUrl: 'http://localhost:8080/v1/chat/completions',
    openaiCompat: true,
    keyRequired: false,
    notes: 'LocalAI is an OpenAI-compatible server for running GGUF, GPTQ, exl2 and other model formats locally. Compatible with llama.cpp, whisper, and more. No API key required by default.',
  },
  {
    id: 'cloudflare', label: 'Cloudflare AI', icon: '🌐', color: '#F48120',
    tier: 'Self-hosted & local',
    models: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast','@cf/meta/llama-3.1-8b-instruct','@cf/mistral/mistral-7b-instruct-v0.1','@cf/google/gemma-7b-it','@cf/deepseek-ai/deepseek-r1-distill-qwen-32b'],
    defaultUrl: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions',
    openaiCompat: true,
    notes: 'Replace {account_id} in the Endpoint URL with your Cloudflare Account ID (from the Cloudflare dashboard sidebar). Use a Cloudflare API Token with Workers AI permissions as the API key.',
  },
  {
    id: 'sagemaker', label: 'Amazon SageMaker', icon: '☁', color: '#232F3E',
    tier: 'Self-hosted & local',
    models: [],
    defaultUrl: '',
    comingSoon: true,
    notes: 'SageMaker endpoint support with AWS Signature V4 auth is coming soon.',
  },

  // ── Custom ────────────────────────────────────────────────────────────────
  {
    id: 'custom', label: 'Custom / Self-hosted', icon: '⚙', color: '#7F77DD',
    tier: 'Custom',
    models: [],
    defaultUrl: '',
    openaiCompat: true,
    notes: 'Works with any OpenAI-compatible endpoint: LM Studio, vLLM, LocalAI, llama.cpp server, Text Generation WebUI, TabbyAPI, and more. Set the Endpoint URL to your server\'s /v1/chat/completions path.',
  },
];

// ── Provider icon avatar ──────────────────────────────────────────────────────
function ProviderIcon({ p, size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 7,
      background: p.color + '20',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size < 24 ? 9 : size < 30 ? 11 : 13,
      fontWeight: 700, color: p.color, flexShrink: 0,
    }}>
      {p.icon || p.id.slice(0, 3).toUpperCase()}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Integrations() {
  const { loading: authLoading } = useAuth();
  const { currentOrg, can } = useOrg();
  const orgId = currentOrg?.org_id;
  const [connections, setConnections] = useState({});
  const [editing, setEditing]   = useState(null);
  const [draft, setDraft]       = useState({});
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');
  const [filter, setFilter]     = useState('');

  useEffect(() => {
    if (!orgId) return;
    orgApi.providers(orgId).then(list => {
      const map = {};
      list.forEach(p => { map[p.provider] = p; });
      setConnections(map);
    }).catch(() => {});
  }, [orgId]);

  const openEdit = (pid) => {
    const conn   = connections[pid] || {};
    const preset = PROVIDERS.find(p => p.id === pid);
    setDraft({
      provider:     pid,
      enabled:      conn.enabled ?? true,
      apiKey:       '',
      endpointUrl:  conn.endpoint_url  || preset?.defaultUrl || '',
      model:        conn.model         || preset?.models?.[0] || '',
      maxTokens:    conn.max_tokens    || 1000,
      systemPrompt: conn.system_prompt || 'You are a helpful assistant.',
    });
    setEditing(pid);
    setError(''); setSuccess('');
  };

  const save = async () => {
    if (!orgId) { setError('No organization selected — please refresh the page.'); return; }
    setSaving(true); setError('');
    try {
      const conn = await orgApi.upsertProvider(orgId, draft);
      setConnections(c => ({ ...c, [draft.provider]: conn }));
      setSuccess('Connection saved successfully');
      setEditing(null);
    } catch (err) { setError(err.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div>
        <PageHeader title="Integrations" description="Connect LLM providers and configure your downstream system." />
        <div style={{ display:'flex', justifyContent:'center', padding:'4rem' }}><Spinner size={28} /></div>
      </div>
    );
  }
  if (!orgId) {
    return (
      <div>
        <PageHeader title="Integrations" description="Connect LLM providers and configure your downstream system." />
        <div style={{ padding:'2rem', textAlign:'center', color:'var(--c-text2)', fontSize:13 }}>
          No organization found.{' '}
          <button onClick={() => window.location.reload()}
            style={{ color:'var(--c-purple)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline', fontSize:13 }}>
            Refresh the page
          </button>{' '}
          or log out and back in.
        </div>
      </div>
    );
  }

  // ── Edit screen ────────────────────────────────────────────────────────────
  if (editing) {
    const preset    = PROVIDERS.find(p => p.id === editing);
    const needsKey  = preset?.keyRequired !== false;

    return (
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:'1.5rem' }}>
          <Btn variant="ghost" onClick={() => setEditing(null)}>← Back</Btn>
          <ProviderIcon p={preset} size={28} />
          <h2 style={{ fontSize:15, fontWeight:500 }}>Configure {preset?.label}</h2>
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:12, color:'var(--c-text2)' }}>{draft.enabled ? 'Enabled' : 'Disabled'}</span>
            <Toggle checked={draft.enabled} onChange={() => setDraft(d => ({ ...d, enabled: !d.enabled }))} />
          </div>
        </div>

        {preset?.notes && (
          <div style={{ marginBottom:'1rem', padding:'10px 14px', borderRadius:'var(--radius)',
                        background:'#EEF2FF', border:'0.5px solid #A5B4FC', color:'#3730A3', fontSize:12, lineHeight:1.6 }}>
            ℹ️ {preset.notes}
          </div>
        )}

        <Card style={{ maxWidth:560 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <Alert type="error"   message={error} />
            <Alert type="success" message={success} />

            {needsKey ? (
              <Input
                label="API key"
                type="password"
                value={draft.apiKey}
                onChange={e => setDraft(d => ({ ...d, apiKey: e.target.value }))}
                placeholder="Leave blank to keep existing key"
              />
            ) : (
              <div style={{ padding:'10px 12px', borderRadius:'var(--radius)', background:'var(--c-bg2)',
                            border:'0.5px solid var(--c-border)', fontSize:12, color:'var(--c-text2)' }}>
                🔓 No API key required — this provider runs locally.
              </div>
            )}

            <Input
              label="Endpoint URL"
              value={draft.endpointUrl}
              onChange={e => setDraft(d => ({ ...d, endpointUrl: e.target.value }))}
            />

            {/* Model selector */}
            <div>
              <label style={{ fontSize:11, color:'var(--c-text2)', fontWeight:500,
                              textTransform:'uppercase', letterSpacing:'0.04em', display:'block', marginBottom:4 }}>
                Model
              </label>
              {preset?.models?.length > 0 ? (
                <>
                  <select
                    value={preset.models.includes(draft.model) ? draft.model : '__custom__'}
                    onChange={e => {
                      if (e.target.value !== '__custom__') setDraft(d => ({ ...d, model: e.target.value }));
                      else setDraft(d => ({ ...d, model: '' }));
                    }}
                    style={{ width:'100%', padding:'8px 10px', borderRadius:'var(--radius)',
                             border:'0.5px solid var(--c-border2)', background:'var(--c-bg)',
                             color:'var(--c-text)', fontSize:13 }}
                  >
                    {preset.models.map(m => <option key={m} value={m}>{m}</option>)}
                    <option value="__custom__">— enter custom model name —</option>
                  </select>
                  {!preset.models.includes(draft.model) && (
                    <Input
                      style={{ marginTop:6 }}
                      value={draft.model}
                      onChange={e => setDraft(d => ({ ...d, model: e.target.value }))}
                      placeholder="Enter model name"
                    />
                  )}
                </>
              ) : (
                <Input
                  value={draft.model}
                  onChange={e => setDraft(d => ({ ...d, model: e.target.value }))}
                  placeholder="e.g. mistralai/Mistral-7B-Instruct-v0.3"
                />
              )}
            </div>

            <Input
              label="Max tokens"
              type="number"
              value={draft.maxTokens}
              onChange={e => setDraft(d => ({ ...d, maxTokens: parseInt(e.target.value) || 1000 }))}
            />

            <div>
              <label style={{ fontSize:11, color:'var(--c-text2)', fontWeight:500,
                              textTransform:'uppercase', letterSpacing:'0.04em', display:'block', marginBottom:4 }}>
                System prompt
              </label>
              <textarea
                value={draft.systemPrompt}
                onChange={e => setDraft(d => ({ ...d, systemPrompt: e.target.value }))}
                rows={3}
                style={{ width:'100%', padding:'8px 10px', borderRadius:'var(--radius)',
                         border:'0.5px solid var(--c-border2)', background:'var(--c-bg)',
                         color:'var(--c-text)', fontSize:13, resize:'vertical', fontFamily:'inherit', boxSizing:'border-box' }}
              />
            </div>

            <div style={{ display:'flex', gap:8 }}>
              <Btn onClick={save} loading={saving}>Save connection</Btn>
              <Btn variant="secondary" onClick={() => setEditing(null)}>Cancel</Btn>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // ── Provider grid ──────────────────────────────────────────────────────────
  const activeCount = PROVIDERS.filter(p => connections[p.id]?.enabled).length;
  const q = filter.toLowerCase();
  const filtered = q ? PROVIDERS.filter(p => p.label.toLowerCase().includes(q) || p.id.includes(q)) : PROVIDERS;

  // Group by tier
  const tiers = [
    'Major cloud providers',
    'Fast inference',
    'Cloud inference platforms',
    'Self-hosted & local',
    'Custom',
  ];
  // also include any tier that appears in filtered but not in the static list (future-proof)
  const extraTiers = filtered.map(p => p.tier).filter(t => !tiers.includes(t));
  const allTiers = [...tiers, ...new Set(extraTiers)];

  return (
    <div>
      <PageHeader title="Integrations" description="Connect LLM providers and configure your downstream system." />
      <Alert type="success" message={success} />

      {/* Summary strip */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:'1.25rem' }}>
        <span style={{ fontSize:12, color:'var(--c-text2)' }}>
          <strong style={{ color:'var(--c-text)' }}>{activeCount}</strong> of {PROVIDERS.filter(p => !p.comingSoon).length} providers connected
        </span>
        <input
          type="search"
          placeholder="Filter providers…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ marginLeft:'auto', padding:'6px 10px', borderRadius:'var(--radius)',
                   border:'0.5px solid var(--c-border2)', background:'var(--c-bg)',
                   color:'var(--c-text)', fontSize:12, width:190, outline:'none' }}
        />
      </div>

      {/* Tiered sections */}
      {allTiers.map(tier => {
        const group = filtered.filter(p => p.tier === tier);
        if (!group.length) return null;
        return (
          <div key={tier} style={{ marginBottom:'1.75rem' }}>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--c-text3)',
                          textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:7 }}>
              {tier}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(255px, 1fr))', gap:8 }}>
              {group.map(p => {
                const conn   = connections[p.id];
                const active = conn?.enabled;
                return (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 11,
                    padding: '11px 13px', borderRadius: 'var(--radius)',
                    background: 'var(--c-bg)',
                    border: active ? `0.5px solid ${p.color}55` : '0.5px solid var(--c-border)',
                    opacity: p.comingSoon ? 0.5 : 1,
                    transition: 'border-color 0.15s',
                  }}>
                    <ProviderIcon p={p} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:500, display:'flex', alignItems:'center', gap:5 }}>
                        {p.label}
                        {p.comingSoon && (
                          <span style={{ fontSize:9, padding:'1px 5px', borderRadius:3,
                                         background:'var(--c-bg2)', color:'var(--c-text3)',
                                         border:'0.5px solid var(--c-border)', fontWeight:500, letterSpacing:'0.03em' }}>
                            SOON
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize:11, color:'var(--c-text2)', marginTop:1,
                                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {active ? (conn.model || 'Connected') : p.comingSoon ? 'Coming soon' : 'Not connected'}
                      </div>
                    </div>

                    {active && (
                      <span style={{ fontSize:10, padding:'2px 6px', borderRadius:4, flexShrink:0,
                                     background:'var(--c-green)18', color:'var(--c-green)',
                                     border:'0.5px solid var(--c-green)44' }}>
                        Active
                      </span>
                    )}
                    {can('developer') && !p.comingSoon && (
                      <Btn size="sm" variant="secondary" onClick={() => openEdit(p.id)}>
                        {conn ? 'Edit' : 'Connect'}
                      </Btn>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
