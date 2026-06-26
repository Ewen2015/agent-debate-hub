import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { normalizeText } from '@/engine/textUtils';

/**
 * 统一的 Markdown 渲染组件。
 *
 * 设计要点（简洁易读）：
 *  - 渲染前先 normalizeText，杜绝 LLM 输出里的多余空行/首尾空白
 *  - 不使用 whitespace-pre-wrap：由 markdown 而非原始换行控制结构，
 *    避免「pre-wrap 保留换行」与「markdown 段落边距」叠加撑高气泡
 *  - 单一的 components 覆盖，消除各处重复的 ReactMarkdown 配置
 *
 * 颜色/字体等差异通过 className 传入（如思考用 mono + gold）。
 */
export function Markdown({ children, className = '' }: { children: string; className?: string }) {
  return (
    <div className={`prose-compact m-0 break-words ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node, ...props }) => (
            <a
              {...props}
              className="text-[var(--accent-emerald)] hover:text-[var(--text-primary)] transition-colors"
              target="_blank"
              rel="noreferrer"
            />
          ),
          code: (props: any) => {
            const inline = Boolean(props.inline);
            const { node, inline: _inline, ...rest } = props;
            return (
              <code
                {...rest}
                className={`rounded px-1 py-0.5 ${
                  inline ? 'bg-[var(--bg-card-strong)]' : 'bg-[var(--bg-soft)] block p-2'
                }`}
              />
            );
          },
        }}
      >
        {normalizeText(children)}
      </ReactMarkdown>
    </div>
  );
}
