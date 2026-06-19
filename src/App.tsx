import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Settings2, FileText, Activity, Hash, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useUIStore, useRosterStore, useGatewayStore } from '@/store/staticStores';
import { useSessionStore } from '@/store/sessionStore';
import { resolvePersona } from '@/engine/MockLLM';
import { DiscussionChannel } from '@/components/arena/DiscussionChannel';
import { StageControl } from '@/components/arena/StageControl';
import { QuestionWorkbench } from '@/components/question/QuestionWorkbench';
import { RosterPanel } from '@/components/roster/RosterPanel';
import { GatewayPanel } from '@/components/gateway/GatewayPanel';
import { ReportPanel } from '@/components/report/ReportPanel';
import { Drawer } from '@/components/shared/Drawer';
import { Chip } from '@/components/shared/Chip';
import type { RosterAgent, ProviderConfig } from '@/types';

export default function App() {
  const {
    rosterDrawerOpen,
    gatewayDrawerOpen,
    reportDrawerOpen,
    setRosterDrawer,
    setGatewayDrawer,
    setReportDrawer,
  } = useUIStore();

  const phase = useSessionStore((s) => s.session.phase);
  const report = useSessionStore((s) => s.report);

  useEffect(() => {
    if (report && phase === 'report') {
      setReportDrawer(true);
    }
  }, [report, phase, setReportDrawer]);

  return (
    <div className="h-screen min-h-screen flex flex-col overflow-hidden">
      <TopBar />

      <main className="flex-1 min-h-0 overflow-hidden max-w-[1540px] w-full mx-auto px-4 md:px-6 grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-3">
        <WorkspaceSidebar
          reportReady={!!report}
          onRoster={() => setRosterDrawer(true)}
          onGateway={() => setGatewayDrawer(true)}
          onReport={() => setReportDrawer(true)}
        />

        <section className="min-w-0 h-full flex flex-col gap-3 overflow-hidden">
          <div className="flex flex-col gap-3">
            <div className="sticky top-3 z-10">
              <StageControl />
            </div>
            <div className="sticky top-[92px] z-10">
              <QuestionWorkbench />
            </div>
          </div>
          <DiscussionChannel />
        </section>
      </main>

      <Drawer
        open={rosterDrawerOpen}
        onClose={() => setRosterDrawer(false)}
        title="Roster"
        subtitle="Agent 团配置"
        side="right"
        width="w-[460px]"
      >
        <RosterPanel />
      </Drawer>

      <Drawer
        open={gatewayDrawerOpen}
        onClose={() => setGatewayDrawer(false)}
        title="Model Gateway"
        subtitle="模型接入配置"
        side="right"
        width="w-[460px]"
      >
        <GatewayPanel />
      </Drawer>

      <Drawer
        open={reportDrawerOpen}
        onClose={() => setReportDrawer(false)}
        title="Final Report"
        subtitle="统一结论报告"
        side="right"
        width="w-[520px]"
      >
        <ReportPanel />
      </Drawer>
    </div>
  );
}

function TopBar() {
  return (
    <header className="px-4 md:px-6 py-3">
      <div className="max-w-[1540px] mx-auto flex items-center gap-2.5">
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-2"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gold-300 to-gold-500 flex items-center justify-center">
            <Activity size={14} className="text-[var(--text-primary)]" />
          </div>
          <div>
            <div className="font-display text-sm text-[var(--text-primary)] leading-none">
              Group Debate Hub
            </div>
            <div className="text-[9px] tracking-widest2 uppercase text-[var(--text-primary)]/40 mt-1">
              Workspace · v0.1
            </div>
          </div>
        </motion.div>
        <div className="flex-1" />
        <div className="hidden md:flex items-center gap-1.5 text-[10px] tracking-widest2 uppercase text-[var(--text-primary)]/30">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse-soft" />
          arena ready
        </div>
      </div>
      <div className="max-w-[1540px] mx-auto mt-1.5">
        <div className="divider-x" />
      </div>
    </header>
  );
}

const channelNameFromQuestion = (question: string) => {
  const clean = question
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  return clean ? clean.slice(0, 22) : 'new-discussion';
};

