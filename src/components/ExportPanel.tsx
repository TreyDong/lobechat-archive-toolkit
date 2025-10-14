import { useState } from 'react';
import { saveAs } from 'file-saver';
import { createMarkdownArchive } from '../lib/exporters/markdown';
import { exportToNotion } from '../lib/exporters/notion';
import { useAppStore } from '../stores/useAppStore';

export const ExportPanel = () => {
  const parsed = useAppStore((state) => state.parsed);
  const exportingMode = useAppStore((state) => state.exportingMode);
  const setExporting = useAppStore((state) => state.setExporting);
  const shouldStopExport = useAppStore((state) => state.shouldStopExport);
  const requestExportStop = useAppStore((state) => state.requestExportStop);
  const resetExportStop = useAppStore((state) => state.resetExportStop);
  const appendLog = useAppStore((state) => state.appendLog);

  const [notionToken, setNotionToken] = useState('');
  const [assistantDatabaseId, setAssistantDatabaseId] = useState('');
  const [conversationDatabaseId, setConversationDatabaseId] = useState('');
  const [notionProxyUrl, setNotionProxyUrl] = useState('');
  const [isNotionExportRunning, setNotionExportRunning] = useState(false);
  const isBusy = exportingMode !== 'none';
  const isMarkdownExporting = exportingMode === 'markdown';
  const isNotionExporting = exportingMode === 'notion';

  const handleMarkdownExport = async () => {
    if (!parsed) return;
    setExporting(true, 'markdown');
    resetExportStop();
    appendLog('开始生成 Markdown 压缩包…', 'info');
    try {
      const archive = await createMarkdownArchive(parsed);
      saveAs(archive.blob, archive.fileName);
      appendLog(`导出完成：${archive.fileCount} 个 Markdown 文件`, 'success');
    } catch (error) {
      appendLog(`导出失败：${(error as Error).message}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleNotionExport = async () => {
    if (!parsed) return;
    if (!notionToken.trim()) {
      appendLog('请输入 Notion Integration Token（仅在本地使用，不会上传）', 'error');
      return;
    }
    const useDatabase = assistantDatabaseId.trim() && conversationDatabaseId.trim();
    setExporting(true, 'notion');
    setNotionExportRunning(true);
    resetExportStop();
    appendLog(useDatabase ? '开始同步到 Notion 数据库…' : '开始在 Notion 创建页面…', 'info');
    try {
      await exportToNotion({
        parsed,
        config: {
          token: notionToken.trim(),
          assistantDatabaseId: assistantDatabaseId.trim() || undefined,
          conversationDatabaseId: conversationDatabaseId.trim() || undefined,
          proxyUrl: notionProxyUrl.trim() || undefined,
        },
        log: appendLog,
        shouldStop: () => useAppStore.getState().shouldStopExport,
      });
      appendLog('Notion 导出完成', 'success');
    } catch (error) {
      const message = (error as Error).message || 'Unknown error';
      if (message.includes('Failed to fetch')) {
        appendLog(
          'Notion 导出失败：浏览器无法直接访问 Notion API，请在设置中填写代理地址或改用服务端中转。',
          'error',
        );
      } else if (message === '用户已停止 Notion 导出') {
        appendLog('Notion 导出已停止', 'info');
      } else {
        appendLog(`Notion 导出失败：${message}`, 'error');
      }
    } finally {
      setExporting(false);
      setNotionExportRunning(false);
      resetExportStop();
    }
  };

  if (!parsed) return null;

  return (
    <section className="grid gap-6 rounded-3xl border border-slate-700/60 bg-slate-900/70 p-6 lg:grid-cols-[2fr_3fr]">
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-100">导出选项</h2>
        <p className="text-sm text-slate-400">
          Markdown 压缩包可导入到 Notion、Obsidian 或其他知识库；也可以直接将数据同步到 Notion（支持页面与数据库两种模式）。
        </p>
        <button
          type="button"
          onClick={handleMarkdownExport}
          disabled={isBusy}
          className="inline-flex items-center justify-center rounded-full bg-indigo-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-700"
        >
          {isMarkdownExporting ? '生成中…' : '下载 Markdown ZIP'}
        </button>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-700/60 bg-slate-900/60 p-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Notion 直连</h3>
          <p className="text-xs text-slate-400">
            粘贴集成 Token，立即同步。若同时填写两个数据库 ID，将以“助手数据库 + 对话数据库”方式导入；否则创建父子页面结构。
          </p>
        </div>
        <input
          type="password"
          value={notionToken}
          onChange={(event) => setNotionToken(event.target.value)}
          placeholder="Notion Integration Token（secret_xxx）"
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={assistantDatabaseId}
            onChange={(event) => setAssistantDatabaseId(event.target.value)}
            placeholder="助手数据库 ID（可选）"
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <input
            value={conversationDatabaseId}
            onChange={(event) => setConversationDatabaseId(event.target.value)}
            placeholder="对话数据库 ID（可选）"
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <input
          value={notionProxyUrl}
          onChange={(event) => setNotionProxyUrl(event.target.value)}
          placeholder="Notion API 代理地址（可选，如 https://your-domain.com/.netlify/functions/notion）"
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleNotionExport}
            disabled={isBusy}
            className="rounded-full border border-slate-700/60 px-5 py-2 text-sm text-slate-200 transition hover:border-slate-500/70 hover:text-white disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
          >
            {isNotionExporting ? '同步中…' : '同步到 Notion'}
          </button>
          {(isNotionExportRunning || isNotionExporting) && (
            <button
              type="button"
              onClick={() => {
                if (!shouldStopExport) {
                  requestExportStop();
                  appendLog('已请求停止 Notion 导出，稍后将终止当前任务…', 'info');
                }
              }}
              disabled={shouldStopExport}
              className="rounded-full border border-red-500/60 px-5 py-2 text-sm text-red-300 transition hover:border-red-400 hover:text-red-200 disabled:cursor-not-allowed disabled:border-red-900 disabled:text-red-700"
            >
              {shouldStopExport ? '正在停止…' : '停止导出'}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setNotionToken('');
              setAssistantDatabaseId('');
              setConversationDatabaseId('');
              setNotionProxyUrl('');
            }}
            className="rounded-full border border-transparent px-4 py-2 text-sm text-slate-400 hover:text-slate-200"
          >
            清空
          </button>
        </div>
        <div className="rounded-xl border border-slate-700/60 bg-slate-950/60 p-3 text-xs text-slate-500">
          <p className="font-medium text-slate-300">数据库模式说明</p>
          <ul className="mt-2 space-y-1 list-disc pl-4">
            <li>助手数据库需包含一个 title 属性（任意名称）。</li>
            <li>对话数据库需包含一个 title 属性，以及指向助手数据库的 relation 属性。</li>
            <li>若存在名为 “Session” 的 rich_text 属性，将自动写入会话标题。</li>
            <li>由于 Notion API 不支持浏览器直接跨域访问，部署时需配置代理地址或服务端中转。</li>
          </ul>
        </div>
      </div>
    </section>
  );
};
