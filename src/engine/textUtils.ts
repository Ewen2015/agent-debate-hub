/**
 * 文本规范化工具：保证展示给用户的 LLM 输出「简洁易读」。
 *
 * 解决对话框内空行过多的问题：
 *  - 统一换行符
 *  - 折叠 3 个及以上连续换行为至多一个空行
 *  - 去除首尾空行与每行尾随空白
 *  - 折叠多余空格
 *
 * 所有展示 LLM 文本的地方都应先经过 normalizeText。
 */
export function normalizeText(input = ''): string {
  if (!input) return '';
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '')
    .replace(/ {3,}/g, ' ');
}