function WorkspaceSidebar({
  reportReady,
  onRoster,
  onGateway,
  onReport,
}: {
  reportReady: boolean;
  onRoster: () => void;
  onGateway: () => void;
  onReport: () => void;
}) {
  const session = useSessionStore((s) => s.session);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  const createChannel = useSessionStore((s) => s.createChannel);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const deleteChannel = useSessionStore((s) => s.deleteChannel);
  const report = useSessionStore((s) => s.report);
  const agents = useRosterStore((s) => s.agents);
  const channelName = session.title || 'new discussion';
  const activeAgents = agents.filter((agent) => agent.status !== 'idle').length;
  const phaseLabel =
    session.phase === 'brainstorm'
      ? 'Brainstorm'
      : session.phase === 'debate'
      ? `Debate R${session.currentRound}`
      : session.phase === 'report'
      ? 'Report'
      : 'Idle';

  return (
    <aside className="hidden lg:flex lg:sticky lg:top-3 lg:h-full min-h-[620px]">
      <div className="glass-strong rounded-2xl w-full p-3 flex flex-col overflow-hidden gap-3">
        <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-card)] p-3">
          <div className="flex items-center gap-1.5 mb-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--bg-card-strong)] text-[var(--accent-gold)]">
              <Hash size={18} />
            </div>
            <div>
              <div className="font-display text-sm text-[var(--text-primary)]">Debate Hub</div>
              <div className="text-[9px] uppercase tracking-widest2 text-[var(--text-muted)] mt-0.5">
                全局概览
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="rounded-2xl bg-[var(--bg-soft)] p-3 border border-[var(--border-soft)]">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[9px] uppercase tracking-widish text-[var(--text-muted)]">频道</div>
                  <div className="mt-1.5 flex items-center gap-2 text-[12px] font-medium text-[var(--text-primary)]">
                    <Hash size={16} />
                    <span className="truncate">{channelName}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={createChannel}
                  className="inline-flex h-8 items-center gap-2 rounded-xl bg-[var(--bg-card)] px-3 text-[11px] text-[var(--text-primary)] border border-[var(--border-soft)] hover:bg-[var(--bg-card-strong)] transition-colors"
                >
                  <Plus size={14} />
                  新建
                </button>
              </div>
            </div>
            <div className="rounded-2xl bg-[var(--bg-soft)] p-3 border border-[var(--border-soft)]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-widish text-[var(--text-muted)]">状态</span>
                <Chip tone={session.phase === 'idle' ? 'mute' : 'cyan'} size="sm">
                  {phaseLabel}
                </Chip>
              </div>
              <div className="mt-2 text-[11px] text-[var(--text-primary)]/80">
                {session.question || '未设置讨论主题'}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-card)] p-3">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-[10px] uppercase tracking-widish text-[var(--text-muted)]">全部频道</span>
                <span className="text-[10px] text-[var(--text-primary)]/50">{Object.keys(sessions).length} 个</span>
              </div>
              <div className="space-y-2">
                {Object.values(sessions).map((item) => {
                  const name = item.title || 'new discussion';
                  const isActive = item.id === activeSessionId;
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between gap-2 rounded-xl border p-2 ${
                        isActive ? 'border-[var(--accent-gold)] bg-[var(--bg-soft)]' : 'border-[var(--border-soft)] bg-[var(--bg-card)]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setActiveSession(item.id)}
                        className="min-w-0 text-left"
                      >
                        <div className={`truncate text-[12px] ${isActive ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-primary)]/80'}`}>
                          {name}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)]/80 truncate">
                          {item.question || '新频道'}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteChannel(item.id)}
                        className="text-[var(--text-muted)] hover:text-[var(--accent-rose)]"
                        aria-label={`删除频道 ${name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 overflow-auto pr-1">
          <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 text-[var(--text-primary)]">
                <Users size={16} />
                <div>
                  <div className="font-display text-sm">成员</div>
                  <div className="text-[10px] text-[var(--text-muted)]">Agent 团</div>
                </div>
              </div>
              <button
                type="button"
                onClick={onRoster}
                className="text-[10px] uppercase tracking-widish text-[var(--accent-violet)]"
              >
                管理
              </button>
            </div>
            <ul className="space-y-2">
              {agents.slice(0, 6).map((a) => {
                const persona = resolvePersona(a);
                return (
                  <li key={a.id} className="flex items-center gap-2 text-[12px]">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-display text-[var(--text-primary)]"
                      style={{ background: `linear-gradient(135deg, ${persona.gradient[0]}, ${persona.gradient[1]})` }}
                    >
                      {persona.emoji}
                    </div>
                    <div className="min-w-0 truncate text-[var(--text-primary)]/85">{persona.name}</div>
                    <span className="rounded-full bg-[var(--bg-soft)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
                      {persona.stance === 'pro' ? '支持' : persona.stance === 'con' ? '反对' : '中立'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 text-[var(--text-primary)]">
                <Settings2 size={16} />
                <div>
                  <div className="font-display text-sm">Gateway</div>
                  <div className="text-[10px] text-[var(--text-muted)]">模型提供</div>
                </div>
              </div>
              <button
                type="button"
                onClick={onGateway}
                className="text-[10px] uppercase tracking-widish text-[var(--accent-violet)]"
              >
                配置
              </button>
            </div>
            <div className="text-[12px] text-[var(--text-primary)]/80">
              <div className="font-medium">{useGatewayStore.getState().providers.find((p) => p.id === useGatewayStore.getState().activeProviderId)?.label || '未配置'}</div>
              <div className="text-[10px] text-[var(--text-muted)] mt-1 truncate">
                {useGatewayStore.getState().providers.find((p) => p.id === useGatewayStore.getState().activeProviderId)?.baseUrl || '本地 mock'}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 text-[var(--text-primary)]">
                <FileText size={16} />
                <div>
                  <div className="font-display text-sm">Report</div>
                  <div className="text-[10px] text-[var(--text-muted)]">结果摘要</div>
                </div>
              </div>
              <button
                type="button"
                onClick={onReport}
                className="text-[10px] uppercase tracking-widish text-[var(--accent-violet)]"
              >
                查看
              </button>
            </div>
            {report ? (
              <div className="space-y-2 text-[12px] text-[var(--text-primary)]/80">
                <div><span className="text-[var(--text-primary)]/40">共识：</span>{report.consensus.length} 条</div>
                <div><span className="text-[var(--text-primary)]/40">分歧：</span>{report.disagreements.length} 处</div>
                <div><span className="text-[var(--text-primary)]/40">论点：</span>{report.arguments.length} 个</div>
              </div>
            ) : (
              <div className="text-[11px] text-[var(--text-primary)]/50">完成阶段后点击指挥台生成报告。</div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

function SidebarAction({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-md px-2.5 py-2 flex items-center gap-2 text-sm transition-colors ${
        active
          ? 'bg-[var(--accent-gold)]/14 text-[var(--accent-gold)]'
          : 'text-[var(--text-soft)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]'
      }`}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="truncate text-left">{label}</span>
    </button>
  );
}

