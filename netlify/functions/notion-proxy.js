const NOTION_BASE = 'https://api.notion.com';

exports.handler = async (event) => {
  try {
    const notionPath = event.path.replace('/.netlify/functions/notion-proxy', '') || '/';
    const query = event.rawQuery ? `?${event.rawQuery}` : '';
    const normalizedPath = notionPath.startsWith('/v1') ? notionPath : `/v1${notionPath}`;
    const targetUrl = `${NOTION_BASE}${normalizedPath}${query}`;

    const headers = {
      'Notion-Version': '2022-06-28',
      'Content-Type': event.headers['content-type'] || 'application/json',
      Authorization: event.headers.authorization || '',
    };

    if (!headers.Authorization) {
      return {
        statusCode: 400,
        body: 'Missing Authorization header. Forward the Notion token as an Authorization header.',
      };
    }

    const fetchInit = {
      method: event.httpMethod,
      headers,
    };

    if (event.httpMethod !== 'GET' && event.body) {
      fetchInit.body = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;
    }

    const response = await fetch(targetUrl, fetchInit);
    const responseBody = await response.text();

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
      },
      body: responseBody,
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: `Notion proxy error: ${(error && error.message) || 'Unknown error'}`,
    };
  }
};
