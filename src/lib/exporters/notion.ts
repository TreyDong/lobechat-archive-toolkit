import type { ParsedData, AgentGroup } from '../parser';
import { buildMarkdownForTopic } from '../parser';
import type { LogLevel } from '../../stores/useAppStore';

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
}

type NotionRequestInit = Omit<RequestInit, 'body'> & { body?: any };
type NotionRequester = <T = any>(path: string, init?: NotionRequestInit) => Promise<T>;

const NOTION_VERSION = '2022-06-28';

const chunkText = (input: string, maxLength = 1800): string[] => {
  if (!input) return [''];
  const chunks: string[] = [];
  for (let index = 0; index < input.length; index += maxLength) {
    chunks.push(input.slice(index, index + maxLength));
  }
  return chunks.length ? chunks : [''];
};

const markdownToBlocks = (markdown: string) =>
  chunkText(markdown).map((content) => ({
    object: 'block',
    type: 'code',
    code: {
      language: 'markdown',
      rich_text: [
        {
          type: 'text',
          text: { content },
        },
      ],
    },
  }));

const createNotionRequester = (token: string, baseUrl: string): NotionRequester => {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  return async <T>(
    path: string,
    init?: NotionRequestInit,
  ): Promise<T> => {
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const exportAsPages = async (
  client: NotionRequester,
  groups: AgentGroup[],
  log?: NotionExportOptions['log'],
) => {
  const emit = (message: string, level: LogLevel = 'info') => {
    if (log) log(message, level);
  };

  for (const group of groups) {
    emit(`Creating assistant page: ${group.agentLabel}`);
    const assistantPage = await client<{ id: string }>('/pages', {
      body: {
        parent: { type: 'workspace', workspace: true },
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
    });

    for (const session of group.sessions) {
      for (const topic of session.topics) {
        const markdown = buildMarkdownForTopic(group.agent, session.session, topic, group.agentLabel);
        emit(`  -> Creating topic page: ${topic.topicLabel}`);
        await client('/pages', {
          body: {
            parent: { page_id: assistantPage.id },
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
        });
        await sleep(200);
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
) => {
  const emit = (message: string, level: LogLevel = 'info') => {
    if (log) log(message, level);
  };

  emit('Reading Notion database schema');
  const assistantDb = await client<any>(`/databases/${assistantDatabaseId}`, { method: 'GET' });
  const conversationDb = await client<any>(`/databases/${conversationDatabaseId}`, { method: 'GET' });

  const assistantTitleProp = findTitleProperty(assistantDb);
  const conversationTitleProp = findTitleProperty(conversationDb);
  const relationProp = findAssistantRelationProperty(conversationDb, assistantDb.id);
  const sessionProp = findSessionRichTextProperty(conversationDb);

  for (const group of groups) {
    emit(`Writing assistant record: ${group.agentLabel}`);
    const assistantEntry = await client<{ id: string }>('/pages', {
      body: {
        parent: { database_id: assistantDb.id },
        properties: {
          [assistantTitleProp]: {
            title: [
              {
                type: 'text',
                text: { content: group.agentLabel },
              },
            ],
          },
        },
      },
    });
    await sleep(200);

    for (const session of group.sessions) {
      for (const topic of session.topics) {
        const markdown = buildMarkdownForTopic(group.agent, session.session, topic, group.agentLabel);
        emit(`  -> Writing topic record: ${topic.topicLabel}`);
        const properties: Record<string, any> = {
          [conversationTitleProp]: {
            title: [
              {
                type: 'text',
                text: { content: topic.topicLabel },
              },
            ],
          },
          [relationProp]: {
            relation: [{ id: assistantEntry.id }],
          },
        };
        if (sessionProp) {
          properties[sessionProp] = {
            rich_text: [
              {
                type: 'text',
                text: { content: session.sessionLabel },
              },
            ],
          };
        }

        await client('/pages', {
          body: {
            parent: { database_id: conversationDb.id },
            properties,
            children: markdownToBlocks(markdown),
          },
        });
        await sleep(200);
      }
    }
  }
};

export const exportToNotion = async ({ parsed, config, log }: NotionExportOptions) => {
  if (!config.token) {
    throw new Error('缺少 Notion Token');
  }

  if (parsed.groups.length === 0) {
    throw new Error('没有可导出的会话数据');
  }

  const baseUrl = (config.proxyUrl && config.proxyUrl.trim()) || 'https://api.notion.com';
  const client = createNotionRequester(config.token, baseUrl);

  const useDatabase = Boolean(config.assistantDatabaseId && config.conversationDatabaseId);

  if (useDatabase) {
    await exportToDatabases(
      client,
      parsed.groups,
      config.assistantDatabaseId!,
      config.conversationDatabaseId!,
      log,
    );
  } else {
    await exportAsPages(client, parsed.groups, log);
  }
};
