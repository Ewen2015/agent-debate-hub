import { useState } from 'react';
import { Plus, Trash2, Zap, Loader2, Check, X as XIcon } from 'lucide-react';
import { useGatewayStore } from '@/store/staticStores';
import { Button } from '@/components/shared/Button';
import { Chip } from '@/components/shared/Chip';
import type { ProviderConfig, ProviderTemplate } from '@/types';

const TEMPLATES: { id: ProviderTemplate; label: string; baseUrl: string; model: string }[] = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-5-sonnet' },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'moonshot', label: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-32k' },
  { id: 'ollama', label: 'Ollama (本地)', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' },
  { id: 'custom', label: '自定义 OpenAI 兼容端点', baseUrl: '', model: '' },
];

type TestStatus =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'ok'; latency: number; modelEcho?: string }
  | { kind: 'fail'; reason: string };

export function GatewayPanel() {
  const providers = useGatewayStore((s) => s.providers);
  const activeId = useGatewayStore((s) => s.activeProviderId);
  const addProvider = useGatewayStore((s) => s.addProvider);
  const updateProvider = useGatewayStore((s) => s.updateProvider);
  const removeProvider = useGatewayStore((s) => s.removeProvider);
  const setActive = useGatewayStore((s) => s.setActive);
  const reset = useGatewayStore((s) => s.reset);

  const [showAdd, setShowAdd] = useState(false);
  const [newTpl, setNewTpl] = useState<ProviderTemplate>('openai');
  const [newLabel, setNewLabel] = useState('OpenAI');

  const handleAdd = () => {
    const tpl = TEMPLATES.find((t) => t.id === newTpl)!;
    const id = addProvider({
      label: newLabel.trim() || tpl.label,
      baseUrl: tpl.baseUrl,
      model: tpl.model,
    });
    setActive(id);
    setShowAdd(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="text-[11px] text-[var(--text-soft)] leading-relaxed">
        配置 LLM Provider。当前为「模拟模式」时，Agent 行为由本地模板生成；填入 API Key 后点击「测试连接」可立即验证端点可达性与凭据有效性。
      </div>

      <div className="divider-x" />

      <ul className="space-y-2.5">
        {providers.map((p) => (
          <ProviderCard
            key={p.id}
            p={p}
            active={p.id === activeId}
            onActivate={() => setActive(p.id)}
            onUpdate={(patch) => updateProvider(p.id, patch)}
            onRemove={() => removeProvider(p.id)}
          />
        ))}
      </ul>

      {!showAdd ? (
        <Button
          variant="secondary"
          size="sm"
          icon={<Plus size={13} />}
          onClick={() => setShowAdd(true)}
          fullWidth
        >
          添加 Provider
        </Button>
      ) : (
        <div className="glass rounded-xl p-3 space-y-2.5">
          <div className="text-[10px] tracking-widest2 uppercase text-[var(--text-muted)]">
            New Provider
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setNewTpl(t.id);
                  setNewLabel(t.label);
                }}
                className={`rounded-md px-2 py-1.5 text-[10px] uppercase tracking-widish transition-colors
                  ${newTpl === t.id
                    ? 'bg-[var(--accent-gold)] text-[var(--bg-elev)]'
                    : 'bg-[var(--bg-card)] text-[var(--text-soft)] border border-[var(--border-soft)] hover:bg-[var(--bg-card-strong)]'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="w-full bg-[var(--bg-soft)] border border-[var(--border-soft)] rounded px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-gold)]"
            placeholder="显示名称"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={handleAdd}>创建</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>取消</Button>
          </div>
        </div>
      )}

      <div className="divider-x" />

      <Button
        variant="ghost"
        size="sm"
        onClick={reset}
        fullWidth
      >
        重置为模拟模式
      </Button>
    </div>
  );
}

async function testConnection(p: ProviderConfig): Promise<TestStatus> {
  if (p.id === 'mock') {
    await new Promise((res) => setTimeout(res, 350));
    return { kind: 'ok', latency: 0, modelEcho: 'mock-debate-v1' };
  }
  if (!p.baseUrl) {
    return { kind: 'fail', reason: 'Base URL 为空' };
  }
  if (!p.apiKey) {
    return { kind: 'fail', reason: 'API Key 为空' };
  }
  const url = p.baseUrl.replace(/\/+$/, '') + '/models';
  const start = performance.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${p.apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const latency = Math.round(performance.now() - start);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        kind: 'fail',
        reason: `HTTP ${res.status}${body ? ` · ${body.slice(0, 80)}` : ''}`,
      };
    }
    return { kind: 'ok', latency };
  } catch (e: any) {
    return {
      kind: 'fail',
      reason: e?.name === 'AbortError' ? '连接超时（8s）' : (e?.message || '网络错误'),
    };
  }
}

function ProviderCard({
  p,
  active,
  onActivate,
  onUpdate,
  onRemove,
}: {
  p: ProviderConfig;
  active: boolean;
  onActivate: () => void;
  onUpdate: (patch: Partial<ProviderConfig>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>({ kind: 'idle' });
  const isMock = p.id === 'mock';

  const handleTest = async () => {
    setTestStatus({ kind: 'running' });
    const result = await testConnection(p);
    setTestStatus(result);
  };

  return (
    <li className={`glass rounded-xl p-3 ${active ? 'border-[var(--border-strong)]' : ''}`}>
      <div className="flex items-center gap-2">
        <button
          onClick={onActivate}
          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors
            ${active ? 'border-[var(--accent-gold)] bg-[var(--accent-gold)]/20' : 'border-[var(--border-soft)] hover:border-[var(--text-muted)]'}`}
        >
          {active && <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-gold)]" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-sm text-[var(--text-primary)] truncate">
              {p.label}
            </span>
            {isMock && <Chip tone="gold" size="sm">Mock</Chip>}
            {p.enabled && !isMock && <Chip tone="cyan" size="sm">Active</Chip>}
          </div>
          <div className="text-[10px] text-[var(--text-muted)] tracking-widish uppercase mt-0.5 truncate font-mono">
            {p.baseUrl || '— local mock —'} · {p.model}
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] tracking-widish uppercase text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          {expanded ? '收起' : '配置'}
        </button>
        {!isMock && (
          <button
            onClick={onRemove}
            className="p-1 rounded hover:bg-[var(--accent-rose)]/15 text-[var(--accent-rose)]/70 hover:text-[var(--accent-rose)]"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 pt-3 border-t border-[var(--border-soft)]">
          <Field label="显示名称">
            <input
              value={p.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              disabled={isMock}
              className="w-full bg-[var(--bg-soft)] border border-[var(--border-soft)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-gold)] disabled:opacity-50"
            />
          </Field>
          <Field label="Base URL">
            <input
              value={p.baseUrl}
              onChange={(e) => onUpdate({ baseUrl: e.target.value })}
              disabled={isMock}
              placeholder="https://api.openai.com/v1"
              className="w-full bg-[var(--bg-soft)] border border-[var(--border-soft)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] font-mono outline-none focus:border-[var(--accent-gold)] disabled:opacity-50"
            />
          </Field>
          <Field label="API Key">
            <input
              type="password"
              value={p.apiKey}
              onChange={(e) => onUpdate({ apiKey: e.target.value })}
              disabled={isMock}
              placeholder="sk-..."
              className="w-full bg-[var(--bg-soft)] border border-[var(--border-soft)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] font-mono outline-none focus:border-[var(--accent-gold)] disabled:opacity-50"
            />
          </Field>
          <Field label="Model">
            <input
              value={p.model}
              onChange={(e) => onUpdate({ model: e.target.value })}
              disabled={isMock}
              className="w-full bg-[var(--bg-soft)] border border-[var(--border-soft)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] font-mono outline-none focus:border-[var(--accent-gold)] disabled:opacity-50"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Temperature">
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={p.temperature}
                onChange={(e) => onUpdate({ temperature: parseFloat(e.target.value) })}
                disabled={isMock}
                className="w-full bg-[var(--bg-soft)] border border-[var(--border-soft)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] font-mono outline-none focus:border-[var(--accent-gold)] disabled:opacity-50"
              />
            </Field>
            <Field label="Max Tokens">
              <input
                type="number"
                value={p.maxTokens}
                onChange={(e) => onUpdate({ maxTokens: parseInt(e.target.value) })}
                disabled={isMock}
                className="w-full bg-[var(--bg-soft)] border border-[var(--border-soft)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] font-mono outline-none focus:border-[var(--accent-gold)] disabled:opacity-50"
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-[var(--text-soft)] cursor-pointer">
            <input
              type="checkbox"
              checked={p.enableSearch}
              onChange={(e) => onUpdate({ enableSearch: e.target.checked })}
              disabled={isMock}
              className="accent-[var(--accent-gold)]"
            />
            允许该模型启用网络搜索（消耗 Token）
          </label>
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <Button
              size="sm"
              variant="subtle"
              icon={
                testStatus.kind === 'running' ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Zap size={12} />
                )
              }
              onClick={handleTest}
              disabled={testStatus.kind === 'running'}
            >
              测试连接
            </Button>
            {testStatus.kind === 'ok' && (
              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--accent-cyan)]">
                <Check size={11} />
                连接成功 · {testStatus.latency}ms{testStatus.modelEcho ? ` · ${testStatus.modelEcho}` : ''}
              </span>
            )}
            {testStatus.kind === 'fail' && (
              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--accent-rose)]">
                <XIcon size={11} />
                {testStatus.reason}
              </span>
            )}
            {testStatus.kind === 'idle' && (
              <span className="text-[10px] text-[var(--text-muted)]">
                {isMock ? '当前为本地模拟，无需联网' : '发起一次 GET /models 请求验证凭据'}
              </span>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] tracking-widest2 uppercase text-[var(--text-muted)] mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}
