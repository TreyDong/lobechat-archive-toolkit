import { useMemo } from 'react';
import { useAppStore } from '../stores/useAppStore';

const formatDate = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
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
        {sortedGroups.map((group) => (
          <div key={group.agentId} className="rounded-2xl border border-slate-700/60 bg-slate-900/80 p-4">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-base font-semibold text-indigo-100">{group.agentLabel}</h3>
                <p className="text-xs text-slate-400">
                  {group.sessions.length} 个会话 ·{' '}
                  {group.sessions.reduce((acc, session) => acc + session.topics.length, 0)} 个话题
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {group.sessions.map((session) => (
                <div key={session.sessionId} className="rounded-xl border border-slate-700/50 bg-slate-900/70 p-3">
                  <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                    <div className="text-sm font-medium text-slate-200">{session.sessionLabel}</div>
                    <div className="text-xs text-slate-500">
                      {session.session?.createdAt ? formatDate(session.session.createdAt) : ''}
                    </div>
                  </div>
                  <ul className="mt-3 divide-y divide-slate-800/60 text-sm text-slate-200">
                    {session.topics.map((topic) => {
                      const firstMessage = topic.messages[0];
                      const topicDate =
                        topic.topic?.createdAt ??
                        firstMessage?.createdAt ??
                        firstMessage?.updatedAt ??
                        topic.topic?.updatedAt ??
                        '';
                      return (
                        <li key={topic.topicId} className="flex items-center justify-between gap-4 py-2">
                          <span className="truncate pr-4">{topic.topicLabel}</span>
                          <span className="text-xs text-slate-400 whitespace-nowrap">
                            {formatTopicMeta(topic.messages.length, formatDate(topicDate))}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
