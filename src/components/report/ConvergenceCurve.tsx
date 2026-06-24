import { useMemo, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import type { RoundSummary } from '@/types';

/**
 * 议题收敛曲线 —— 轻量内联 SVG 折线图，无图表库依赖。
 *
 * 数据来源：session.roundSummaries 每轮的 convergence ∈ [0,1]。
 * 展示辩论各轮的收敛度轨迹，帮助判断「讨论是否在向共识收敛」。
 * 支持放大/缩小/复位（通过缩放 viewBox 实现）。
 */
export function ConvergenceCurve({ rounds }: { rounds?: RoundSummary[] }) {
  const points = useMemo(
    () => (rounds || []).map((r) => ({ label: r.title, value: r.convergence })),
    [rounds],
  );
  const [zoom, setZoom] = useState(1);
  const [hovered, setHovered] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div className="flex h-[120px] items-center justify-center rounded-lg border border-dashed border-[var(--border-soft)] text-[12px] text-[var(--text-muted)]">
        暂无收敛数据。
      </div>
    );
  }

  const W = 520;
  const H = 160;
  const padX = 40;
  const padTop = 18;
  const padBottom = 34;
  const innerW = W - padX - 16;
  const innerH = H - padTop - padBottom;

  const x = (i: number) => padX + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => padTop + (1 - v) * innerH;

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(' ');
  const areaD = `${pathD} L ${x(points.length - 1).toFixed(1)} ${(padTop + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(padTop + innerH).toFixed(1)} Z`;

  const gold = 'var(--accent-gold)';

  // x 轴轮号刻度：≤10 轮逐轮标；>10 轮时每 10 轮打一次（始终含第 1 轮），避免密集遮挡。
  const shouldTick = (i: number) => points.length <= 10 || i === 0 || (i + 1) % 10 === 0;

  // 缩放：以中心为基准收窄 viewBox，实现放大；clamp 0.6-3
  const z = Math.max(0.6, Math.min(3, zoom));
  const vbW = W / z;
  const vbH = H / z;
  const vbX = (W - vbW) / 2;
  const vbY = (H - vbH) / 2;

  return (
    <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--bg-soft)] p-3">
      <div className="flex items-center justify-between mb-1.5 px-1">
        <div className="flex items-center gap-3 text-[12px] text-[var(--text-primary)]/85">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: gold }} />
            收敛度
          </span>
          <span>0%（发散）→ 100%（收敛）</span>
        </div>
        <div className="flex items-center gap-1">
          {points.length > 1 && (
            <span className="text-[12px] text-[var(--text-primary)]/85 mr-2 hidden sm:inline">
              趋势 {trendArrow(points[points.length - 1].value, points[0].value)}
            </span>
          )}
          <span className="text-[10px] font-mono tabular-nums text-[var(--text-muted)] w-9 text-right mr-1">
            {Math.round(z * 100)}%
          </span>
          <ZoomBtn title="缩小" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(2)))}>
            <ZoomOut size={14} />
          </ZoomBtn>
          <ZoomBtn title="放大" onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(2)))}>
            <ZoomIn size={14} />
          </ZoomBtn>
          <ZoomBtn title="复位" onClick={() => setZoom(1)}>
            <Maximize2 size={14} />
          </ZoomBtn>
        </div>
      </div>
      <svg viewBox={`${vbX.toFixed(1)} ${vbY.toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet" style={{ fontFamily: 'inherit', fontSize: '9px' }}>
        {/* 网格线 0 / 0.5 / 1 */}
        {[0, 0.5, 1].map((g) => (
          <g key={g}>
            <line
              x1={padX}
              x2={W - 16}
              y1={y(g)}
              y2={y(g)}
              stroke="var(--border-soft)"
              strokeWidth={1}
              strokeDasharray={g === 0 || g === 1 ? '0' : '3 3'}
            />
            <text x={padX - 6} y={y(g) + 3} textAnchor="end" fontSize="9" fill="var(--text-primary)" opacity={0.65}>
              {(g * 100).toFixed(0)}%
            </text>
          </g>
        ))}
        {/* 面积 */}
        <path d={areaD} fill={gold} opacity={0.1} />
        {/* 折线 */}
        <path d={pathD} fill="none" stroke={gold} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* 数据点：不在图上标数字，hover 浮动展示数值；x 轴轮号 >10 轮时每 10 轮打一次刻度 */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.value)} r={3} fill={gold} stroke="var(--bg-soft)" strokeWidth={1.5} />
            {shouldTick(i) && (
              <text x={x(i)} y={H - 10} textAnchor="middle" fontSize="9" fill="var(--text-primary)" opacity={0.65}>
                {i + 1}
              </text>
            )}
            {/* 透明热区：放大命中范围，便于 hover */}
            <circle
              cx={x(i)}
              cy={y(p.value)}
              r={10}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            />
          </g>
        ))}
        {/* 悬停高亮 + 详情气泡（覆盖在常驻标签之上，精确显示该点数值与轮次） */}
        {hovered != null && (
          <HoverTip
            x={x(hovered)}
            y={y(points[hovered].value)}
            label={points[hovered].label}
            value={points[hovered].value}
            bounds={{ left: padX, right: W - 16, top: padTop, bottom: H }}
          />
        )}
      </svg>
    </div>
  );
}

function ZoomBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-soft)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-strong)] border border-transparent hover:border-[var(--border-soft)] transition-colors"
    >
      {children}
    </button>
  );
}

/** 悬停详情气泡：高亮当前点并显示数值 + 轮次；上方空间不足时翻到下方，左右贴边时夹紧避免溢出。 */
function HoverTip({
  x,
  y,
  label,
  value,
  bounds,
}: {
  x: number;
  y: number;
  label: string;
  value: number;
  bounds: { left: number; right: number; top: number; bottom: number };
}) {
  const tipW = 64;
  const tipH = 28;
  const above = y - bounds.top > tipH + 8;
  const tipY = above ? y - tipH - 6 : y + 8;
  const tipX = Math.max(bounds.left, Math.min(bounds.right - tipW, x - tipW / 2));
  const short = label.length > 6 ? label.slice(0, 6) + '…' : label;
  const gold = 'var(--accent-gold)';
  return (
    <g pointerEvents="none">
      <circle cx={x} cy={y} r={4.5} fill={gold} stroke="var(--bg-soft)" strokeWidth={2} />
      <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={4} fill="var(--bg-card-strong)" stroke="var(--border-soft)" />
      <text x={tipX + tipW / 2} y={tipY + 12} textAnchor="middle" fontSize="10" fontWeight="700" fill={gold}>
        {(value * 100).toFixed(0)}%
      </text>
      <text x={tipX + tipW / 2} y={tipY + 23} textAnchor="middle" fontSize="8" fill="var(--text-primary)" opacity={0.8}>
        {short}
      </text>
    </g>
  );
}

function trendArrow(last: number, first: number): string {
  const delta = last - first;
  if (delta > 0.08) return `↑ 上升 ${((delta) * 100).toFixed(0)}%（趋向收敛）`;
  if (delta < -0.08) return `↓ 下降 ${Math.abs(delta * 100).toFixed(0)}%（趋向发散）`;
  return `→ 基本持平`;
}

export default ConvergenceCurve;
