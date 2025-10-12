import { useMemo } from 'react';
import { useAppStore } from '../stores/useAppStore';

const formatDate = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}/${month}/${day} ${hour}:${minute}`;
};

const formatTopicMeta = (messageCount: number, date?: string) => {
  const parts = [`${messageCount} 条消息`];
  if (date) {
    parts.push(date);
  }
  return parts.join(' · ');
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
          const topics = group.sessions.flatMap((session) =>
            session.topics.map((topic) => {
              const firstMessage = topic.messages[0];
              const topicDate =
                topic.topic?.createdAt ??
                firstMessage?.createdAt ??
                firstMessage?.updatedAt ??
                topic.topic?.updatedAt ??
                '';
              return {
                id: topic.topicId,
                label: topic.topicLabel,
                messageCount: topic.messages.length,
                date: formatDate(topicDate),
              };
            }),
          );

          const topicCount = topics.length;

          return (
            <div key={group.agentId} className="rounded-2xl border border-slate-700/60 bg-slate-900/80 p-4">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <h3 className="text-base font-semibold text-indigo-100">{group.agentLabel}</h3>
                <p className="text-xs text-slate-400">{topicCount} 个话题</p>
              </div>

              <ul className="mt-4 divide-y divide-slate-800/60 text-sm text-slate-200">
                {topics.map((topic) => (
                  <li key={topic.id} className="flex items-center justify-between gap-4 py-2">
                    <span className="truncate pr-4">{topic.label}</span>
                    <span className="whitespace-nowrap text-xs text-slate-400">
                      {formatTopicMeta(topic.messageCount, topic.date)}
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
