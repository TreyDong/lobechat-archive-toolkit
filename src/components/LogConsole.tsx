import { useMemo } from 'react';
import { useAppStore } from '../stores/useAppStore';

const levelToColor: Record<string, string> = {
  info: 'text-slate-300',
  success: 'text-emerald-300',
  error: 'text-rose-300',
};

export const LogConsole = () => {
  const logs = useAppStore((state) => state.logs);

  const prettyLogs = useMemo(
    () =>
      logs
        .map((log) => {
          const time = new Date(log.timestamp).toLocaleTimeString();
          return `[${time}] ${log.level.toUpperCase()}: ${log.message}`;
        })
        .join('\n'),
    [logs],
  );

  if (logs.length === 0) return null;

  return (
    <section className="rounded-3xl border border-slate-700/60 bg-slate-900/70 p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">操作日志</h2>
        <button
          type="button"
          className="rounded-full border border-slate-700/60 px-4 py-1 text-xs text-slate-300 hover:border-slate-500/70 hover:text-white"
          onClick={() => navigator.clipboard.writeText(prettyLogs)}
        >
          复制日志
        </button>
      </div>
      <div className="max-h-56 space-y-1 overflow-auto rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4 text-sm font-mono text-slate-300">
        {logs.map((log) => (
          <div key={log.id} className={levelToColor[log.level]}>
            <span className="text-slate-500">
              {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>{' '}
            <span className="uppercase tracking-wide text-xs">{log.level}</span>{' '}
            <span>{log.message}</span>
          </div>
        ))}
      </div>
    </section>
  );
};
