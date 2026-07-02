/**
 * 观点提炼质量门 —— 纯函数，供 summarizeRound（浏览器）与 scripts/eval/eval-viewpoint（Node）共享。
 *
 * 三个判定都基于「原文文本 / 原文词集」，因此调用方需显式传入。
 *  - isQualityViewpoint：照搬检测（连续片段 + Jaccard）
 *  - deCopy：算法去重，删与原文连续 ≥5 字重合的片段
 *  - extractiveCompress：提取式压缩兜底（去套话、取首句）
 *
 * 从 DebateEngine.summarizeRound 的闭包中抽出，行为保持一致。
 */

import { jaccard, tokenize } from '@/engine/convergence';
import { stripLLMArtifacts } from '@/engine/textUtils';

/**
 * 校验单条 viewpoint 质量：存在、非空、且不是照搬原句。
 * 照搬判定（参数化，支持分级放宽）：
 *  - 提炼结果中若含 ≥minCopyLen 字的连续片段原样出现在原文中 → 照搬
 *  - 或与原文词集 Jaccard ≥ maxJaccard → 照搬
 * 满足任一即判不达标。
 *
 * @param origText   原文文本（已 stripLLMArtifacts）
 * @param origTokens 原文词集（tokenize(origText)）
 */
export function isQualityViewpoint(
  vp: string | undefined,
  origText: string,
  origTokens: Set<string>,
  minCopyLen = 5,
  maxJaccard = 0.6,
): boolean {
  if (!vp || !vp.trim()) return false;
  const v = vp.trim();
  if (v.length < 4) return false;
  for (let i = 0; i + minCopyLen <= v.length; i++) {
    if (origText.includes(v.slice(i, i + minCopyLen))) return false;
  }
  const sim = jaccard(tokenize(v), origTokens);
  return sim < maxJaccard;
}

/** 算法去重：从 LLM 输出中删掉与原文连续 ≥5 字重合的片段，保留改写部分。 */
export function deCopy(text: string, original: string): string {
  if (!text) return '';
  const N = 5;
  const remove = new Set<number>();
  for (let i = 0; i + N <= text.length; i++) {
    if (original.includes(text.slice(i, i + N))) {
      for (let j = i; j < i + N; j++) remove.add(j);
    }
  }
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (remove.has(i)) {
      if (out && !out.endsWith(' ')) out += ' ';
    } else {
      out += text[i];
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * 提取式压缩兜底（保证总有总结）：去套话前缀，取首个分句。
 * 这是当 LLM 改写全部失败时的最后保底——产出的是压缩摘录，而非「未能提炼」。
 */
export function extractiveCompress(text: string): string {
  let t = stripLLMArtifacts(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '（发言为空）';
  // 去常见前缀套话
  t = t
    .replace(/^（[^）]*）/, '')
    .replace(/^回应[^，。！？]*[，。！？]/, '')
    .replace(/^兼听[^「]*「[^」]*」[，。！？]?/, '')
    .replace(/^我参考的资料是[\s\S]*?(?=[，。！？]|$)/, '')
    .trim();
  // 取首个分句
  const m = t.match(/^[^，。！；]+[，。！；]?/);
  if (m) t = m[0].trim();
  return t || '（发言过短）';
}
