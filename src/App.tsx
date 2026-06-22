import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Hash, Plus, Trash2, Check, Edit3, UserMinus } from 'lucide-react';
import { useUIStore, useRosterStore, useGatewayStore } from '@/store/staticStores';
import { useSessionStore } from '@/store/sessionStore';
import { resolvePersona } from '@/engine/MockLLM';
import { DiscussionChannel } from '@/components/arena/DiscussionChannel';
import { StageControl } from '@/components/arena/StageControl';
import { QuestionWorkbench } from '@/components/question/QuestionWorkbench';
import { RosterPanel } from '@/components/roster/RosterPanel';
import { GatewayPanel } from '@/components/gateway/GatewayPanel';
import { ReportPanel } from '@/components/report/ReportPanel';
import { ReportModal } from '@/components/report/ReportModal';
import { ReportPrintView } from '@/components/report/ReportPrintView';
import { Drawer } from '@/components/shared/Drawer';

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
  const session = useSessionStore((s) => s.session);
  const agents = useRosterStore((s) => s.agents);

  useEffect(() => {
    if (report && phase === 'report') {
      setReportDrawer(true);
    }
  }, [report, phase, setReportDrawer]);

  return (
    <div className="h-screen min-h-screen flex flex-col overflow-hidden">
      <main className="flex-1 min-h-0 overflow-hidden max-w-[1540px] w-full mx-auto px-4 md:px-6 py-3 grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4">
        <WorkspaceSidebar
          reportReady={!!report}
          onRoster={() => setRosterDrawer(true)}
          onGateway={() => setGatewayDrawer(true)}
          onReport={() => setReportDrawer(true)}
        />

        <section className="min-w-0 h-full flex flex-col gap-3 overflow-hidden">
          <div className="flex flex-col gap-2">
            <div className="sticky top-3 z-10">
              <StageControl />
            </div>
            <div className="sticky top-[88px] z-10">
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

      {/* 报告改为居中模态预览，不再使用右侧抽屉 */}
      <ReportModal open={reportDrawerOpen} onClose={() => setReportDrawer(false)}>
        <ReportPanel />
      </ReportModal>

      {/* 打印专用视图：portal 挂到 body，屏幕隐藏，仅 window.print() 时可见 */}
      {report &&
        createPortal(
          <ReportPrintView
            report={report}
            question={session.question}
            speeches={session.speeches}
            agents={agents}
          />,
          document.body,
        )}
    </div>
  );
}

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
  const removeAgent = useRosterStore((s) => s.removeAgent);
  const gatewayProviders = useGatewayStore((s) => s.providers);
  const activeProviderId = useGatewayStore((s) => s.activeProviderId);
  const activeProvider = gatewayProviders.find((p) => p.id === activeProviderId);

  const phaseLabel =
    session.phase === 'brainstorm'
      ? 'Brainstorm'
      : session.phase === 'debate'
      ? `Debate R${session.currentRound}`
      : session.phase === 'report'
      ? 'Report'
      : 'Idle';

  // Right-click context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; channelId: string; name: string } | null>(null);
  const [memberMenu, setMemberMenu] = useState<{ x: number; y: number; agentId: string; name: string } | null>(null);

  const closeMenus = useCallback(() => {
    setCtxMenu(null);
    setMemberMenu(null);
  }, []);

  const handleChannelContextMenu = useCallback((e: React.MouseEvent, channelId: string, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 180);
    setMemberMenu(null);
    setCtxMenu({ x, y, channelId, name });
  }, []);

  const handleMemberContextMenu = useCallback((e: React.MouseEvent, agentId: string, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 180);
    setCtxMenu(null);
    setMemberMenu({ x, y, agentId, name });
  }, []);

  useEffect(() => {
    if (!ctxMenu && !memberMenu) return;
    const handleClick = () => closeMenus();
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMenus(); };
    const handleScroll = () => closeMenus();
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleEsc);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleEsc);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [ctxMenu, memberMenu, closeMenus]);

  const handleDeleteChannel = (channelId: string) => {
    deleteChannel(channelId);
    closeMenus();
  };

  const handleSwitchChannel = (channelId: string) => {
    setActiveSession(channelId);
    closeMenus();
  };

  const handleEditPersona = () => {
    onRoster();
    closeMenus();
  };

  const handleRemoveFromDebate = (agentId: string) => {
    removeAgent(agentId);
    closeMenus();
  };

  return (
    <aside className="hidden lg:flex lg:flex-col lg:sticky lg:top-3 lg:h-full min-h-0">
      <div className="glass-strong rounded-2xl w-full flex flex-col overflow-hidden flex-1 min-h-0">
        {/* Header */}
        <div className="px-3 pt-3 pb-2.5 border-b border-[var(--border-soft)]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md border border-[var(--border-strong)] flex items-center justify-center text-[var(--text-primary)]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 6 L4 12 L9 18" />
                  <path d="M15 6 L20 12 L15 18" />
                </svg>
              </div>
              <span className="font-display text-[14px] tracking-tightish text-[var(--text-primary)]">Debate Hub</span>
            </div>
            <button
              type="button"
              onClick={createChannel}
              title="新建频道"
              className="w-7 h-7 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] text-[var(--text-soft)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-strong)] hover:border-[var(--accent-gold)]/40 flex items-center justify-center transition-all"
            >
              <Plus size={15} />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${session.phase === 'idle' ? 'bg-[var(--text-muted)]' : 'bg-cyan-400 animate-pulse-soft'}`} />
            <span className="text-[11px] text-[var(--text-secondary)]">{phaseLabel}</span>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-1.5 py-2">

          {/* Channel list */}
          <div className="px-2 py-1 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest2 text-[var(--text-muted)] font-semibold">
              频道
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">{Object.keys(sessions).length}</span>
          </div>
          <div className="space-y-0.5 mt-0.5">
            {Object.values(sessions).map((item) => {
              const name = item.title || 'new discussion';
              const isActive = item.id === activeSessionId;
              return (
                <div
                  key={item.id}
                  onClick={() => setActiveSession(item.id)}
                  onContextMenu={(e) => handleChannelContextMenu(e, item.id, name)}
                  className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-[var(--accent-gold)]/12 text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-strong)]'
                  }`}
                >
                  <Hash size={14} className={`flex-shrink-0 ${isActive ? 'text-[var(--accent-gold)]' : 'text-[var(--text-muted)]'}`} />
                  <span className={`truncate text-[13px] ${isActive ? 'font-medium' : ''}`}>{name}</span>
                  {isActive && (
                    <span className="ml-auto flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--accent-gold)]" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Current topic */}
          <div className="mt-4 px-2">
            <div className="text-[10px] uppercase tracking-widest2 text-[var(--text-muted)] font-semibold mb-1.5">
              当前议题
            </div>
            <div className="text-[12px] text-[var(--text-secondary)] leading-relaxed break-words">
              {session.question || '未设置讨论主题'}
            </div>
          </div>

          {/* Members */}
          <div className="mt-4 px-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-widest2 text-[var(--text-muted)] font-semibold">
                成员
              </span>
              <button
                type="button"
                onClick={onRoster}
                className="text-[10px] font-medium text-[var(--accent-violet)] hover:opacity-80 transition-opacity"
              >
                管理
              </button>
            </div>
            <ul className="space-y-1">
              {agents.slice(0, 6).map((a) => {
                const persona = resolvePersona(a);
                return (
                  <li key={a.id} className="flex items-center gap-2 text-[12px] py-0.5">
                    <div
                      className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-display text-white flex-shrink-0"
                      style={{ background: `linear-gradient(135deg, ${persona.gradient[0]}, ${persona.gradient[1]})` }}
                    >
                      {persona.emoji}
                    </div>
                    <span
                      className="min-w-0 truncate text-[var(--text-secondary)]"
                      onContextMenu={(e) => handleMemberContextMenu(e, a.id, persona.name)}
                      title="右键：编辑人设 / 移除"
                    >
                      {persona.name}
                    </span>
                    <span className="ml-auto flex-shrink-0 text-[10px] text-[var(--text-muted)]">
                      {persona.stance === 'pro' ? '支持' : persona.stance === 'con' ? '反对' : '中立'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Gateway */}
          <div className="mt-4 px-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-widest2 text-[var(--text-muted)] font-semibold">
                Gateway
              </span>
              <button
                type="button"
                onClick={onGateway}
                className="text-[10px] font-medium text-[var(--accent-violet)] hover:opacity-80 transition-opacity"
              >
                配置
              </button>
            </div>
            <div className="text-[12px] text-[var(--text-secondary)]">
              <div className="font-medium truncate">{activeProvider?.label || '未配置'}</div>
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate font-mono">
                {activeProvider?.baseUrl || '本地 mock'}
              </div>
            </div>
          </div>

          {/* Report */}
          <div className="mt-4 px-2 pb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-widest2 text-[var(--text-muted)] font-semibold">
                Report
              </span>
              <button
                type="button"
                onClick={onReport}
                className="text-[10px] font-medium text-[var(--accent-violet)] hover:opacity-80 transition-opacity"
              >
                查看
              </button>
            </div>
            {report ? (
              <div className="space-y-1 text-[12px] text-[var(--text-secondary)]">
                <div><span className="text-[var(--text-muted)]">共识：</span>{report.consensus.length} 条</div>
                <div><span className="text-[var(--text-muted)]">分歧：</span>{report.disagreements.length} 处</div>
                <div><span className="text-[var(--text-muted)]">论点：</span>{report.arguments.length} 个</div>
              </div>
            ) : (
              <div className="text-[11px] text-[var(--text-muted)]">完成阶段后点击指挥台生成报告。</div>
            )}
          </div>
        </div>
      </div>

      {/* Right-click context menu */}
      {ctxMenu && createPortal(
        <ChannelContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          channelName={ctxMenu.name}
          isActive={ctxMenu.channelId === activeSessionId}
          onSwitch={() => handleSwitchChannel(ctxMenu.channelId)}
          onDelete={() => handleDeleteChannel(ctxMenu.channelId)}
        />,
        document.body,
      )}
      {memberMenu && createPortal(
        <MemberContextMenu
          x={memberMenu.x}
          y={memberMenu.y}
          memberName={memberMenu.name}
          onEditPersona={handleEditPersona}
          onRemove={() => handleRemoveFromDebate(memberMenu.agentId)}
        />,
        document.body,
      )}
    </aside>
  );
}

function ChannelContextMenu({
  x,
  y,
  channelName,
  isActive,
  onSwitch,
  onDelete,
}: {
  x: number;
  y: number;
  channelName: string;
  isActive: boolean;
  onSwitch: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="fixed z-[100] min-w-[180px] rounded-xl border border-[var(--border-soft)] bg-[var(--bg-elev)] py-1.5 shadow-float backdrop-blur-xl"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 border-b border-[var(--border-soft)] mb-1">
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
          <Hash size={12} />
          <span className="truncate font-medium">{channelName}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onSwitch}
        className="w-full px-3 py-1.5 flex items-center gap-2.5 text-[12px] text-[var(--text-primary)] hover:bg-[var(--bg-card-strong)] transition-colors text-left"
      >
        <Check size={14} className={isActive ? 'text-[var(--accent-gold)]' : 'text-[var(--text-muted)]'} />
        <span>切换到此频道</span>
        {isActive && <span className="ml-auto text-[10px] text-[var(--text-muted)]">当前</span>}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="w-full px-3 py-1.5 flex items-center gap-2.5 text-[12px] text-[var(--accent-rose)] hover:bg-[var(--accent-rose)]/8 transition-colors text-left"
      >
        <Trash2 size={14} />
        <span>删除频道</span>
      </button>
    </div>
  );
}

function MemberContextMenu({
  x,
  y,
  memberName,
  onEditPersona,
  onRemove,
}: {
  x: number;
  y: number;
  memberName: string;
  onEditPersona: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="fixed z-[100] min-w-[200px] rounded-xl border border-[var(--border-soft)] bg-[var(--bg-elev)] py-1.5 shadow-float backdrop-blur-xl"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 border-b border-[var(--border-soft)] mb-1">
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
          <span className="font-medium truncate">{memberName}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onEditPersona}
        className="w-full px-3 py-1.5 flex items-center gap-2.5 text-[12px] text-[var(--text-primary)] hover:bg-[var(--bg-card-strong)] transition-colors text-left"
      >
        <Edit3 size={14} className="text-[var(--text-muted)]" />
        <span>编辑人设</span>
        <span className="ml-auto text-[10px] text-[var(--text-muted)]">打开成员管理</span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="w-full px-3 py-1.5 flex items-center gap-2.5 text-[12px] text-[var(--accent-rose)] hover:bg-[var(--accent-rose)]/8 transition-colors text-left"
      >
        <UserMinus size={14} />
        <span>从讨论移除</span>
      </button>
    </div>
  );
}
