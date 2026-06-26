import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2, Edit3, Check, X } from 'lucide-react';
import { useRosterStore } from '@/store/staticStores';
import { PERSONAS, PERSONA_BY_ID } from '@/data/personas';
import { resolvePersona } from '@/engine/MockLLM';
import { Button } from '@/components/shared/Button';
import { Chip } from '@/components/shared/Chip';
import { AgentAvatar } from '@/components/shared/AgentAvatar';
import type { Persona } from '@/types';

export function RosterPanel() {
  const agents = useRosterStore((s) => s.agents);
  const setGroupSize = useRosterStore((s) => s.setGroupSize);
  const removeAgent = useRosterStore((s) => s.removeAgent);
  const setPersona = useRosterStore((s) => s.setPersona);
  const customizePersona = useRosterStore((s) => s.customizePersona);
  const addAgent = useRosterStore((s) => s.addAgent);
  const reset = useRosterStore((s) => s.reset);

  const [editing, setEditing] = useState<string | null>(null);
  const [showPersonaLib, setShowPersonaLib] = useState(false);

  const size = agents.length;

  return (
    <div className="flex flex-col gap-5">
      <section>
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] tracking-widest2 uppercase text-[var(--text-primary)]/45">
            Group Size
          </span>
          <span className="font-mono text-xs text-[var(--text-primary)]/60">{size} / 8</span>
        </div>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: 7 }).map((_, i) => {
            const n = i + 2;
            const active = n <= size;
            return (
              <button
                key={n}
                onClick={() => setGroupSize(n)}
                className={`flex-1 h-9 rounded-md text-xs font-mono transition-all
                  ${active
                    ? 'bg-gradient-to-b from-[var(--accent-primary)] to-[#5A4B2D] text-white shadow-[0_1px_0_0_rgba(255,255,255,0.18)_inset,0_10px_24px_-18px_rgba(26,26,26,0.24)]'
                    : 'bg-[var(--bg-card)] text-[var(--text-primary)]/40 border border-[var(--border-soft)] hover:bg-[var(--bg-card-strong)]'}`}
              >
                {n}
              </button>
            );
          })}
        </div>
      </section>

      <div className="divider-x" />

      <section>
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] tracking-widest2 uppercase text-[var(--text-primary)]/45">
            Active Roster
          </span>
          <button
            onClick={() => setShowPersonaLib(!showPersonaLib)}
            className="text-[10px] tracking-widish uppercase text-[var(--accent-primary)] hover:text-[var(--accent-primary)] transition-colors"
          >
            {showPersonaLib ? '收起' : '+ 人设库'}
          </button>
        </div>
        <ul className="space-y-2">
          {agents.map((agent, idx) => {
            const persona = resolvePersona(agent);
            const isEditing = editing === agent.id;
            return (
              <li
                key={agent.id}
                className="glass rounded-xl p-3 flex items-start gap-3 group"
              >
                <AgentAvatar agent={agent} size={44} showStatusRing={false} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isEditing ? (
                      <select
                        value={agent.personaId}
                        onChange={(e) => setPersona(agent.id, e.target.value)}
                        className="bg-[var(--bg-soft)] border border-[var(--border-soft)] rounded px-2 py-0.5 text-sm text-[var(--text-primary)] outline-none"
                      >
                        {PERSONAS.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="font-display text-sm text-[var(--text-primary)] truncate">
                        {persona.name}
                      </span>
                    )}
                    <Chip tone={persona.stance === 'pro' ? 'primary' : persona.stance === 'con' ? 'rose' : 'emerald'}>
                      {persona.stance === 'pro' ? '支持' : persona.stance === 'con' ? '反对' : '中立'}
                    </Chip>
                  </div>
                  <div className="text-[11px] text-[var(--text-primary)]/45 tracking-widish uppercase mt-0.5 truncate">
                    {persona.oneLiner}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {persona.focus.slice(0, 3).map((f) => (
                      <Chip key={f} tone="mute" size="sm">{f}</Chip>
                    ))}
                  </div>

                  {isEditing && (
                    <CustomizeForm
                      persona={persona}
                      onSave={(patch) => {
                        customizePersona(agent.id, patch);
                        setEditing(null);
                      }}
                      onCancel={() => setEditing(null)}
                    />
                  )}
                </div>
                <div className="flex flex-col gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setEditing(isEditing ? null : agent.id)}
                    className="p-1 rounded hover:bg-[var(--bg-card-strong)] text-[var(--text-primary)]/60"
                  >
                    {isEditing ? <Check size={12} /> : <Edit3 size={12} />}
                  </button>
                  <button
                    onClick={() => removeAgent(agent.id)}
                    disabled={agents.length <= 2}
                    className="p-1 rounded hover:bg-[var(--accent-rose)]/15 text-[var(--accent-rose)]/70 hover:text-[var(--accent-rose)] disabled:opacity-30"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {showPersonaLib && (
        <section>
          <div className="text-[10px] tracking-widest2 uppercase text-[var(--text-primary)]/45 mb-2.5">
            Persona Library
          </div>
          <div className="grid grid-cols-2 gap-2">
            {PERSONAS.map((p) => {
              const used = agents.some((a) => a.personaId === p.id);
              return (
                <motion.button
                  key={p.id}
                  whileHover={{ y: -2 }}
                  onClick={() => {
                    if (used) {
                      setPersona(agents[0].id, p.id);
                    } else {
                      addAgent(p.id);
                    }
                    setShowPersonaLib(false);
                  }}
                  className={`relative text-left rounded-lg p-2.5 border transition-colors
                    ${used
                      ? 'border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/8'
                      : 'border-[var(--border-soft)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-strong)]'}`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--text-primary)] text-xs font-display"
                      style={{ background: `linear-gradient(135deg, ${p.gradient[0]}, ${p.gradient[1]})` }}
                    >
                      {p.emoji}
                    </div>
                    <div className="min-w-0">
                      <div className="font-display text-xs text-[var(--text-primary)] truncate">
                        {p.name}
                      </div>
                      <div className="text-[10px] text-[var(--text-primary)]/40 truncate">
                        {p.oneLiner}
                      </div>
                    </div>
                  </div>
                  {used && (
                    <div className="absolute top-1.5 right-1.5 text-[var(--accent-primary)]">
                      <Check size={10} />
                    </div>
                  )}
                </motion.button>
              );
            })}
          </div>
        </section>
      )}

      <div className="divider-x" />

      <Button
        variant="ghost"
        size="sm"
        onClick={reset}
        fullWidth
      >
        重置为默认 2 人团
      </Button>
    </div>
  );
}

function CustomizeForm({
  persona,
  onSave,
  onCancel,
}: {
  persona: Persona;
  onSave: (patch: Partial<Persona>) => void;
  onCancel: () => void;
}) {
  const [oneLiner, setOneLiner] = useState(persona.oneLiner);
  const [description, setDescription] = useState(persona.description);
  const [tone, setTone] = useState(persona.tone);
  const [focus, setFocus] = useState(persona.focus.join('、'));
  const [stance, setStance] = useState(persona.stance);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="mt-3 space-y-2 overflow-hidden"
    >
      <textarea
        value={oneLiner}
        onChange={(e) => setOneLiner(e.target.value)}
        rows={1}
        className="w-full bg-[var(--bg-soft)] border border-[var(--border-soft)] rounded px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]/30"
        placeholder="一句话立场"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className="w-full bg-[var(--bg-soft)] border border-[var(--border-soft)] rounded px-2 py-1 text-xs text-[var(--text-primary)]/85 outline-none focus:border-[var(--accent-primary)]/30"
        placeholder="人设详细描述"
      />
      <input
        value={tone}
        onChange={(e) => setTone(e.target.value)}
        className="w-full bg-[var(--bg-soft)] border border-[var(--border-soft)] rounded px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]/30"
        placeholder="语气（用 · 分隔多个标签）"
      />
      <input
        value={focus}
        onChange={(e) => setFocus(e.target.value)}
        className="w-full bg-[var(--bg-soft)] border border-[var(--border-soft)] rounded px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]/30"
        placeholder="关注点（用 、 分隔）"
      />
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--text-primary)]/45 tracking-widish uppercase">立场</span>
        {(['pro', 'con', 'neutral'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStance(s)}
            className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-widish transition-colors
              ${stance === s
                ? s === 'pro' ? 'bg-[var(--accent-primary)] text-[var(--text-primary)]' : s === 'con' ? 'bg-[var(--accent-rose)] text-[var(--text-primary)]' : 'bg-[var(--accent-emerald)] text-[var(--text-primary)]'
                : 'bg-[var(--bg-card)] text-[var(--text-primary)]/55 hover:bg-[var(--bg-card-strong)]'}`}
          >
            {s === 'pro' ? '支持' : s === 'con' ? '反对' : '中立'}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="primary" onClick={() =>
          onSave({
            oneLiner,
            description,
            tone,
            focus: focus.split(/[、，,\s]+/).filter(Boolean),
            stance,
          })
        }>
          保存
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>取消</Button>
      </div>
    </motion.div>
  );
}
