/**
 * 评测器 1：单轮发言质量（LLM-as-judge）。
 *
 * 对每个 `speech:*` trace 重建上下文（议题 / 人设 / 前序发言 / 最终发言 / sources），
 * 用独立 EVAL_LLM_* 打 3 维 0–1 分：
 *  - cross_reference：是否显式回应对方观点
 *  - persona_consistency：语气/立场是否与人设一致
 *  - evidence_truthfulness：sources 是否真实可解析且相关
 * 回写 speech.cross_reference / persona_consistency / evidence_truthfulness / quality(均值)。
 */

import 'dotenv/config';
import {
  fetchObservations,
  fetchTrace,
  fetchTracesBySession,
  postScore,
  type LangfuseTrace,
} from './langfuseApi';

const EVAL_BASE_URL = (process.env.EVAL_LLM_BASE_URL || '').replace(/\/+$/, '');
const EVAL_API_KEY = process.env.EVAL_LLM_API_KEY || '';
const EVAL_MODEL = process.env.EVAL_LLM_MODEL || '';

async function evalChat(system: string, user: string): Promise<string> {
  if (!EVAL_API_KEY || !EVAL_BASE_URL) throw new Error('EVAL_LLM_API_KEY / EVAL_LLM_BASE_URL 未配置');
  const res = await fetch(`${EVAL_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${EVAL_API_KEY}` },
    body: JSON.stringify({
      model: EVAL_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0,
    }),
  });
  if (!res.ok) throw new Error(`eval LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

/** 从 trace input/metadata 重建评判上下文。 */
function extractContext(trace: LangfuseTrace) {
  const meta = (trace.metadata || {}) as Record<string, any>;
  const input = (trace.input || {}) as Record<string, any>;
  return {
    question: input.question || meta.question || '',
    round: meta.round,
    stance: meta.stance,
    agentName: meta.agentName,
    providerKind: meta.providerKind,
  };
}

interface ScoreResult {
  crossReference: number;
  personaConsistency: number;
  evidenceTruthfulness: number;
}

/** 解析 judge 输出为 3 维分数。容错：非法 JSON → 各维度 0.5。 */
function parseScores(raw: string): ScoreResult {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return { crossReference: 0.5, personaConsistency: 0.5, evidenceTruthfulness: 0.5 };
  try {
    const j = JSON.parse(m[0]);
    const clamp = (v: any) => Math.max(0, Math.min(1, Number(v) || 0.5));
    return {
      crossReference: clamp(j.cross_reference),
      personaConsistency: clamp(j.persona_consistency),
      evidenceTruthfulness: clamp(j.evidence_truthfulness),
    };
  } catch {
    return { crossReference: 0.5, personaConsistency: 0.5, evidenceTruthfulness: 0.5 };
  }
}

async function judgeSpeech(
  trace: LangfuseTrace,
  priorSpeeches: string,
  finalAnswer: string,
  sources: { title: string; url: string }[],
): Promise<ScoreResult> {
  const ctx = extractContext(trace);
  const system =
    '你是一位严谨的辩论裁判。对发言在三个维度打 0–1 分（保留两位小数）。' +
    '严格基于证据打分，不要给同情分。只输出 JSON，不要解释：\n' +
    '{"cross_reference":0.0,"persona_consistency":0.0,"evidence_truthfulness":0.0}\n' +
    '维度说明：\n' +
    '- cross_reference：发言是否显式回应/反驳了前序某位发言者的具体观点（首位发言者若阐明核心论点可给 0.6+）\n' +
    '- persona_consistency：语气、关注点、立场是否与给定人设一致\n' +
    '- evidence_truthfulness：若引用了 sources，是否真实（URL 可解析）且与论点相关；未引用则按论点是否可信打分';
  const user =
    `议题：${ctx.question}\n` +
    `发言者：${ctx.agentName}（立场：${ctx.stance}）\n` +
    `前序发言摘要：\n${priorSpeeches || '（无，本发言为首位）'}\n\n` +
    `本发言全文：\n${finalAnswer}\n\n` +
    `引用来源：\n${sources.length ? sources.map((s) => `- ${s.title} ${s.url}`).join('\n') : '（无来源）'}\n\n` +
    `请输出 JSON 评分：`;
  const raw = await evalChat(system, user);
  return parseScores(raw);
}

export async function evalSpeeches(sessionId: string): Promise<void> {
  const traces = (await fetchTracesBySession(sessionId)).filter(
    (t) => t.name?.startsWith('speech:'),
  );
  console.log(`[eval-speech] ${traces.length} 条 speech trace`);

  // 同 session 内按 round 排序的前序发言，用于 cross_reference 评判
  const all = await Promise.all(traces.map((t) => fetchTrace(t.id)));
  const byRoundAsc = [...all].sort((a, b) => {
    const ra = (a.metadata as any)?.round ?? 0;
    const rb = (b.metadata as any)?.round ?? 0;
    return ra - rb;
  });

  for (const trace of byRoundAsc) {
    const ctx = extractContext(trace);
    const prior = byRoundAsc
      .filter((t) => (t.metadata as any)?.round < ctx.round)
      .map((t) => `【${(t.metadata as any)?.agentName}】${typeof t.output === 'string' ? t.output : JSON.stringify(t.output ?? '').slice(0, 200)}`)
      .join('\n');

    // 从 output 取 finalAnswer；从 observations 取 sources
    const finalAnswer = typeof trace.output === 'object' && trace.output
      ? ((trace.output as any).final as string) || ''
      : typeof trace.output === 'string' ? trace.output : '';

    const obs = await fetchObservations(trace.id);
    const sources: { title: string; url: string }[] = [];
    for (const o of obs) {
      const out = o.output as any;
      if (Array.isArray(out)) {
        for (const s of out) {
          if (s?.url) sources.push({ title: s.title || '', url: s.url });
        }
      }
    }

    try {
      const s = await judgeSpeech(trace, prior.slice(0, 2000), finalAnswer, sources);
      const quality = (s.crossReference + s.personaConsistency + s.evidenceTruthfulness) / 3;
      await postScore({ traceId: trace.id, name: 'speech.cross_reference', value: s.crossReference, comment: 'eval-speech' });
      await postScore({ traceId: trace.id, name: 'speech.persona_consistency', value: s.personaConsistency, comment: 'eval-speech' });
      await postScore({ traceId: trace.id, name: 'speech.evidence_truthfulness', value: s.evidenceTruthfulness, comment: 'eval-speech' });
      await postScore({ traceId: trace.id, name: 'speech.quality', value: quality, comment: 'mean of 3 dims' });
      console.log(`[eval-speech] ${ctx.agentName} r${ctx.round}: xref=${s.crossReference.toFixed(2)} persona=${s.personaConsistency.toFixed(2)} evid=${s.evidenceTruthfulness.toFixed(2)} q=${quality.toFixed(2)}`);
    } catch (e: any) {
      console.warn(`[eval-speech] 跳过 ${trace.id}: ${e?.message}`);
    }
  }
}
