export type LobeRole = 'assistant' | 'user' | 'tool' | (string & {});

export interface LobeAgent {
  id: string;
  title?: string | null;
  slug?: string | null;
  description?: string | null;
  systemRole?: string | null;
  model?: string | null;
  provider?: string | null;
}

export interface LobeSession {
  id: string;
  title?: string | null;
  slug?: string | null;
  description?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  accessedAt?: string | null;
}

export interface LobeTopic {
  id: string;
  title?: string | null;
  sessionId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface LobeMessage {
  id: string;
  role: LobeRole;
  content: unknown;
  reasoning?: unknown;
  search?: unknown;
  createdAt?: string | null;
  updatedAt?: string | null;
  sessionId?: string | null;
  topicId?: string | null;
}

export interface AgentGroup {
  agentId: string;
  agentLabel: string;
  agent: LobeAgent | undefined;
  sessions: SessionGroup[];
}

export interface SessionGroup {
  sessionId: string;
  sessionLabel: string;
  session: LobeSession | undefined;
  topics: TopicGroup[];
}

export interface TopicGroup {
  topicId: string;
  topicLabel: string;
  topic: LobeTopic | undefined;
  messages: LobeMessage[];
}

export interface ParsedData {
  sourceFileName?: string;
  raw: unknown;
  agents: Record<string, LobeAgent>;
  sessions: Record<string, LobeSession>;
  topics: Record<string, LobeTopic>;
  messagesByTopic: Record<string, LobeMessage[]>;
  groups: AgentGroup[];
  stats: {
    agentCount: number;
    sessionCount: number;
    topicCount: number;
    messageCount: number;
  };
}

export interface MarkdownFile {
  path: string;
  content: string;
}

export interface MarkdownExport {
  indexPath: string;
  files: MarkdownFile[];
}

interface RawLobeChatBackup {
  data?: {
    agents?: LobeAgent[];
    sessions?: LobeSession[];
    topics?: LobeTopic[];
    messages?: LobeMessage[];
    agentsToSessions?: Array<{ agentId?: string; sessionId?: string }>;
  };
}

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]+/g;

const safeFilename = (input: string | null | undefined, fallback: string, maxLength = 80): string => {
  let text = (input ?? fallback ?? 'untitled').trim();
  if (text.length === 0) text = fallback || 'untitled';
  text = text.replace(INVALID_FILENAME_CHARS, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length === 0) text = fallback || 'untitled';
  if (text.length > maxLength) text = text.slice(0, maxLength).trim();
  return text.replace(/\s/g, '_');
};

const bestMessageSnippet = (messages: LobeMessage[]): string | undefined => {
  const sorted = [...messages].sort((a, b) => {
    const aKey = a.createdAt ?? a.updatedAt ?? a.id;
    const bKey = b.createdAt ?? b.updatedAt ?? b.id;
    return (aKey ?? '').localeCompare(bKey ?? '');
  });

  for (const message of sorted) {
    if (message.role === 'user' || message.role === 'assistant') {
      if (typeof message.content === 'string') {
        const stripped = message.content.trim();
        if (stripped) {
          const line = stripped.split('\n')[0];
          if (line.length > 48) {
            return `${line.slice(0, 48).trim()}…`;
          }
          return line;
        }
      }
    }
  }
  return undefined;
};

const deriveAgentLabel = (agent: LobeAgent | undefined, session: LobeSession | undefined) => {
  const candidates = [
    agent?.title,
    agent?.slug,
    agent?.description,
    session?.title,
    session?.slug,
  ];
  const fallback = agent?.id ?? session?.id ?? 'assistant';
  return candidates.find((text) => text && text.trim())?.trim() ?? fallback;
};

