/**
 * Langfuse REST API 客户端（Node，仅评测脚本使用）。
 *
 * 安全：本文件用 LANGFUSE_SECRET_KEY（无 VITE_ 前缀，绝不打包进浏览器）。
 * Basic auth = base64(publicKey:secretKey)。
 */

import 'dotenv/config';

const BASE_URL = (process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com').replace(/\/+$/, '');
const PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY || process.env.VITE_LANGFUSE_PUBLIC_KEY || '';
const SECRET_KEY = process.env.LANGFUSE_SECRET_KEY || '';

if (!PUBLIC_KEY || !SECRET_KEY) {
  console.warn('[langfuseApi] LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY 未配置，REST 调用将失败。');
}

const authHeader = () => 'Basic ' + Buffer.from(`${PUBLIC_KEY}:${SECRET_KEY}`).toString('base64');

export interface LangfuseTrace {
  id: string;
  name: string;
  sessionId?: string | null;
  userId?: string | null;
  tags?: string[];
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  observations?: LangfuseObservation[];
}

export interface LangfuseObservation {
  id: string;
  traceId: string;
  parentObservationId?: string | null;
  type: 'SPAN' | 'GENERATION' | 'EVENT';
  name?: string;
  startTime?: string;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  model?: string;
  usage?: { input?: number; output?: number };
}

export interface ScoreBody {
  traceId: string;
  name: string;
  value: number;
  comment?: string;
  dataType?: 'NUMERIC' | 'CATEGORICAL' | 'BOOLEAN';
  source?: 'EXTERNAL' | 'API' | 'EVAL';
}

async function lfFetch(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(),
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Langfuse ${res.status} ${path}: ${txt.slice(0, 300)}`);
  }
  return res.json();
}

/** 取某 session 下全部 traces（自动翻页）。 */
export async function fetchTracesBySession(sessionId: string): Promise<LangfuseTrace[]> {
  const all: LangfuseTrace[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const data = await lfFetch(`/api/public/traces?sessionId=${encodeURIComponent(sessionId)}&limit=${limit}&offset=${offset}`);
    const items: LangfuseTrace[] = data.data ?? [];
    all.push(...items);
    if (items.length < limit) break;
    offset += limit;
  }
  return all;
}

/** 取单条 trace（含 observations）。 */
export async function fetchTrace(traceId: string): Promise<LangfuseTrace> {
  return lfFetch(`/api/public/traces/${encodeURIComponent(traceId)}`);
}

/** 取某 trace 的 observations。 */
export async function fetchObservations(traceId: string): Promise<LangfuseObservation[]> {
  const data = await lfFetch(`/api/public/observations?traceId=${encodeURIComponent(traceId)}&limit=100`);
  return data.data ?? [];
}

/** 回写评分。 */
export async function postScore(body: ScoreBody): Promise<void> {
  await lfFetch('/api/public/scores', {
    method: 'POST',
    body: JSON.stringify({
      traceId: body.traceId,
      name: body.name,
      value: body.value,
      comment: body.comment,
      dataType: body.dataType ?? 'NUMERIC',
      source: body.source ?? 'EXTERNAL',
    }),
  });
}
