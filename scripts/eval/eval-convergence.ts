/**
 * 评测器 3：收敛度 / 立场演进。
 *
 * 浏览器侧 summarizeRound 已用 computeConvergence（纯计算）产出每轮 convergence。
 * 本评测把它与人工标注对比：
 *  - convergence.error_vs_human = |计算收敛度 - 人工标注|
 *  - convergence.trend_match = 相邻轮次方向是否与人工一致（布尔）
 *
 * 人工标注来自 scripts/eval/datasets/convergence-labels.json：
 *  { "sessions": { "<sessionId>": [ { "round": 0, "humanConvergence": 0.2 }, ... ] } }
 */

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fetchTracesBySession, postScore } from './langfuseApi';

interface LabelEntry {
  round: number;
  humanConvergence: number;
}

function loadLabels(sessionId: string): LabelEntry[] {
  const path = resolve(__dirname, 'datasets/convergence-labels.json');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    return [];
  }
  const data = JSON.parse(raw);
  return data?.sessions?.[sessionId] ?? [];
}

export async function evalConvergence(sessionId: string): Promise<void> {
  const traces = (await fetchTracesBySession(sessionId)).filter(
    (t) => t.name?.startsWith('round-summary:'),
  );
  const labels = loadLabels(sessionId);
  if (!labels.length) {
    console.log('[eval-convergence] 无人工标注，跳过（在 scripts/eval/datasets/convergence-labels.json 补充）');
    return;
  }
  console.log(`[eval-convergence] ${traces.length} 条 round-summary，${labels.length} 条人工标注`);

  // 按 round 升序
  const byRound = traces
    .map((t) => ({
      trace: t,
      round: (t.metadata as any)?.round ?? 0,
      computed: ((t.output as any)?.convergence ?? (t.metadata as any)?.convergence ?? 0) as number,
    }))
    .sort((a, b) => a.round - b.round);

  const labelMap = new Map<number, number>(labels.map((l) => [l.round, l.humanConvergence]));
  let prevComputed: number | null = null;
  let prevHuman: number | null = null;

  for (const item of byRound) {
    const human = labelMap.get(item.round);
    if (typeof human !== 'number') {
      console.log(`[eval-convergence] r${item.round} 无标注，跳过`);
      continue;
    }
    const error = Math.abs(item.computed - human);
    await postScore({ traceId: item.trace.id, name: 'convergence.error_vs_human', value: Number(error.toFixed(4)), comment: `computed=${item.computed.toFixed(3)} human=${human.toFixed(3)}` });

    let trendMatch = 0.5;
    if (prevComputed !== null && prevHuman !== null) {
      const computedDir = Math.sign(item.computed - prevComputed);
      const humanDir = Math.sign(human - prevHuman);
      trendMatch = computedDir === humanDir ? 1 : 0;
    }
    await postScore({ traceId: item.trace.id, name: 'convergence.trend_match', value: trendMatch, dataType: 'BOOLEAN', comment: `r${item.round} 方向一致=${trendMatch === 1}` });

    console.log(`[eval-convergence] r${item.round}: computed=${item.computed.toFixed(3)} human=${human.toFixed(3)} err=${error.toFixed(3)} trend=${trendMatch}`);
    prevComputed = item.computed;
    prevHuman = human;
  }
}