const deriveSessionLabel = (
  session: LobeSession | undefined,
  topics: Record<string, TopicGroup>,
  topicOrder: string[],
) => {
  const sessionId = session?.id ?? 'session';
  const datePrefix = session?.createdAt?.slice(0, 10);
  let topicTitle: string | undefined;
  let snippet: string | undefined;

  for (const topicId of topicOrder) {
    const topicGroup = topics[topicId];
    if (!topicGroup) continue;
    if (!topicTitle && topicGroup.topic?.title) {
      topicTitle = topicGroup.topic.title;
    }
    if (!snippet) {
      snippet = bestMessageSnippet(topicGroup.messages);
    }
    if (topicTitle && snippet) break;
  }

  const candidates = [
    topicTitle,
    snippet,
    session?.title,
    session?.slug,
    session?.description,
    sessionId.replace(/^ssn_/, 'session_'),
    sessionId,
  ];

  const chosen = candidates.find((value) => value && value.trim()) ?? 'session';
  if (datePrefix && !chosen.startsWith(datePrefix)) {
    return `${datePrefix} ${chosen}`;
  }
  return chosen;
};

const formatMetadataBlock = (title: string, metadata: Record<string, string | null | undefined>): string[] => {
  const entries = Object.entries(metadata).filter(([, value]) => value);
  if (entries.length === 0) return [];
  const lines = [`## ${title}`, ''];
  for (const [key, value] of entries) {
    lines.push(`- **${key}**: ${value}`);
  }
  lines.push('');
  return lines;
};

const prettifyContent = (raw: unknown): string[] => {
  if (raw === null || raw === undefined || raw === '') {
    return ['_No content provided._', ''];
  }
  if (typeof raw === 'object') {
    try {
      const pretty = JSON.stringify(raw, null, 2);
      return ['```json', pretty, '```', ''];
    } catch {
      return [String(raw), ''];
    }
  }
  const text = String(raw);
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      const pretty = JSON.stringify(parsed, null, 2);
      return ['```json', pretty, '```', ''];
    } catch {
      // fall through
    }
  }
  if (text.includes('\n')) {
    return ['```', text, '```', ''];
  }
  return [text, ''];
};

const formatMessages = (messages: LobeMessage[]): string[] => {
  const lines: string[] = ['## Messages', ''];
  for (const message of messages) {
    const timestamp = message.createdAt ?? message.updatedAt ?? 'unknown time';
    const role = message.role.charAt(0).toUpperCase() + message.role.slice(1);
    lines.push(`### ${timestamp} - ${role}`, '');
    lines.push(...prettifyContent(message.content));
    if (message.reasoning) {
      lines.push('**Reasoning**', '');
      lines.push(...prettifyContent(message.reasoning));
    }
    if (message.search) {
      lines.push('**Search Context**', '');
      lines.push(...prettifyContent(message.search));
    }
  }
  return lines;
};

const ensureUniqueName = (name: string, used: Set<string>): string => {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  let counter = 1;
  let candidate = `${name}_${counter}`;
  while (used.has(candidate)) {
    counter += 1;
    candidate = `${name}_${counter}`;
  }
  used.add(candidate);
  return candidate;
};

const buildTopicGroups = (
  messagesByTopic: Record<string, LobeMessage[]>,
  topics: Record<string, LobeTopic>,
): Record<string, TopicGroup> => {
  const result: Record<string, TopicGroup> = {};
  for (const [topicId, messages] of Object.entries(messagesByTopic)) {
    const sorted = [...messages].sort((a, b) => {
      const aKey = a.createdAt ?? a.updatedAt ?? a.id;
      const bKey = b.createdAt ?? b.updatedAt ?? b.id;
      return (aKey ?? '').localeCompare(bKey ?? '');
    });
    const topic = topics[topicId];
    const topicLabel = topic?.title ?? `Topic_${topicId.slice(-6)}`;
    result[topicId] = {
      topicId,
      topic,
      topicLabel,
      messages: sorted,
    };
  }
  return result;
};

