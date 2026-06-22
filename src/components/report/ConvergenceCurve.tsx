import { useMemo } from 'react';
import type { RoundSummary } from '@/types';

/**
 * 议题收敛曲线 —— 轻量内联 SVG 折线图，无图表库依赖。
 *
 * 数据来源：session.roundSummaries 每轮的 convergence ∈ [0,1]。
 * 展示辩论各轮的收敛度轨迹，帮助判断「讨论是否在向共识收敛」。
 */
export function ConvergenceCurve({ rounds }: { rounds: RoundSummary[] }) {
  const points = useMemo(
    () => rounds.map((r) => ({ label: r.title, value: r.convergence })),
    [rounds],
  );

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

  return (
    <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--bg-soft)] p-3">
      <div className="flex items-center justify-between mb-1.5 px-1">
        <div className="flex items-center gap-3 text-[12px] text-[var(--text-primary)]/85">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: gold }} />
            收敛度
          </span>
          <span>0（发散）→ 1（收敛）</span>
        </div>
        {points.length > 1 && (
          <span className="text-[12px] text-[var(--text-primary)]/85">
            趋势 {trendArrow(points[points.length - 1].value, points[0].value)}
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet" style={{ fontFamily: 'inherit', fontSize: '12px' }}>
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
            <text x={padX - 6} y={y(g) + 3} textAnchor="end" fontSize="12" fill="var(--text-primary)" opacity={0.65}>
              {g.toFixed(1)}
            </text>
          </g>
        ))}
        {/* 面积 */}
        <path d={areaD} fill={gold} opacity={0.1} />
        {/* 折线 */}
        <path d={pathD} fill="none" stroke={gold} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* 数据点 + 标签 */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.value)} r={3.5} fill={gold} stroke="var(--bg-soft)" strokeWidth={1.5} />
            <text x={x(i)} y={y(p.value) - 8} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--text-primary)">
              {(p.value * 100).toFixed(0)}%
            </text>
            <text x={x(i)} y={H - 12} textAnchor="middle" fontSize="12" fill="var(--text-primary)" opacity={0.65}>
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function trendArrow(last: number, first: number): string {
  const delta = last - first;
  if (delta > 0.08) return `↑ 上升 ${((delta) * 100).toFixed(0)}%（趋向收敛）`;
  if (delta < -0.08) return `↓ 下降 ${Math.abs(delta * 100).toFixed(0)}%（趋向发散）`;
  return `→ 基本持平`;
}

export default ConvergenceCurve;
