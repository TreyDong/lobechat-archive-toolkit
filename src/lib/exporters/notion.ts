import { markdownToBlocks as martianMarkdownToBlocks } from '@tryfabric/martian';
import type { ParsedData, AgentGroup, SessionGroup, TopicGroup } from '../parser';
import { buildMarkdownForTopic } from '../parser';
import type { LogLevel } from '../../stores/useAppStore';
import { formatChinaDateTimeForNotion, parseDateInput } from '../datetime';

export interface NotionExportConfig {
  token: string;
  assistantDatabaseId?: string;
  conversationDatabaseId?: string;
  proxyUrl?: string;
}

export interface NotionExportOptions {
  parsed: ParsedData;
  config: NotionExportConfig;
  log?: (message: string, level?: LogLevel) => void;
  shouldStop?: () => boolean;
}

type NotionRequestInit = Omit<RequestInit, 'body'> & { body?: any };
type NotionRequester = <T = any>(path: string, init?: NotionRequestInit) => Promise<T>;

const NOTION_VERSION = '2022-06-28';
const NOTION_CHILD_LIMIT = 100;
const ASSISTANT_EMOJI = '🤖';
const TOPIC_EMOJI = '💬';

const chunkText = (input: string, maxLength = 1800): string[] => {
  if (!input) return [''];
  const chunks: string[] = [];
  for (let index = 0; index < input.length; index += maxLength) {
    chunks.push(input.slice(index, index + maxLength));
  }
  return chunks.length ? chunks : [''];
};

