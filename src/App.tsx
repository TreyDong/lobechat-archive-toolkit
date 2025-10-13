import { UploadArea } from './components/UploadArea';
import { StatsOverview } from './components/StatsOverview';
import { AssistantTree } from './components/AssistantTree';
import { ExportPanel } from './components/ExportPanel';
import { LogConsole } from './components/LogConsole';
import { useAppStore } from './stores/useAppStore';

const App = () => {
  const parsed = useAppStore((state) => state.parsed);

  return (
    <div className="min-h-screen bg-slate-950/90 pb-20 text-slate-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pt-20 lg:pt-24">
        <header className="text-center md:text-left">
          <span className="inline-flex items-center rounded-full border border-indigo-500/40 bg-indigo-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">
            LobeChat 工具箱
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-50 md:text-5xl">
            LobeChat 备份一键转换
          </h1>
          <p className="mt-4 max-w-2xl text-base text-slate-300 md:text-lg">
            上传 LobeChat 的 JSON 备份，立即在浏览器内解析、整理，并导出为结构化 Markdown 或同步到 Notion 等常用知识库。
          </p>
        </header>

        <UploadArea />
        <StatsOverview />
        <AssistantTree />
        <ExportPanel />
        <LogConsole />

        {!parsed && (
          <div className="rounded-3xl border border-slate-700/60 bg-slate-900/60 p-10 text-center text-sm text-slate-400">
            上传 LobeChat JSON 文件后，将在此展示解析概览、导出选项与操作日志。
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
