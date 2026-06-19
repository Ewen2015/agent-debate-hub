import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Settings2, FileText, Activity, Hash, ChevronRight } from 'lucide-react';
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
    <div className="min-h-screen flex flex-col">
      <TopBar />

      <main className="flex-1 max-w-[1540px] w-full mx-auto px-4 md:px-6 pb-8 grid grid-cols-1 lg:grid-cols-[236px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_320px] gap-4">
        <WorkspaceSidebar
          reportReady={!!report}
          onRoster={() => setRosterDrawer(true)}
          onGateway={() => setGatewayDrawer(true)}
          onReport={() => setReportDrawer(true)}
        />

        <section className="min-w-0 flex flex-col gap-4">
          <StageControl />
          <QuestionWorkbench />
          <DiscussionChannel />
        </section>

        <aside className="hidden xl:flex flex-col gap-4 min-w-0">
          <SidePanel
            icon={<Users size={14} />}
            title="Members"
            subtitle="Agent 团"
            onOpen={() => setRosterDrawer(true)}
          >
            <RosterMini />
          </SidePanel>
          <SidePanel
            icon={<Settings2 size={14} />}
            title="Gateway"
            subtitle="Provider"
            onOpen={() => setGatewayDrawer(true)}
          >
            <GatewayMini />
          </SidePanel>
          <SidePanel
            icon={<FileText size={14} />}
            title="Report"
            subtitle={report ? '已生成' : '待生成'}
            onOpen={() => setReportDrawer(true)}
            highlight={!!report}
          >
            <ReportMini />
          </SidePanel>
        </aside>
      </main>

      <Footer />

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
    <header className="px-4 md:px-6 pt-4 pb-3">
      <div className="max-w-[1540px] mx-auto flex items-center gap-4">
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-2.5"
        >
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-gold-300 to-gold-500 flex items-center justify-center">
            <Activity size={18} className="text-[var(--text-primary)]" />
          </div>
          <div>
            <div className="font-display text-lg text-[var(--text-primary)] leading-none">
              Group Debate Hub
            </div>
            <div className="text-[10px] tracking-widest2 uppercase text-[var(--text-primary)]/40 mt-1">
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
      <div className="max-w-[1540px] mx-auto mt-3">
        <div className="divider-x" />
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="px-4 md:px-6 py-4 mt-2">
      <div className="max-w-[1540px] mx-auto flex items-center justify-between text-[10px] tracking-widish uppercase text-[var(--text-primary)]/30">
        <span>Group Debate Agent Hub · 本地运行 · 状态保存在浏览器</span>
        <span>Mock 模式 · {new Date().getFullYear()}</span>
      </div>
    </footer>
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
  const agents = useRosterStore((s) => s.agents);
  const channelName = channelNameFromQuestion(session.question);
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
    <aside className="hidden lg:flex lg:sticky lg:top-4 lg:h-[calc(100vh-104px)] min-h-[620px]">
      <div className="glass-strong rounded-lg w-full p-3 flex flex-col overflow-hidden">
        <div className="px-2 pb-3 border-b border-[var(--border-soft)]">
          <div className="font-display text-base text-[var(--text-primary)]">Debate Hub</div>
          <div className="mt-1 text-[10px] uppercase tracking-widest2 text-[var(--text-muted)]">
            Workspace
          </div>
        </div>

        <div className="mt-4">
          <div className="px-2 mb-2 text-[10px] uppercase tracking-widest2 text-[var(--text-muted)]">
            Channels
          </div>
          <div
            className="w-full rounded-md bg-[var(--accent-violet)]/16 text-[var(--text-primary)] border border-[var(--accent-violet)]/25 px-2.5 py-2 flex items-center gap-2"
          >
            <Hash size={15} className="text-[var(--accent-violet)] flex-shrink-0" />
            <span className="text-sm truncate text-left">{channelName}</span>
          </div>
        </div>

        <div className="mt-5">
          <div className="px-2 mb-2 text-[10px] uppercase tracking-widest2 text-[var(--text-muted)]">
            Details
          </div>
          <SidebarAction icon={<Users size={14} />} label="Members" onClick={onRoster} />
          <SidebarAction icon={<Settings2 size={14} />} label="Gateway" onClick={onGateway} />
          <SidebarAction
            icon={<FileText size={14} />}
            label={reportReady ? 'Report ready' : 'Report'}
            onClick={onReport}
            active={reportReady}
          />
        </div>

        <div className="mt-auto rounded-md border border-[var(--border-soft)] bg-[var(--bg-card)] p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] uppercase tracking-widish text-[var(--text-muted)]">{phaseLabel}</span>
            <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
              <span className={`h-1.5 w-1.5 rounded-full ${activeAgents ? 'bg-[var(--accent-cyan)]' : 'bg-[var(--text-muted)]/40'}`} />
              {activeAgents}/{agents.length}
            </span>
          </div>
          <div className="mt-2 text-[12px] leading-snug text-[var(--text-soft)] line-clamp-3">
            {session.question || 'Untitled discussion'}
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
    <div className={`glass rounded-lg p-4 ${highlight ? 'border-[var(--accent-gold)]/35' : ''}`}>
      <div className="flex items-center gap-2 mb-3">
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
