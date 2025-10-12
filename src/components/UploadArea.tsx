import { useCallback, useRef, useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { parseLobeChatJson } from '../lib/parser';

const ACCEPTED_TYPES = ['application/json', 'text/json'];

const formatBytes = (bytes: number) => {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
};

export const UploadArea = () => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const {
    sourceFile,
    setSourceFile,
    setParsedData,
    setParsing,
    appendLog,
    reset,
  } = useAppStore();

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;

      if (!ACCEPTED_TYPES.includes(file.type) && !file.name.endsWith('.json')) {
        appendLog('请选择 LobeChat 导出的 JSON 文件', 'error');
        return;
      }

      setParsing(true);
      setSourceFile(file);

      try {
        const text = await file.text();
        const parsed = parseLobeChatJson(text, { sourceFileName: file.name });
        setParsedData(parsed);
        appendLog(`解析成功：${parsed.stats.messageCount} 条消息`, 'success');
      } catch (error) {
        appendLog(`解析失败：${(error as Error).message}`, 'error');
        setParsedData(undefined);
        setSourceFile(undefined);
      } finally {
        setParsing(false);
      }
    },
    [appendLog, setParsedData, setParsing, setSourceFile],
  );

  const onInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(event.target.files);
    },
    [handleFiles],
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      handleFiles(event.dataTransfer.files);
    },
    [handleFiles],
  );

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(true);
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
  }, []);

  const triggerFileDialog = useCallback(() => {
    inputRef.current?.click();
  }, []);

  return (
    <section className="rounded-3xl border border-slate-700/60 bg-slate-900/70 p-8 shadow-xl backdrop-blur transition hover:border-slate-500/60">
      <div
        className={`flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
          dragging ? 'border-indigo-400 bg-indigo-500/10' : 'border-slate-600/70'
        }`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onClick={triggerFileDialog}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            triggerFileDialog();
          }
        }}
      >
        <input
          aria-label="Upload LobeChat backup JSON"
          ref={inputRef}
          type="file"
          accept=".json,application/json,text/json"
          className="hidden"
          onChange={onInputChange}
        />

        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/20">
          <span className="text-2xl">📄</span>
        </div>

        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-slate-100">
            {sourceFile ? '重新上传 LobeChat 备份' : '上传 LobeChat JSON 备份'}
          </h2>
          <p className="text-sm text-slate-400">
            支持拖拽或点击上传。文件仅在浏览器本地解析，不会上传服务器。
          </p>
        </div>

        {sourceFile ? (
          <div className="rounded-full bg-slate-800/70 px-4 py-2 text-sm text-slate-300">
            {sourceFile.name} · {formatBytes(sourceFile.size)}
          </div>
        ) : (
          <div className="rounded-full bg-slate-800/70 px-4 py-2 text-sm text-slate-300">
            接受 .json 文件
          </div>
        )}

        {sourceFile && (
          <button
            type="button"
            className="rounded-full border border-transparent bg-slate-700/60 px-5 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500/70 hover:text-white"
            onClick={(event) => {
              event.stopPropagation();
              reset();
            }}
          >
            清空并重新选择
          </button>
        )}
      </div>
    </section>
  );
};
