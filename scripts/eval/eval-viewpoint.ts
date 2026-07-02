/**
 * 评测器 2：轮次观点提炼质量。
 *
 * 对每个 `round-summary:*` trace 下的 `viewpoint-extraction:*` generation，
 * 复用浏览器侧同款质量门 isQualityViewpoint（来自 src/engine/viewpointQuality.ts），
 * 判断提炼结果是否照搬原句：
 *  - viewpoint.quality_strict：连续 ≥5 字不照搬 + Jaccard<0.6
 *  - viewpoint.quality_loose：连续 ≥10 字不照搬 + Jaccard<0.8
 *  - viewpoint.jaccard：提炼与原文词集的 Jaccard 相似度（数值）
 *
 * 这样 eval 与生产用同一套判定逻辑，确保评测口径一致。
 */

import 'dotenv/config';
import { jaccard, tokenize } from '../../src/engine/convergence';
import { isQualityViewpoint } from '../../src/engine/viewpointQuality';
import {
  fetchObservations,
  fetchTracesBySession,
  postScore,
  type LangfuseObservation,
} from './langfuseApi';

export async function evalViewpoints(sessionId: string): Promise<void> {
  const traces = (await fetchTracesBySession(sessionId)).filter(
    (t) => t.name?.startsWith('round-summary:'),
  );
  console.log(`[eval-viewpoint] ${traces.length} 条 round-summary trace`);

  for (const trace of traces) {
    const obs = await fetchObservations(trace.id);
    const extractions = obs.filter(
      (o) => o.type === 'GENERATION' && o.name?.startsWith('viewpoint-extraction:'),
    );

    for (const o of extractions) {
      const meta = (o.metadata || {}) as Record<string, any>;
      const originText = meta.originText as string | undefined;
      const agentId = meta.agentId as string | undefined;
      const vp = typeof o.output === 'string' ? o.output : '';
      if (!originText || !agentId || !vp) {
        console.warn(`[eval-viewpoint] 跳过 ${o.id}：缺少 originText/agentId/output`);
        continue;
      }
      const origTokens = tokenize(originText);
      const strict = isQualityViewpoint(vp, originText, origTokens, 5, 0.6);
      const loose = isQualityViewpoint(vp, originText, origTokens, 10, 0.8);
      const sim = jaccard(tokenize(vp), origTokens);

      await postScore({ traceId: trace.id, name: 'viewpoint.quality_strict', value: strict ? 1 : 0, dataType: 'BOOLEAN', comment: `agent ${agentId}` });
      await postScore({ traceId: trace.id, name: 'viewpoint.quality_loose', value: loose ? 1 : 0, dataType: 'BOOLEAN', comment: `agent ${agentId}` });
      await postScore({ traceId: trace.id, name: 'viewpoint.jaccard', value: Number(sim.toFixed(4)), comment: `agent ${agentId}` });
      console.log(`[eval-viewpoint] r${(trace.metadata as any)?.round} ${agentId}: strict=${strict} loose=${loose} jaccard=${sim.toFixed(3)}`);
    }
  }
}

// 显式引用类型，避免 noUnusedLocals 误报（LangfuseObservation 仅做类型提示）
export type _ObsRef = LangfuseObservation;
