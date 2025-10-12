import type { ParsedData, AgentGroup } from '../parser';
import { buildMarkdownForTopic } from '../parser';
import type { LogLevel } from '../../stores/useAppStore';

export interface NotionExportConfig {
  token: string;
  assistantDatabaseId?: string;
  conversationDatabaseId?: string;
}

export interface NotionExportOptions {
  parsed: ParsedData;
  config: NotionExportConfig;
  log?: (message: string, level?: LogLevel) => void;
}

const NOTION_VERSION = '2022-06-28';

const chunkText = (input: string, maxLength = 1800): string[] => {
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

type NotionRequestInit = Omit<RequestInit, 'body'> & { body?: any };

const notionFetch = async <T = any>(
  token: string,
  path: string,
  init?: NotionRequestInit,
): Promise<T> => {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    method: init?.method ?? 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
      ...init?.headers,
    },
    body: init?.body ? JSON.stringify(init.body) : init?.body,
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

const exportAsPages = async (groups: AgentGroup[], token: string, log?: NotionExportOptions['log']) => {
  const emit = (message: string, level: LogLevel = 'info') => {
    if (log) log(message, level);
  };

  for (const group of groups) {
    emit(`Creating assistant page: ${group.agentLabel}`);
    const assistantPage = await notionFetch<{ id: string }>(token, '/pages', {
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
        await notionFetch(token, '/pages', {
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
            children: markdownToBlocks(markdown)
          },
        });
        await sleep(200);
      }
    }
  }
};

const exportToDatabases = async (
  groups: AgentGroup[],
  token: string,
  assistantDatabaseId: string,
  conversationDatabaseId: string,
  log?: NotionExportOptions['log'],
) => {
  const emit = (message: string, level: LogLevel = 'info') => {
    if (log) log(message, level);
  };

  emit('Reading Notion database schema');
  const assistantDb = await notionFetch<any>(token, `/databases/${assistantDatabaseId}`, { method: 'GET' });
  const conversationDb = await notionFetch<any>(token, `/databases/${conversationDatabaseId}`, { method: 'GET' });

  const assistantTitleProp = findTitleProperty(assistantDb);
  const conversationTitleProp = findTitleProperty(conversationDb);
  const relationProp = findAssistantRelationProperty(conversationDb, assistantDb.id);
  const sessionProp = findSessionRichTextProperty(conversationDb);

  for (const group of groups) {
    emit(`Writing assistant record: ${group.agentLabel}`);
    const assistantEntry = await notionFetch<{ id: string }>(token, '/pages', {
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

        await notionFetch(token, '/pages', {
          body: {
            parent: { database_id: conversationDb.id },
            properties,
            children: markdownToBlocks(markdown)
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

  const useDatabase = Boolean(config.assistantDatabaseId && config.conversationDatabaseId);

  if (useDatabase) {
    await exportToDatabases(
      parsed.groups,
      config.token,
      config.assistantDatabaseId!,
      config.conversationDatabaseId!,
      log,
    );
  } else {
    await exportAsPages(parsed.groups, config.token, log);
  }
};
