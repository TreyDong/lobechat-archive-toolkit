import { useMemo } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { formatChinaDateTime, parseDateInput } from '../lib/datetime';

const formatDate = (value?: string | null) => {
  return formatChinaDateTime(value ?? null, { includeSeconds: false }) ?? '';
};

const formatTopicMeta = (messageCount: number, date?: string) => {
  const segments = [`${messageCount} 条消息`];
  if (date) {
    segments.push(date);
  }
  return segments.join(' · ');
};

export const AssistantTree = () => {
  const groups = useAppStore((state) => state.parsed?.groups);

  const sortedGroups = useMemo(() => {
    if (!groups) return [];
    return [...groups].sort((a, b) => a.agentLabel.localeCompare(b.agentLabel, 'zh-CN'));
  }, [groups]);

  if (!groups || groups.length === 0) {
    return null;
  }

  return (
    <section className="rounded-3xl border border-slate-700/60 bg-slate-900/70 p-6">
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-slate-100">会话结构预览</h2>
        <p className="text-sm text-slate-400">按助手展开全部话题，便于快速定位内容。</p>
      </header>

      <div className="space-y-5">
        {sortedGroups.map((group) => {
          const agentLabel = group.agentLabel?.trim() || '默认助手';
          const topics = group.sessions
            .flatMap((session) =>
              session.topics.map((topic) => {
                const lastMessage = topic.messages[topic.messages.length - 1];
                const isoTimestamp =
                  topic.topic?.updatedAt ??
                  lastMessage?.updatedAt ??
                  lastMessage?.createdAt ??
                  topic.topic?.createdAt ??
                  '';
                const timestamp = isoTimestamp ? parseDateInput(isoTimestamp)?.getTime() ?? 0 : 0;
                return {
                  id: topic.topicId,
                  label: topic.topicLabel,
                  messageCount: topic.messages.length,
                  timestamp,
                  dateDisplay: isoTimestamp ? formatDate(isoTimestamp) : '',
                };
              }),
            )
            .sort((a, b) => b.timestamp - a.timestamp);

          const topicCount = topics.length;

          return (
            <div key={group.agentId} className="rounded-2xl border border-slate-700/60 bg-slate-900/80 p-4">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <h3 className="text-base font-semibold text-indigo-100">{agentLabel}</h3>
                <p className="text-xs text-slate-400">{topicCount} 个话题</p>
              </div>

              <ul className="mt-4 divide-y divide-slate-800/60 text-sm text-slate-200">
                {topics.map((topic) => (
                  <li key={topic.id} className="flex items-center justify-between gap-4 py-2">
                    <span className="truncate pr-4">{topic.label}</span>
                    <span className="whitespace-nowrap text-xs text-slate-400">
                      {formatTopicMeta(topic.messageCount, topic.dateDisplay)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
};