const chunkArray = <T>(items: T[], size: number): T[][] => {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const TEXT_BLOCK_TYPES = new Set([
  'paragraph',
  'heading_1',
  'heading_2',
  'heading_3',
  'bulleted_list_item',
  'numbered_list_item',
  'to_do',
  'quote',
  'callout',
  'toggle',
]);

const isRichTextItemValid = (item: any) => {
  if (!item || typeof item !== 'object') return false;
  if (item.type === 'text') {
    const content = item.text?.content;
    return typeof content === 'string';
  }
  return true;
};

const createEmptyRichText = () => [
  {
    type: 'text',
    text: { content: '' },
  },
];

const sanitizeBlocks = (blocks: any[]): any[] => {
  if (!Array.isArray(blocks)) return [];
  const validBlocks: any[] = [];

  for (const rawBlock of blocks) {
    if (!rawBlock || typeof rawBlock !== 'object') continue;
    const { type } = rawBlock;
    if (!type || typeof type !== 'string') continue;
    const payload = rawBlock[type];
    if (!payload || typeof payload !== 'object') continue;

    let sanitizedPayload = { ...payload };
    if (TEXT_BLOCK_TYPES.has(type)) {
      const rawRichText = Array.isArray(payload.rich_text) ? payload.rich_text.filter(isRichTextItemValid) : [];
      const hasChildren = Array.isArray(rawBlock.children) && rawBlock.children.length > 0;
      const richText = rawRichText.length ? rawRichText : hasChildren ? createEmptyRichText() : rawRichText;
      if (richText.length === 0 && !hasChildren) continue;
      sanitizedPayload = {
        ...sanitizedPayload,
        rich_text: richText,
      };
    }

    const sanitizedChildren = sanitizeBlocks(rawBlock.children);
    const sanitizedBlock: any = {
      type,
      [type]: sanitizedPayload,
    };
    if (sanitizedChildren.length) {
      sanitizedBlock.children = sanitizedChildren;
    }
    validBlocks.push(sanitizedBlock);
  }

  return validBlocks;
};

type CancellationGuard = () => void;

const createCancellationGuard = (
  shouldStop: (() => boolean) | undefined,
  emit?: (message: string, level?: LogLevel) => void,
): CancellationGuard => {
  let notified = false;
  return () => {
    if (shouldStop?.()) {
      if (!notified) {
        emit?.('检测到停止请求，终止 Notion 导出', 'info');
        notified = true;
      }
      throw new Error('用户已停止 Notion 导出');
    }
  };
};

const markdownToBlocks = (markdown: string) => martianMarkdownToBlocks(markdown);

const toRichText = (text: string) =>
  chunkText(text).map((content) => ({
    type: 'text',
    text: { content },
  }));

const createNotionRequester = (token: string, baseUrl: string): NotionRequester => {
  const normalizedBase = baseUrl.replace(/\/+$/, '');

  return async <T>(path: string, init?: NotionRequestInit): Promise<T> => {
    const response = await fetch(`${normalizedBase}${path}`, {
      method: init?.method ?? 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': NOTION_VERSION,
        ...init?.headers,
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      mode: 'cors',
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Notion API error ${response.status}: ${text}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  };
};

const findTitleProperty = (database: any) => {
  const titleEntry = Object.entries(database.properties).find(([, prop]: any) => prop.type === 'title');
  if (!titleEntry) {
    const name = database.title?.[0]?.plain_text ?? database.id;
    throw new Error(`Database ${name} does not expose a title property`);
  }
  return titleEntry[0];
};

const findAssistantRelationProperty = (conversationDb: any, assistantDbId: string) => {
  const entry = Object.entries(conversationDb.properties).find(
    ([, prop]: any) => prop.type === 'relation' && prop.relation.database_id === assistantDbId,
  );
  if (!entry) {
    throw new Error('Conversation database does not contain a relation property pointing to the assistant database');
  }
  return entry[0];
};

const findSessionRichTextProperty = (conversationDb: any) => {
  const entry = Object.entries(conversationDb.properties).find(
    ([name, prop]: any) => prop.type === 'rich_text' && name.toLowerCase() === 'session',
  );
  return entry ? entry[0] : undefined;
};

const findRichTextPropertyByName = (database: any, targetName: string) => {
  const lower = targetName.toLowerCase();
  const entry = Object.entries(database.properties).find(
    ([name, prop]: any) => prop.type === 'rich_text' && name.toLowerCase() === lower,
  );
  return entry ? entry[0] : undefined;
};

const normalizePropertyName = (input: string) => input.toLowerCase().replace(/\s+/g, '');

const findDatePropertyByNames = (database: any, targetNames: string[]) => {
  const normalizedTargets = targetNames.map(normalizePropertyName);
  const dateEntries = Object.entries(database.properties).filter(([, prop]: any) => prop.type === 'date');
  const direct = dateEntries.find(([name]) => normalizedTargets.includes(normalizePropertyName(name)));
  if (direct) return direct[0];
  const fallback = dateEntries.find(([name]) => {
    const normalized = normalizePropertyName(name);
    return normalized.includes('created') || name.includes('创建');
  });
  return fallback ? fallback[0] : undefined;
};

const getEarliestTimestamp = (timestamps: Array<string | null | undefined>) => {
  const candidates = timestamps
    .map((value) => parseDateInput(value ?? undefined))
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => a.getTime() - b.getTime());
  if (!candidates.length) return undefined;
  return formatChinaDateTimeForNotion(candidates[0]);
};

const getLatestTimestamp = (timestamps: Array<string | null | undefined>) => {
  const candidates = timestamps
    .map((value) => parseDateInput(value ?? undefined))
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime());
  if (!candidates.length) return undefined;
  return formatChinaDateTimeForNotion(candidates[0]);
};

const getTopicFirstTimestamp = (topic: TopicGroup) =>
  getEarliestTimestamp([
    topic.topic?.createdAt,
    topic.topic?.updatedAt,
    ...topic.messages.map((message) => message.createdAt ?? message.updatedAt),
  ]);

const getSessionFirstTimestamp = (sessionGroup: SessionGroup) =>
  getEarliestTimestamp([
    sessionGroup.session?.createdAt,
    sessionGroup.session?.updatedAt,
    ...sessionGroup.topics.map((topic) => getTopicFirstTimestamp(topic)),
  ]);

const getTopicLastTimestamp = (topic: TopicGroup, sessionGroup?: SessionGroup) =>
  getLatestTimestamp([
    ...topic.messages.map((message) => message.updatedAt ?? message.createdAt),
    topic.topic?.updatedAt,
    topic.topic?.createdAt,
    sessionGroup?.session?.updatedAt,
    sessionGroup?.session?.createdAt,
  ]);

const getSessionLastTimestamp = (sessionGroup: SessionGroup) =>
  getLatestTimestamp([
    sessionGroup.session?.updatedAt,
    sessionGroup.session?.createdAt,
    ...sessionGroup.topics.map((topic) => getTopicLastTimestamp(topic, sessionGroup)),
  ]);

const getAssistantFirstTimestamp = (group: AgentGroup) => {
  const agent = group.agent as { createdAt?: string | null; updatedAt?: string | null } | undefined;
  return getEarliestTimestamp([
    agent?.createdAt,
    agent?.updatedAt,
    ...group.sessions.map((session) => getSessionFirstTimestamp(session)),
  ]);
};

const getAssistantLastTimestamp = (group: AgentGroup) => {
  const agent = group.agent as { createdAt?: string | null; updatedAt?: string | null } | undefined;
  return getLatestTimestamp([
    agent?.updatedAt,
    agent?.createdAt,
    ...group.sessions.map((session) => getSessionLastTimestamp(session)),
  ]);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const appendChildren = async (
  client: NotionRequester,
  blockId: string,
  children: any[],
  assertNotCancelled?: CancellationGuard,
) => {
  if (!Array.isArray(children) || children.length === 0) return;
  const sanitized = sanitizeBlocks(children);
  if (!sanitized.length) {
    return;
  }
  const chunks = chunkArray(sanitized, NOTION_CHILD_LIMIT);
  for (const chunk of chunks) {
    assertNotCancelled?.();
    await client(`/blocks/${blockId}/children`, {
      method: 'PATCH',
      body: { children: chunk },
    });
    assertNotCancelled?.();
    await sleep(200);
    assertNotCancelled?.();
  }
};

const findPageInDatabase = async (
  client: NotionRequester,
  databaseId: string,
  filter: Record<string, any>,
  assertNotCancelled?: CancellationGuard,
) => {
  assertNotCancelled?.();
  const response = await client<{ results: Array<any> }>(`/databases/${databaseId}/query`, {
    body: {
      filter,
      page_size: 1,
    },
  });
  assertNotCancelled?.();
  return response.results?.[0];
};

const archivePage = async (client: NotionRequester, pageId: string, assertNotCancelled?: CancellationGuard) => {
  assertNotCancelled?.();
  await client(`/pages/${pageId}`, {
    method: 'PATCH',
    body: { archived: true },
  });
  assertNotCancelled?.();
};

const createPageWithChildren = async (
  client: NotionRequester,
  body: Record<string, any>,
  assertNotCancelled?: CancellationGuard,
) => {
  const { children = [], ...rest } = body;
  const sanitized = sanitizeBlocks(children);
  const initialChildren = sanitized.slice(0, NOTION_CHILD_LIMIT);
  const remainingChildren = sanitized.slice(NOTION_CHILD_LIMIT);

  assertNotCancelled?.();
  const page = await client<{ id: string }>('/pages', {
    body: {
      ...rest,
      ...(initialChildren.length ? { children: initialChildren } : {}),
    },
  });
  assertNotCancelled?.();

  if (remainingChildren.length) {
    await appendChildren(client, page.id, remainingChildren, assertNotCancelled);
  }

  return page;
};

const exportAsPages = async (
  client: NotionRequester,
  groups: AgentGroup[],
  log?: NotionExportOptions['log'],
  shouldStop?: () => boolean,
) => {
  const emit = (message: string, level: LogLevel = 'info') => {
    if (log) log(message, level);
  };
  const assertNotCancelled = createCancellationGuard(shouldStop, emit);

  for (const group of groups) {
    assertNotCancelled();
    emit(`Creating assistant page: ${group.agentLabel}`);
    const assistantPage = await createPageWithChildren(
      client,
      {
        parent: { type: 'workspace', workspace: true },
        icon: { type: 'emoji', emoji: ASSISTANT_EMOJI },
        properties: {
          title: {
            title: [
              {
                type: 'text',
                text: { content: group.agentLabel },
              },
            ],
          },
        },
      },
      assertNotCancelled,
    );
    assertNotCancelled();

    for (const session of group.sessions) {
      assertNotCancelled();
      for (const topic of session.topics) {
        assertNotCancelled();
        const markdown = buildMarkdownForTopic(group.agent, session.session, topic, group.agentLabel, {
          includeMetadata: false,
          includeSystemPrompt: false,
        });
        emit(`  -> Creating topic page: ${topic.topicLabel}`);
        await createPageWithChildren(
          client,
          {
            parent: { page_id: assistantPage.id },
            icon: { type: 'emoji', emoji: TOPIC_EMOJI },
            properties: {
              title: {
                title: [
                  {
                    type: 'text',
                    text: { content: topic.topicLabel },
                  },
                ],
              },
            },
            children: markdownToBlocks(markdown),
          },
          assertNotCancelled,
        );
        assertNotCancelled();
        await sleep(200);
        assertNotCancelled();
      }
    }
  }
};

const exportToDatabases = async (
  client: NotionRequester,
  groups: AgentGroup[],
  assistantDatabaseId: string,
  conversationDatabaseId: string,
  log?: NotionExportOptions['log'],
  shouldStop?: () => boolean,
) => {
  const emit = (message: string, level: LogLevel = 'info') => {
    if (log) log(message, level);
  };
  const assertNotCancelled = createCancellationGuard(shouldStop, emit);

  emit('Reading Notion database schema');
  assertNotCancelled();
  const assistantDb = await client<any>(`/databases/${assistantDatabaseId}`, { method: 'GET' });
  assertNotCancelled();
  const conversationDb = await client<any>(`/databases/${conversationDatabaseId}`, { method: 'GET' });
  assertNotCancelled();

  const assistantTitleProp = findTitleProperty(assistantDb);
  const conversationTitleProp = findTitleProperty(conversationDb);
  const relationProp = findAssistantRelationProperty(conversationDb, assistantDb.id);
  const sessionProp = findSessionRichTextProperty(conversationDb);
  const promptProp = findRichTextPropertyByName(assistantDb, 'prompt');
  const assistantCreatedProp = findDatePropertyByNames(assistantDb, [
    'created date',
    'created at',
    'creation date',
    '创建日期',
    '创建时间',
  ]);
  const assistantUpdatedProp = findDatePropertyByNames(assistantDb, [
    'updated date',
    'updated at',
    'last updated',
    'assistant updated',
    '更新日期',
    '更新时间',
  ]);
  const conversationCreatedProp = findDatePropertyByNames(conversationDb, [
    'created date',
    'created at',
    'creation date',
    'session created',
    'topic created',
    '创建日期',
    '创建时间',
  ]);
  const conversationUpdatedProp = findDatePropertyByNames(conversationDb, [
    'updated date',
    'updated at',
    'last updated',
    'session updated',
    'topic updated',
    '更新日期',
    '更新时间',
  ]);

  for (const group of groups) {
    assertNotCancelled();
    const assistantLabel = group.agentLabel;
    const assistantCreatedAt = getAssistantFirstTimestamp(group);
    const assistantUpdatedAt = getAssistantLastTimestamp(group);
    const assistantProperties: Record<string, any> = {
      [assistantTitleProp]: {
        title: [
          {
            type: 'text',
            text: { content: assistantLabel },
          },
        ],
      },
    };
    if (promptProp && group.agent?.systemRole) {
      assistantProperties[promptProp] = {
        rich_text: toRichText(group.agent.systemRole),
      };
    }
    if (assistantCreatedProp && assistantCreatedAt) {
      assistantProperties[assistantCreatedProp] = {
        date: { start: assistantCreatedAt },
      };
    }
    if (assistantUpdatedProp && assistantUpdatedAt) {
      assistantProperties[assistantUpdatedProp] = {
        date: { start: assistantUpdatedAt },
      };
    }

    const existingAssistant = await findPageInDatabase(
      client,
      assistantDb.id,
      {
        property: assistantTitleProp,
        title: { equals: assistantLabel },
      },
      assertNotCancelled,
    );

    const previousAssistantId = existingAssistant?.id;

    let assistantEntryId: string;
    if (existingAssistant) {
      const existingUpdatedAt =
        assistantUpdatedProp && existingAssistant.properties
          ? existingAssistant.properties[assistantUpdatedProp]?.date?.start ?? undefined
          : undefined;
      const assistantUpToDate = Boolean(
        assistantUpdatedProp && assistantUpdatedAt && existingUpdatedAt === assistantUpdatedAt,
      );

      if (assistantUpToDate) {
        emit(`Assistant up-to-date: ${assistantLabel}`);
        assistantEntryId = existingAssistant.id;
      } else {
        emit(`Refreshing assistant record: ${assistantLabel}`);
        await archivePage(client, existingAssistant.id, assertNotCancelled);
        assertNotCancelled();
        await sleep(200);
        assertNotCancelled();
        const assistantEntry = await createPageWithChildren(
          client,
          {
            parent: { database_id: assistantDb.id },
            icon: { type: 'emoji', emoji: ASSISTANT_EMOJI },
            properties: assistantProperties,
          },
          assertNotCancelled,
        );
        assistantEntryId = assistantEntry.id;
        assertNotCancelled();
        await sleep(200);
        assertNotCancelled();
      }
    } else {
      emit(`Creating assistant record: ${assistantLabel}`);
      const assistantEntry = await createPageWithChildren(
        client,
        {
          parent: { database_id: assistantDb.id },
          icon: { type: 'emoji', emoji: ASSISTANT_EMOJI },
          properties: assistantProperties,
        },
        assertNotCancelled,
      );
      assistantEntryId = assistantEntry.id;
      assertNotCancelled();
      await sleep(200);
      assertNotCancelled();
    }

    for (const session of group.sessions) {
      assertNotCancelled();
      for (const topic of session.topics) {
        assertNotCancelled();
        const markdown = buildMarkdownForTopic(group.agent, session.session, topic, group.agentLabel, {
          includeMetadata: false,
          includeSystemPrompt: false,
        });
        const topicLabel = topic.topicLabel;
        const topicCreatedAt = getTopicFirstTimestamp(topic) ?? getSessionFirstTimestamp(session);
        const topicUpdatedAt = getTopicLastTimestamp(topic, session);
        const properties: Record<string, any> = {
          [conversationTitleProp]: {
            title: [
              {
                type: 'text',
                text: { content: topicLabel },
              },
            ],
          },
          [relationProp]: {
            relation: [{ id: assistantEntryId }],
          },
        };
        if (sessionProp) {
          properties[sessionProp] = {
            rich_text: toRichText(session.sessionLabel),
          };
        }
        if (conversationCreatedProp && topicCreatedAt) {
          properties[conversationCreatedProp] = {
            date: { start: topicCreatedAt },
          };
        }
        if (conversationUpdatedProp && topicUpdatedAt) {
          properties[conversationUpdatedProp] = {
            date: { start: topicUpdatedAt },
          };
        }

        const children = markdownToBlocks(markdown);
        const defaultTopicFilter = {
          and: [
            {
              property: conversationTitleProp,
              title: { equals: topicLabel },
            },
            {
              property: relationProp,
              relation: { contains: assistantEntryId },
            },
          ],
        };

        const topicFilter =
          previousAssistantId && previousAssistantId !== assistantEntryId
            ? {
                or: [
                  defaultTopicFilter,
                  {
                    and: [
                      {
                        property: conversationTitleProp,
                        title: { equals: topicLabel },
                      },
                      {
                        property: relationProp,
                        relation: { contains: previousAssistantId },
                      },
                    ],
                  },
                ],
              }
            : defaultTopicFilter;

        const existingTopic = await findPageInDatabase(
          client,
          conversationDb.id,
          topicFilter,
          assertNotCancelled,
        );

        if (existingTopic) {
          const existingUpdatedAt =
            conversationUpdatedProp && existingTopic.properties
              ? existingTopic.properties[conversationUpdatedProp]?.date?.start ?? undefined
              : undefined;
          const relationIds: string[] = existingTopic.properties?.[relationProp]?.relation?.map(
            (item: any) => item.id,
          );
          const relationMatchesCurrent = relationIds?.includes(assistantEntryId) ?? false;

          if (conversationUpdatedProp && topicUpdatedAt && existingUpdatedAt === topicUpdatedAt && relationMatchesCurrent) {
            emit(`  -> Skipping topic record (no changes): ${topicLabel}`);
            continue;
          }

          emit(`  -> Refreshing topic record: ${topicLabel}`);
          await archivePage(client, existingTopic.id, assertNotCancelled);
          assertNotCancelled();
          await sleep(200);
          assertNotCancelled();
        }

        emit(`  -> Creating topic record: ${topicLabel}`);
        await createPageWithChildren(
          client,
          {
            parent: { database_id: conversationDb.id },
            icon: { type: 'emoji', emoji: TOPIC_EMOJI },
            properties,
            children,
          },
          assertNotCancelled,
        );
        assertNotCancelled();
        await sleep(200);
        assertNotCancelled();
      }
    }
  }
};

export const exportToNotion = async ({ parsed, config, log, shouldStop }: NotionExportOptions) => {
  if (!config.token) {
    throw new Error('缺少 Notion Token');
  }

  if (parsed.groups.length === 0) {
    throw new Error('没有可导出的会话数据');
  }

  const proxyUrl = config.proxyUrl?.trim();
  const baseUrl = proxyUrl ? proxyUrl.replace(/\/+$/, '') : 'https://api.notion.com';
  const pathPrefix = proxyUrl ? '' : '/v1';
  const client = createNotionRequester(config.token, `${baseUrl}${pathPrefix}`);

  const useDatabase = Boolean(config.assistantDatabaseId && config.conversationDatabaseId);

  if (useDatabase) {
    await exportToDatabases(
      client,
      parsed.groups,
      config.assistantDatabaseId!,
      config.conversationDatabaseId!,
      log,
      shouldStop,
    );
  } else {
    await exportAsPages(client, parsed.groups, log, shouldStop);
  }
};
