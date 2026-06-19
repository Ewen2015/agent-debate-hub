/**
 * SearchResolver：把 LLM 想要的检索词，转换成可引用的 Source。
 *
 * 多 Provider 策略：
 *  1. 若 LLM Provider 是 Ark Coding Plan，直接让模型自己联网（web_search tool）。
 *     这种情况本文件不被调用。
 *  2. 否则通过搜索引擎 API 拉真资料：Tavily / Serper / SerpAPI。
 *  3. 都没有则降级到本地 Mock 语料（标注"演示数据"）。
 */

import type { Source } from '@/types';
import { SEARCH_CORPUS } from '@/data/corpus';

const TAVILY_API = 'https://api.tavily.com/search';
const SERPER_API = 'https://google.serper.dev/search';

const getKey = (name: string) =>
  (import.meta as any).env?.[`VITE_${name}`] as string | undefined;

interface ResolverConfig {
  tavilyKey?: string;
  serperKey?: string;
  serpApiKey?: string;
}

const cfg: ResolverConfig = {
  tavilyKey: getKey('TAVILY_API_KEY'),
  serperKey: getKey('SERPER_API_KEY'),
  serpApiKey: getKey('SERP_API_KEY'),
};

export async function resolveSource(query: string, recencyDays?: number): Promise<Source[]> {
  // 1. Tavily
  if (cfg.tavilyKey) {
    try {
      const res = await fetch(TAVILY_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: cfg.tavilyKey,
          query,
          max_results: 4,
          days: recencyDays || 365,
          include_raw_content: false,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const results = data.results || [];
        return results.slice(0, 3).map((r: any) => ({
          title: r.title || '',
          url: r.url || '',
          domain: domainOf(r.url || ''),
          snippet: r.content?.slice(0, 240) || '',
        }));
      }
    } catch {}
  }
  // 2. Serper
  if (cfg.serperKey) {
    try {
      const res = await fetch(SERPER_API, {
        method: 'POST',
        headers: {
          'X-API-KEY': cfg.serperKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: query, num: 5 }),
      });
      if (res.ok) {
        const data = await res.json();
        const results = data.organic || [];
        return results.slice(0, 3).map((r: any) => ({
          title: r.title || '',
          url: r.link || '',
          domain: domainOf(r.link || ''),
          snippet: r.snippet || '',
        }));
      }
    } catch {}
  }
  // 3. Mock 降级
  return mockSearch(query);
}

const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

const mockSearch = (query: string): Source[] => {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);
  const scored = SEARCH_CORPUS.map((s) => {
    const hay = (s.title + ' ' + s.snippet).toLowerCase();
    let score = 0;
    for (const t of tokens) if (hay.includes(t)) score += 2;
    return { s, score };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return scored.map((x) => ({ ...x.s, snippet: `[演示数据] ${x.s.snippet}` }));
};
