import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Persona, ProviderConfig, RosterAgent } from '@/types';
import { PERSONAS } from '@/data/personas';

const uid = () => Math.random().toString(36).slice(2, 10);

const DEFAULT_PERSONA_IDS = ['idealist', 'engineer', 'skeptic'];

const buildDefaultRoster = (): RosterAgent[] =>
  DEFAULT_PERSONA_IDS.map((pid) => ({
    id: uid(),
    personaId: pid,
    status: 'idle',
  }));

const DEFAULT_PROVIDER: ProviderConfig = {
  id: 'unconfigured',
  label: '未配置（需填入 API Key）',
  baseUrl: '',
  apiKey: '',
  model: '',
  temperature: 0.7,
  maxTokens: 2048,
  enableSearch: true,
  enabled: true,
};

interface UIState {
  rosterDrawerOpen: boolean;
  gatewayDrawerOpen: boolean;
  reportDrawerOpen: boolean;
  questionPanelCollapsed: boolean;
  activeAgentId: string | null;
  setRosterDrawer: (v: boolean) => void;
  setGatewayDrawer: (v: boolean) => void;
  setReportDrawer: (v: boolean) => void;
  toggleQuestionPanel: () => void;
  setActiveAgent: (id: string | null) => void;
}

interface RosterState {
  agents: RosterAgent[];
  setGroupSize: (n: number) => void;
  addAgent: (personaId: string) => void;
  removeAgent: (id: string) => void;
  updateAgent: (id: string, patch: Partial<RosterAgent>) => void;
  setPersona: (id: string, personaId: string) => void;
  customizePersona: (id: string, patch: Partial<Persona>) => void;
  reset: () => void;
}

interface GatewayState {
  providers: ProviderConfig[];
  activeProviderId: string;
  addProvider: (p: Partial<ProviderConfig>) => string;
  updateProvider: (id: string, patch: Partial<ProviderConfig>) => void;
  removeProvider: (id: string) => void;
  setActive: (id: string) => void;
  reset: () => void;
}

export const useUIStore = create<UIState>()((set) => ({
  rosterDrawerOpen: false,
  gatewayDrawerOpen: false,
  reportDrawerOpen: false,
  questionPanelCollapsed: false,
  activeAgentId: null,
  setRosterDrawer: (v) => set({ rosterDrawerOpen: v }),
  setGatewayDrawer: (v) => set({ gatewayDrawerOpen: v }),
  setReportDrawer: (v) => set({ reportDrawerOpen: v }),
  toggleQuestionPanel: () =>
    set((s) => ({ questionPanelCollapsed: !s.questionPanelCollapsed })),
  setActiveAgent: (id) => set({ activeAgentId: id }),
}));

export const useRosterStore = create<RosterState>()(
  persist(
    (set, get) => ({
      agents: buildDefaultRoster(),
      setGroupSize: (n) => {
        n = Math.max(2, Math.min(8, Math.round(n)));
        const cur = get().agents;
        if (n === cur.length) return;
        if (n > cur.length) {
          const used = new Set(cur.map((a) => a.personaId));
          const pool = PERSONAS.filter((p) => !used.has(p.id));
          const need = n - cur.length;
          const picks = pool.slice(0, need);
          const extras: RosterAgent[] = picks.length
            ? picks.map((p) => ({ id: uid(), personaId: p.id, status: 'idle' }))
            : PERSONAS.slice(0, need).map((p) => ({ id: uid(), personaId: p.id, status: 'idle' }));
          set({ agents: [...cur, ...extras] });
        } else {
          set({ agents: cur.slice(0, n) });
        }
      },
      addAgent: (personaId) => {
        const cur = get().agents;
        if (cur.length >= 8) return;
        set({ agents: [...cur, { id: uid(), personaId, status: 'idle' }] });
      },
      removeAgent: (id) => {
        const cur = get().agents;
        if (cur.length <= 2) return;
        set({ agents: cur.filter((a) => a.id !== id) });
      },
      updateAgent: (id, patch) => {
        set({
          agents: get().agents.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        });
      },
      setPersona: (id, personaId) => {
        set({
          agents: get().agents.map((a) =>
            a.id === id ? { ...a, personaId, custom: undefined } : a,
          ),
        });
      },
      customizePersona: (id, patch) => {
        set({
          agents: get().agents.map((a) =>
            a.id === id ? { ...a, custom: { ...(a.custom || {}), ...patch } } : a,
          ),
        });
      },
      reset: () => set({ agents: buildDefaultRoster() }),
    }),
    { name: 'gd-hub:roster:v1' },
  ),
);

export const useGatewayStore = create<GatewayState>()(
  persist(
    (set, get) => ({
      providers: [DEFAULT_PROVIDER],
      activeProviderId: 'unconfigured',
      addProvider: (p) => {
        const id = uid();
        const newOne: ProviderConfig = {
          id,
          label: p.label || '新 Provider',
          baseUrl: p.baseUrl || '',
          apiKey: p.apiKey || '',
          model: p.model || 'gpt-4o-mini',
          temperature: p.temperature ?? 0.7,
          maxTokens: p.maxTokens ?? 2048,
          enableSearch: p.enableSearch ?? true,
          enabled: p.enabled ?? true,
        };
        set({ providers: [...get().providers, newOne] });
        return id;
      },
      updateProvider: (id, patch) => {
        set({
          providers: get().providers.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        });
      },
      removeProvider: (id) => {
        const cur = get().providers;
        if (cur.length <= 1) return;
        set({ providers: cur.filter((p) => p.id !== id) });
        if (get().activeProviderId === id) {
          set({ activeProviderId: get().providers[0]?.id || '' });
        }
      },
      setActive: (id) => set({ activeProviderId: id }),
      reset: () => set({ providers: [DEFAULT_PROVIDER], activeProviderId: 'unconfigured' }),
    }),
    {
      name: 'gd-hub:gateway:v1',
      version: 2,
      migrate: (persisted: any, version: number) => {
        // v1 → v2: 清除旧的 mock provider，替换为新的 unconfigured 默认值
        if (version < 2 && persisted?.providers) {
          const cleaned = persisted.providers.map((p: any) =>
            p.id === 'mock' || p.model === 'mock-debate-v1'
              ? { ...DEFAULT_PROVIDER }
              : p,
          );
          return {
            ...persisted,
            providers: cleaned,
            activeProviderId: cleaned[0]?.id || 'unconfigured',
          };
        }
        return persisted;
      },
    },
  ),
);