function SidePanel({
  icon,
  title,
  subtitle,
  onOpen,
  children,
  highlight,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onOpen: () => void;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={`glass rounded-lg p-3 ${highlight ? 'border-[var(--accent-gold)]/35' : ''}`}>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-[var(--accent-gold)]/80">{icon}</span>
        <span className="font-display text-sm text-[var(--text-primary)]">{title}</span>
        <div className="flex-1" />
        <button
          onClick={onOpen}
          title={`${title} 展开`}
          className="h-7 w-7 rounded-md border border-[var(--border-soft)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-strong)] transition-colors flex items-center justify-center"
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="text-[10px] tracking-widish uppercase text-[var(--text-primary)]/35 mb-2">{subtitle}</div>
      <div>{children}</div>
    </div>
  );
}

function RosterMini() {
  const agents: RosterAgent[] = useRosterStore((s) => s.agents);
  return (
    <ul className="space-y-1.5">
      {agents.map((a) => {
        const persona = resolvePersona(a);
        return (
          <li key={a.id} className="flex items-center gap-2 text-[12px]">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-display text-[var(--text-primary)]"
              style={{ background: `linear-gradient(135deg, ${persona.gradient[0]}, ${persona.gradient[1]})` }}
            >
              {persona.emoji}
            </div>
            <span className="text-[var(--text-primary)]/80 truncate">{persona.name}</span>
            <span className="text-[var(--text-primary)]/30 text-[10px] ml-auto uppercase tracking-widish">
              {persona.stance === 'pro' ? '支持' : persona.stance === 'con' ? '反对' : '中立'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function GatewayMini() {
  const providers: ProviderConfig[] = useGatewayStore((s) => s.providers);
  const active: string = useGatewayStore((s) => s.activeProviderId);
  const cur = providers.find((p) => p.id === active) || providers[0];
  return (
    <div className="text-[12px] text-[var(--text-primary)]/75">
      <div className="font-display">{cur?.label}</div>
      <div className="text-[10px] text-[var(--text-primary)]/40 font-mono mt-0.5 truncate">
        {cur?.baseUrl || '— local mock —'}
      </div>
    </div>
  );
}

function ReportMini() {
  const report = useSessionStore((s) => s.report);
  if (!report) {
    return <div className="text-[11px] text-[var(--text-primary)]/40">完成阶段后点击指挥台生成。</div>;
  }
  return (
    <div className="space-y-1 text-[11.5px] text-[var(--text-primary)]/70">
      <div><span className="text-[var(--text-primary)]/40">共识：</span>{report.consensus.length} 条</div>
      <div><span className="text-[var(--text-primary)]/40">分歧：</span>{report.disagreements.length} 处</div>
      <div><span className="text-[var(--text-primary)]/40">论点：</span>{report.arguments.length} 个</div>
    </div>
  );
}
