/**
 * 议题收敛度计算（Convergence Score ∈ [0,1]）。
 *
 * 设计目标：用一个可解释的复合指标衡量「多 Agent 辩论是否在向共识收敛」，
 * 每轮计算一次，连成曲线展示讨论的收敛轨迹。
 *
 * 复合指标 = 四个归一化分量加权求和（权重和为 1）：
 *
 *  1. 立场趋同 stanceAlignment (0.30)
 *     1 − 归一化熵(本轮 stance 分布)。
 *     全员同立场 → 1；pro/con 完全对半 → 0。
 *     衡量「立场是否趋于一致」。
 *
 *  2. 观点重合 lexicalCohesion (0.30)
 *     本轮各发言内容词集合的两两 Jaccard 均值。
 *     Agent 在用相近词汇/论点 → 高；各说各话 → 低。
 *
 *  3. 认同倾向 agreementTendency (0.25)
 *     认同词数 / (认同词数 + 反对词数)（+1 平滑）。
 *     显式同意 vs 显式反对的信号比。
 *
 *  4. 轮间稳定 interRoundStability (0.15)
 *     本轮与上一轮合并词集的 Jaccard。
 *     立场不再漂移、论点稳定 → 高；首轮无前轮 → 0。
 *
 * 依赖：仅 speech.text / speech.stance，无外部 NLP 库。
 * 中文无分词器，采用「CJK 字符 bigram + 拉丁词」作为内容词单元，
 * 配合停用词过滤，得到稳健的词汇相似度代理。
 */
import type { AgentStance, Speech } from '@/types';

const STOPWORDS = new Set([
  '的', '了', '是', '在', '和', '与', '及', '或', '等', '也', '都', '就', '还',
  '不', '无', '有', '对', '从', '向', '为', '被', '把', '让', '这', '那', '其',
  '之', '而', '但', '且', '如', '若', '则', '于', '以', '可', '能', '会', '要',
  '将', '已', '曾', '更', '最', '很', '太', '我', '你', '他', '她', '它', '们',
  '个', '中', '上', '下', '里', '到', '地', '得', '着', '过', '一', '二', '三',
]);

const AGREE_WORDS = ['同意', '认同', '赞同', '共识', '你说得对', '确实', '有道理', '赞成', '支持', '认可', '附议'];
const DISAGREE_WORDS = ['反对', '不认同', '不同意', '然而', '但是', '谬误', '不敢苟同', '我反对', '质疑', '反驳', '未必', '未必如此'];

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** 从文本提取内容词单元：CJK 字符 bigram + 拉丁词（去停用词）。 */
export function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  if (!text) return tokens;
  const cleaned = text.toLowerCase();

  // 拉丁词（长度 ≥3）
  for (const m of cleaned.match(/[a-z][a-z0-9]{2,}/g) || []) {
    if (!STOPWORDS.has(m)) tokens.add(m);
  }

  // CJK 连续片段做字符 bigram
  for (const seg of cleaned.match(/[一-鿿]+/g) || []) {
    for (let i = 0; i < seg.length - 1; i++) {
      const bg = seg.slice(i, i + 2);
      if (!STOPWORDS.has(bg[0]) && !STOPWORDS.has(bg[1])) tokens.add(bg);
    }
  }
  return tokens;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  const smaller = a.size < b.size ? a : b;
  const larger = a.size < b.size ? b : a;
  for (const t of smaller) if (larger.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** 分量 1：立场趋同 = 1 − 归一化熵。 */
function stanceAlignment(speeches: Speech[]): number {
  if (speeches.length === 0) return 0;
  const counts: Record<string, number> = {};
  for (const s of speeches) counts[s.stance] = (counts[s.stance] || 0) + 1;
  const n = speeches.length;
  const k = Object.keys(counts).length;
  if (k <= 1) return 1;
  let entropy = 0;
  for (const c of Object.values(counts)) {
    const p = c / n;
    entropy -= p * Math.log(p);
  }
  const maxEntropy = Math.log(k); // 均匀分布时的最大熵
  return clamp01(1 - entropy / maxEntropy);
}

/** 分量 2：观点重合 = 本轮各发言两两 Jaccard 均值。 */
function lexicalCohesion(speeches: Speech[]): number {
  const tokenSets = speeches.map((s) => tokenize(s.text));
  if (tokenSets.length < 2) return 0;
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < tokenSets.length; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      sum += jaccard(tokenSets[i], tokenSets[j]);
      pairs++;
    }
  }
  return pairs ? clamp01(sum / pairs) : 0;
}