export const parseLobeChatJson = (
  jsonText: string,
  options?: { sourceFileName?: string },
): ParsedData => {
  let parsedUnknown: unknown;
  try {
    parsedUnknown = JSON.parse(jsonText) as RawLobeChatBackup;
  } catch (error) {
    throw new Error(`无法解析 JSON：${(error as Error).message}`);
  }

  if (!parsedUnknown || typeof parsedUnknown !== 'object') {
    throw new Error('JSON 结构不正确：缺少 data 字段');
  }

  const payload = (parsedUnknown as RawLobeChatBackup).data;
  if (!payload) {
    throw new Error('JSON 结构不正确：没有 data 字段');
  }

  const agents = Object.fromEntries((payload.agents ?? []).map((agent) => [agent.id, agent]));
  const sessions = Object.fromEntries((payload.sessions ?? []).map((session) => [session.id, session]));
  const topics = Object.fromEntries((payload.topics ?? []).map((topic) => [topic.id, topic]));

  const messagesByTopic: Record<string, LobeMessage[]> = {};
  const messages = payload.messages ?? [];

  for (const message of messages) {
    if (!message.topicId) {
      continue;
    }
    if (!messagesByTopic[message.topicId]) {
      messagesByTopic[message.topicId] = [];
    }
    messagesByTopic[message.topicId].push(message);
  }

  const topicGroups = buildTopicGroups(messagesByTopic, topics);

  const agentsToSessions = payload.agentsToSessions ?? [];
  const groupedByAgent: Record<string, SessionGroup[]> = {};
  const agentLabels: Record<string, string> = {};

  for (const { agentId, sessionId } of agentsToSessions) {
    if (!agentId || !sessionId) continue;
    const session = sessions[sessionId];
    const relevantTopicIds = Object.keys(topicGroups).filter(
      (topicId) => topics[topicId]?.sessionId === sessionId,
    );
    const topicOrder = relevantTopicIds.sort((a, b) => {
      const aValue = topics[a]?.createdAt ?? topics[a]?.updatedAt ?? a;
      const bValue = topics[b]?.createdAt ?? topics[b]?.updatedAt ?? b;
      return (aValue ?? '').localeCompare(bValue ?? '');
    });
    const topicsMap: Record<string, TopicGroup> = {};
    for (const topicId of topicOrder) {
      topicsMap[topicId] = topicGroups[topicId];
    }

    const sessionLabel = deriveSessionLabel(session, topicsMap, topicOrder);
    if (!groupedByAgent[agentId]) {
      groupedByAgent[agentId] = [];
    }
    groupedByAgent[agentId].push({
      sessionId,
      sessionLabel,
      session,
      topics: topicOrder.map((topicId) => topicsMap[topicId]),
    });

    const agentLabel = deriveAgentLabel(agents[agentId], session);
    agentLabels[agentId] = agentLabel;
  }

  // Some sessions might not be linked via agentsToSessions; handle fallback.
  for (const session of Object.values(sessions)) {
    const alreadyLinked = Object.values(groupedByAgent).some((sessionGroups) =>
      sessionGroups.some((group) => group.sessionId === session.id),
    );
    if (alreadyLinked) continue;

    const relevantTopicIds = Object.keys(topicGroups).filter(
      (topicId) => topics[topicId]?.sessionId === session.id,
    );
    if (relevantTopicIds.length === 0) continue;
    const topicOrder = relevantTopicIds.sort((a, b) => {
      const aValue = topics[a]?.createdAt ?? topics[a]?.updatedAt ?? a;
      const bValue = topics[b]?.createdAt ?? topics[b]?.updatedAt ?? b;
      return (aValue ?? '').localeCompare(bValue ?? '');
    });
    const topicsMap: Record<string, TopicGroup> = {};
    for (const topicId of topicOrder) {
      topicsMap[topicId] = topicGroups[topicId];
    }
    const sessionLabel = deriveSessionLabel(session, topicsMap, topicOrder);
    const fallbackAgentId = `__unassigned__:${session.id}`;
    if (!groupedByAgent[fallbackAgentId]) {
      groupedByAgent[fallbackAgentId] = [];
    }
    groupedByAgent[fallbackAgentId].push({
      sessionId: session.id,
      sessionLabel,
      session,
      topics: topicOrder.map((topicId) => topicsMap[topicId]),
    });
    agentLabels[fallbackAgentId] = session?.title ?? session?.slug ?? '未分配助手';
  }

  const groups: AgentGroup[] = Object.entries(groupedByAgent).map(([agentId, sessionGroups]) => {
    const agent = agents[agentId];
    const agentLabel = agentLabels[agentId] ?? deriveAgentLabel(agent, undefined);
    const sortedSessions = [...sessionGroups].sort((a, b) => {
      const aKey = a.session?.createdAt ?? a.session?.updatedAt ?? a.sessionId;
      const bKey = b.session?.createdAt ?? b.session?.updatedAt ?? b.sessionId;
      return (aKey ?? '').localeCompare(bKey ?? '');
    });
    return {
      agentId,
      agentLabel,
      agent,
      sessions: sortedSessions,
    };
  });

  const stats = {
    agentCount: groups.length,
    sessionCount: Object.keys(sessions).length,
    topicCount: Object.keys(topics).length,
    messageCount: messages.length,
  };

  return {
    sourceFileName: options?.sourceFileName,
    raw: parsedUnknown,
    agents,
    sessions,
    topics,
    messagesByTopic,
    groups,
    stats,
  };
};

