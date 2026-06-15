import { useState } from 'react';
import { Plus, Trash2, Check, Zap, Trash } from 'lucide-react';
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
      <div className="text-[11px] text-cream-50/55 leading-relaxed">
        配置 LLM Provider。当前为「模拟模式」时，Agent 行为由本地模板生成；填入 API Key 后自动启用真实 LLM 调用（本期默认仍以 Mock 形式呈现演示效果）。
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
          <div className="text-[10px] tracking-widest2 uppercase text-cream-50/45">
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
                    ? 'bg-gold-300 text-ink-900'
                    : 'bg-white/[0.04] text-cream-50/65 border border-white/8 hover:bg-white/[0.08]'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="w-full bg-ink-800 border border-white/10 rounded px-2 py-1.5 text-sm text-cream-50 outline-none focus:border-gold-300/30"
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
  const isMock = p.id === 'mock';

  return (
    <li className={`glass rounded-xl p-3 ${active ? 'border-gold-300/35' : ''}`}>
      <div className="flex items-center gap-2">
        <button
          onClick={onActivate}
          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors
            ${active ? 'border-gold-300 bg-gold-300/20' : 'border-white/20 hover:border-white/40'}`}
        >
          {active && <div className="w-1.5 h-1.5 rounded-full bg-gold-300" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-sm text-cream-50 truncate">
              {p.label}
            </span>
            {isMock && <Chip tone="gold" size="sm">Mock</Chip>}
            {p.enabled && !isMock && <Chip tone="cyan" size="sm">Active</Chip>}
          </div>
          <div className="text-[10px] text-cream-50/40 tracking-widish uppercase mt-0.5 truncate font-mono">
            {p.baseUrl || '— local mock —'} · {p.model}
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] tracking-widish uppercase text-cream-50/45 hover:text-cream-50/80 transition-colors"
        >
          {expanded ? '收起' : '配置'}
        </button>
        {!isMock && (
          <button
            onClick={onRemove}
            className="p-1 rounded hover:bg-rose-400/15 text-rose-300/70 hover:text-rose-300"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 pt-3 border-t border-white/8">
          <Field label="显示名称">
            <input
              value={p.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              disabled={isMock}
              className="w-full bg-ink-800 border border-white/10 rounded px-2 py-1.5 text-xs text-cream-50 outline-none focus:border-gold-300/30 disabled:opacity-50"
            />
          </Field>
          <Field label="Base URL">
            <input
              value={p.baseUrl}
              onChange={(e) => onUpdate({ baseUrl: e.target.value })}
              disabled={isMock}
              placeholder="https://api.openai.com/v1"
              className="w-full bg-ink-800 border border-white/10 rounded px-2 py-1.5 text-xs text-cream-50 font-mono outline-none focus:border-gold-300/30 disabled:opacity-50"
            />
          </Field>
          <Field label="API Key">
            <input
              type="password"
              value={p.apiKey}
              onChange={(e) => onUpdate({ apiKey: e.target.value })}
              disabled={isMock}
              placeholder="sk-..."
              className="w-full bg-ink-800 border border-white/10 rounded px-2 py-1.5 text-xs text-cream-50 font-mono outline-none focus:border-gold-300/30 disabled:opacity-50"
            />
          </Field>
          <Field label="Model">
            <input
              value={p.model}
              onChange={(e) => onUpdate({ model: e.target.value })}
              disabled={isMock}
              className="w-full bg-ink-800 border border-white/10 rounded px-2 py-1.5 text-xs text-cream-50 font-mono outline-none focus:border-gold-300/30 disabled:opacity-50"
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
                className="w-full bg-ink-800 border border-white/10 rounded px-2 py-1.5 text-xs text-cream-50 font-mono outline-none focus:border-gold-300/30 disabled:opacity-50"
              />
            </Field>
            <Field label="Max Tokens">
              <input
                type="number"
                value={p.maxTokens}
                onChange={(e) => onUpdate({ maxTokens: parseInt(e.target.value) })}
                disabled={isMock}
                className="w-full bg-ink-800 border border-white/10 rounded px-2 py-1.5 text-xs text-cream-50 font-mono outline-none focus:border-gold-300/30 disabled:opacity-50"
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-cream-50/65 cursor-pointer">
            <input
              type="checkbox"
              checked={p.enableSearch}
              onChange={(e) => onUpdate({ enableSearch: e.target.checked })}
              disabled={isMock}
              className="accent-gold-300"
            />
            允许该模型启用网络搜索（消耗 Token）
          </label>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" variant="subtle" icon={<Zap size={12} />}>
              测试连接
            </Button>
            <span className="text-[10px] text-cream-50/30 tracking-widish">
              {isMock ? '当前为本地模拟，无需联网' : '将在后台发起一次 ping 请求'}
            </span>
          </div>
        </div>
      )}
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] tracking-widest2 uppercase text-cream-50/45 mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}