/** 分量 3：认同倾向 = 认同词 / (认同词 + 反对词)。
 *  高共识时非线性加速 → 当认同远超反对时快速趋近 1。 */
function agreementTendency(speeches: Speech[]): number {
  const text = speeches.map((s) => s.text).join('');
  let agree = 0;
  let disagree = 0;
  for (const w of AGREE_WORDS) {
    const c = countOccurrences(text, w);
    if (c) agree += c;
  }
  for (const w of DISAGREE_WORDS) {
    const c = countOccurrences(text, w);
    if (c) disagree += c;
  }
  if (agree + disagree === 0) return 0.3; // 无明确信号，偏低
  const ratio = (agree + 1) / (agree + disagree + 2);
  // 非线性加速：ratio > 0.6 后加速趋近 1
  if (ratio > 0.6) {
    return clamp01(0.6 + (ratio - 0.6) * 2.5);
  }
  return clamp01(ratio);
}

/** 分量 4：轮间稳定 = 本轮与上一轮合并词集 Jaccard。 */
function interRoundStability(thisRound: Speech[], prevRound: Speech[]): number {
  if (prevRound.length === 0) return 0;
  const a = tokenize(thisRound.map((s) => s.text).join(' '));
  const b = tokenize(prevRound.map((s) => s.text).join(' '));
  return clamp01(jaccard(a, b));
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

const WEIGHTS = {
  stance: 0.10,
  cohesion: 0.20,
  agreement: 0.50,
  stability: 0.20,
};

export interface ConvergenceBreakdown {
  score: number;
  stanceAlignment: number;
  lexicalCohesion: number;
  agreementTendency: number;
  interRoundStability: number;
}

/**
 * 计算某轮的收敛度。
 * @param thisRound 本轮发言
 * @param prevRound 上一轮发言（首轮传 []）
 */
export function computeConvergence(
  thisRound: Speech[],
  prevRound: Speech[] = [],
): ConvergenceBreakdown {
  const sAlign = stanceAlignment(thisRound);
  const lCohesion = lexicalCohesion(thisRound);
  const aTendency = agreementTendency(thisRound);
  const iStability = interRoundStability(thisRound, prevRound);

  const score = clamp01(
    sAlign * WEIGHTS.stance +
      lCohesion * WEIGHTS.cohesion +
      aTendency * WEIGHTS.agreement +
      iStability * WEIGHTS.stability,
  );

  // 共识加成：当认同倾向很高且轮间稳定时，额外加分
  const consensusBoost = aTendency > 0.75 && iStability > 0.3 ? (aTendency - 0.75) * 0.3 : 0;

  return {
    score: clamp01(score + consensusBoost),
    stanceAlignment: sAlign,
    lexicalCohesion: lCohesion,
    agreementTendency: aTendency,
    interRoundStability: iStability,
  };
}

/** 便捷：按轮次分组计算整场收敛曲线。 */
export function computeConvergenceCurve(speeches: Speech[]): number[] {
  const rounds = [...new Set(speeches.map((s) => s.round))].sort((a, b) => a - b);
  const byRound = (r: number) => speeches.filter((s) => s.round === r);
  return rounds.map((r, i) => computeConvergence(byRound(r), i > 0 ? byRound(rounds[i - 1]) : []).score);
}

// 显式导出 stance 占比供 UI 使用
export function stanceDistribution(speeches: Speech[]): Record<AgentStance, number> {
  const out: Record<AgentStance, number> = { pro: 0, con: 0, neutral: 0 };
  if (speeches.length === 0) return out;
  for (const s of speeches) out[s.stance] += 1;
  return out;
}
