/**
 * SearchResolver：把 LLM 想要的检索词，转换成可引用的 Source。
 *
 * 多 Provider 策略：
 *  1. 通过搜索引擎 API 拉真资料：Tavily / Serper / SerpAPI。
 *  2. 都没有则返回空数组（不使用假数据，保持诚实）。
 *  3. 对于支持原生联网的 Provider（Anthropic / Ark），LLM 会直接搜索，
 *     不经过本文件。
 */

import type { Source } from '@/types';

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
  // 3. 无搜索 API Key — 返回空结果（不使用假数据，保持诚实）
  return [];
};

const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
