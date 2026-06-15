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
          <span className="text-[10px] tracking-widest2 uppercase text-cream-50/45">
            Group Size
          </span>
          <span className="font-mono text-xs text-cream-50/60">{size} / 8</span>
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
                    ? 'bg-gradient-to-b from-gold-300 to-gold-400 text-ink-900 shadow-glow'
                    : 'bg-white/[0.03] text-cream-50/40 border border-white/8 hover:bg-white/[0.07]'}`}
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
          <span className="text-[10px] tracking-widest2 uppercase text-cream-50/45">
            Active Roster
          </span>
          <button
            onClick={() => setShowPersonaLib(!showPersonaLib)}
            className="text-[10px] tracking-widish uppercase text-gold-200 hover:text-gold-300 transition-colors"
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
                        className="bg-ink-800 border border-white/15 rounded px-2 py-0.5 text-sm text-cream-50 outline-none"
                      >
                        {PERSONAS.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="font-display text-sm text-cream-50 truncate">
                        {persona.name}
                      </span>
                    )}
                    <Chip tone={persona.stance === 'pro' ? 'gold' : persona.stance === 'con' ? 'rose' : 'cyan'}>
                      {persona.stance === 'pro' ? '支持' : persona.stance === 'con' ? '反对' : '中立'}
                    </Chip>
                  </div>
                  <div className="text-[11px] text-cream-50/45 tracking-widish uppercase mt-0.5 truncate">
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
                    className="p-1 rounded hover:bg-white/8 text-cream-50/60"
                  >
                    {isEditing ? <Check size={12} /> : <Edit3 size={12} />}
                  </button>
                  <button
                    onClick={() => removeAgent(agent.id)}
                    disabled={agents.length <= 2}
                    className="p-1 rounded hover:bg-rose-400/15 text-rose-300/70 hover:text-rose-300 disabled:opacity-30"
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
          <div className="text-[10px] tracking-widest2 uppercase text-cream-50/45 mb-2.5">
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
                      ? 'border-gold-300/40 bg-gold-300/8'
                      : 'border-white/8 bg-white/[0.02] hover:bg-white/[0.05]'}`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-cream-50 text-xs font-display"
                      style={{ background: `linear-gradient(135deg, ${p.gradient[0]}, ${p.gradient[1]})` }}
                    >
                      {p.emoji}
                    </div>
                    <div className="min-w-0">
                      <div className="font-display text-xs text-cream-50 truncate">
                        {p.name}
                      </div>
                      <div className="text-[10px] text-cream-50/40 truncate">
                        {p.oneLiner}
                      </div>
                    </div>
                  </div>
                  {used && (
                    <div className="absolute top-1.5 right-1.5 text-gold-300">
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
        重置为默认 3 人团
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
        className="w-full bg-ink-800 border border-white/10 rounded px-2 py-1 text-xs text-cream-50 outline-none focus:border-gold-300/30"
        placeholder="一句话立场"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className="w-full bg-ink-800 border border-white/10 rounded px-2 py-1 text-xs text-cream-50/85 outline-none focus:border-gold-300/30"
        placeholder="人设详细描述"
      />
      <input
        value={tone}
        onChange={(e) => setTone(e.target.value)}
        className="w-full bg-ink-800 border border-white/10 rounded px-2 py-1 text-xs text-cream-50 outline-none focus:border-gold-300/30"
        placeholder="语气（用 · 分隔多个标签）"
      />
      <input
        value={focus}
        onChange={(e) => setFocus(e.target.value)}
        className="w-full bg-ink-800 border border-white/10 rounded px-2 py-1 text-xs text-cream-50 outline-none focus:border-gold-300/30"
        placeholder="关注点（用 、 分隔）"
      />
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-cream-50/45 tracking-widish uppercase">立场</span>
        {(['pro', 'con', 'neutral'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStance(s)}
            className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-widish transition-colors
              ${stance === s
                ? s === 'pro' ? 'bg-gold-300 text-ink-900' : s === 'con' ? 'bg-rose-400 text-ink-900' : 'bg-cyan-400 text-ink-900'
                : 'bg-white/[0.04] text-cream-50/55 hover:bg-white/[0.08]'}`}
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