const buildMarkdownForTopic = (
  agent: LobeAgent | undefined,
  session: LobeSession | undefined,
  topicGroup: TopicGroup,
  agentLabel: string,
): string => {
  const { topic, topicLabel, messages } = topicGroup;
  const lines: string[] = [`# ${topicLabel}`, ''];

  const sessionMeta = {
    'Session Title': session?.title ?? null,
    'Session Slug': session?.slug ?? null,
    'Session ID': session?.id ?? null,
    'Session Created': session?.createdAt ?? null,
    'Session Updated': session?.updatedAt ?? null,
  };
  lines.push(...formatMetadataBlock('Session', sessionMeta));

  const topicMeta = {
    'Topic ID': topic?.id ?? topicGroup.topicId,
    'Topic Created': topic?.createdAt ?? null,
    'Topic Updated': topic?.updatedAt ?? null,
  };
  lines.push(...formatMetadataBlock('Topic', topicMeta));

  if (agent) {
    const agentMeta = {
      'Agent Title': agent.title ?? agent.slug ?? agentLabel,
      'Agent ID': agent.id,
      Model: agent.model ?? null,
      Provider: agent.provider ?? null,
    };
    lines.push(...formatMetadataBlock('Agent', agentMeta));
    if (agent.systemRole) {
      lines.push('## System Prompt', '');
      lines.push('```', agent.systemRole, '```', '');
    }
  }

  lines.push(...formatMessages(messages));
  return `${lines.join('\n').trimEnd()}\n`;
};

export const buildMarkdownExport = (parsed: ParsedData): MarkdownExport => {
  const files: MarkdownFile[] = [];
  const indexLines = [
    '# LobeChat Conversation Index',
    '',
    parsed.sourceFileName ? `- **Source file**: \`${parsed.sourceFileName}\`` : '',
    '',
  ].filter(Boolean);

  const usedAgentDirNames = new Set<string>();

  for (const group of parsed.groups) {
    const agentDirBase = safeFilename(group.agentLabel, group.agentId);
    const agentDirName = ensureUniqueName(agentDirBase, usedAgentDirNames);
    const usedSessionNames = new Set<string>();
    const agent = group.agent;

    for (const sessionGroup of group.sessions) {
      const sessionDirBase = safeFilename(sessionGroup.sessionLabel, sessionGroup.sessionId);
      const sessionDirName = ensureUniqueName(sessionDirBase, usedSessionNames);
      const usedTopicNames = new Set<string>();

      for (const topicGroup of sessionGroup.topics) {
        const topicFileBase = safeFilename(topicGroup.topicLabel, topicGroup.topicId);
        const topicFileName = ensureUniqueName(topicFileBase, usedTopicNames);
        const path = `${agentDirName}/${sessionDirName}/${topicFileName}.md`;
        files.push({
          path,
          content: buildMarkdownForTopic(agent, sessionGroup.session, topicGroup, group.agentLabel),
        });
        indexLines.push(
          `- [${group.agentLabel} / ${sessionGroup.sessionLabel} / ${topicGroup.topicLabel}](${path}) - ${topicGroup.messages.length} messages`,
        );
      }
    }
  }

  const indexPath = 'index.md';
  files.push({
    path: indexPath,
    content: `${indexLines.join('\n').trimEnd()}\n`,
  });

  return { files, indexPath };
};
