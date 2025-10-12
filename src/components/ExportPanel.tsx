import { useState } from 'react';
import { saveAs } from 'file-saver';
import { createMarkdownArchive } from '../lib/exporters/markdown';
import { useAppStore } from '../stores/useAppStore';

export const ExportPanel = () => {
  const parsed = useAppStore((state) => state.parsed);
  const isExporting = useAppStore((state) => state.isExporting);
  const setExporting = useAppStore((state) => state.setExporting);
  const appendLog = useAppStore((state) => state.appendLog);
  const [notionToken, setNotionToken] = useState('');

  const handleMarkdownExport = async () => {
    if (!parsed) return;
    setExporting(true);
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

  const handleNotionExport = () => {
    if (!parsed) return;
    if (!notionToken.trim()) {
      appendLog('请输入 Notion Integration Token（暂存于本地，不会上传）', 'error');
      return;
    }
    appendLog('Notion 导出功能正在设计中，敬请期待。', 'info');
  };

  if (!parsed) return null;

  return (
    <section className="grid gap-6 rounded-3xl border border-slate-700/60 bg-slate-900/70 p-6 lg:grid-cols-[2fr_3fr]">
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-100">导出选项</h2>
        <p className="text-sm text-slate-400">
          Markdown 压缩包可直接导入 Notion、Obsidian 等。Notion 与其他平台将通过 API 直连（敬请期待）。
        </p>
        <button
          type="button"
          onClick={handleMarkdownExport}
          disabled={isExporting}
          className="inline-flex items-center justify-center rounded-full bg-indigo-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-700"
        >
          {isExporting ? '生成中…' : '下载 Markdown ZIP'}
        </button>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-700/60 bg-slate-900/60 p-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Notion 直连（内测中）</h3>
          <p className="text-xs text-slate-400">
            暂时支持粘贴 Notion Integration Token。数据仅在浏览器本地使用，不会上传。
          </p>
        </div>
        <input
          type="password"
          value={notionToken}
          onChange={(event) => setNotionToken(event.target.value)}
          placeholder="secret_xxx"
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleNotionExport}
            className="rounded-full border border-slate-700/60 px-5 py-2 text-sm text-slate-200 transition hover:border-slate-500/70 hover:text-white"
          >
            同步到 Notion（即将上线）
          </button>
          <button
            type="button"
            onClick={() => setNotionToken('')}
            className="rounded-full border border-transparent px-4 py-2 text-sm text-slate-400 hover:text-slate-200"
          >
            清空
          </button>
        </div>
        <div className="rounded-xl border border-slate-700/60 bg-slate-950/60 p-3 text-xs text-slate-500">
          <p className="font-medium text-slate-300">未来扩展</p>
          <ul className="mt-2 space-y-1 list-disc pl-4">
            <li>飞书 / Docs 平台导出</li>
            <li>自定义 Markdown 模板</li>
            <li>多文件批量合并处理</li>
          </ul>
        </div>
      </div>
    </section>
  );
};
