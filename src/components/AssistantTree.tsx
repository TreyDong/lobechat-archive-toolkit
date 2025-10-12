import { useMemo, useState } from 'react';
import { Transition } from '@headlessui/react';
import { useAppStore } from '../stores/useAppStore';

const ExpandIcon = ({ expanded }: { expanded: boolean }) => (
  <span
    className={`inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-600/70 text-xs transition ${
      expanded ? 'bg-indigo-500/30 text-indigo-200 border-indigo-500/50' : 'text-slate-300'
    }`}
  >
    {expanded ? '−' : '+'}
  </span>
);

export const AssistantTree = () => {
  const groups = useAppStore((state) => state.parsed?.groups);
  const [expandedAgents, setExpandedAgents] = useState<Record<string, boolean>>({});
  const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({});

  const sortedGroups = useMemo(() => {
    if (!groups) return [];
    return [...groups].sort((a, b) => a.agentLabel.localeCompare(b.agentLabel, 'zh-CN'));
  }, [groups]);

  if (!groups || groups.length === 0) {
    return null;
  }

  return (
    <section className="rounded-3xl border border-slate-700/60 bg-slate-900/70 p-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">会话结构预览</h2>
          <p className="text-sm text-slate-400">按助手 → 会话 → 话题 展示解析结果</p>
        </div>
        <button
          type="button"
          className="rounded-full border border-slate-700/60 px-4 py-1.5 text-sm text-slate-300 hover:border-slate-500/70 hover:text-white"
          onClick={() => {
            setExpandedAgents({});
            setExpandedSessions({});
          }}
        >
          全部折叠
        </button>
      </header>

      <div className="space-y-3">
        {sortedGroups.map((group) => {
          const isExpanded = expandedAgents[group.agentId] ?? true;
          return (
            <div key={group.agentId} className="rounded-2xl border border-slate-700/60 bg-slate-900/80 p-4">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 text-left"
                onClick={() =>
                  setExpandedAgents((prev) => ({ ...prev, [group.agentId]: !(prev[group.agentId] ?? true) }))
                }
              >
                <div>
                  <h3 className="text-base font-semibold text-indigo-100">{group.agentLabel}</h3>
                  <p className="text-xs text-slate-400">
                    {group.sessions.length} 个会话 ·{' '}
                    {group.sessions.reduce((acc, session) => acc + session.topics.length, 0)} 个话题
                  </p>
                </div>
                <ExpandIcon expanded={isExpanded} />
              </button>

              <Transition
                show={isExpanded}
                enter="transition-all duration-200"
                enterFrom="max-h-0 opacity-0"
                enterTo="max-h-screen opacity-100"
                leave="transition-all duration-150"
                leaveFrom="max-h-screen opacity-100"
                leaveTo="max-h-0 opacity-0"
              >
                <div className="mt-3 space-y-2">
                  {group.sessions.map((session) => {
                    const sessionKey = `${group.agentId}:${session.sessionId}`;
                    const sessionExpanded = expandedSessions[sessionKey] ?? true;
                    return (
                      <div key={session.sessionId} className="rounded-xl border border-slate-700/50 bg-slate-900/70 p-3">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 text-left"
                          onClick={() =>
                            setExpandedSessions((prev) => ({
                              ...prev,
                              [sessionKey]: !(prev[sessionKey] ?? true),
                            }))
                          }
                        >
                          <div>
                            <p className="font-medium text-slate-100">{session.sessionLabel}</p>
                            <p className="text-xs text-slate-500">
                              {session.topics.length} 个话题
                              {session.session?.createdAt ? ` · ${new Date(session.session.createdAt).toLocaleString()}` : ''}
                            </p>
                          </div>
                          <ExpandIcon expanded={sessionExpanded} />
                        </button>
                        {sessionExpanded && (
                          <ul className="mt-2 space-y-1 pl-4 text-sm text-slate-300">
                            {session.topics.map((topic) => (
                              <li key={topic.topicId} className="flex justify-between gap-4">
                                <span>{topic.topicLabel}</span>
                                <span className="text-xs text-slate-500">
                                  {topic.messages.length} 条消息
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Transition>
            </div>
          );
        })}
      </div>
    </section>
  );
};
