const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const mcpManager = require('./mcp/manager');
const FixAgent = require('./agents/FixAgent');
const { markdownToADF, parseJiraMarkdown } = require('./jiraHelpers');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// --- Jira REST API helper (direct, for avatar/project data not exposed by MCP) ---
const _jiraAvatarCache = new Map();

async function jiraREST(urlPath) {
    const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
    const url = `${process.env.JIRA_BASE_URL}/rest/api/3${urlPath}`;
    const res = await fetch(url, {
        headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error(`Jira REST ${res.status}: ${urlPath}`);
    return res.json();
}

// Fetch real assignee/reporter/project avatars from Jira REST API
async function augmentAvatars(data, ticketKey) {
    try {
        const issue = await jiraREST(`/issue/${ticketKey}?fields=assignee,reporter,project`);
        const f = issue.fields || {};
        if (f.assignee) {
            data.fields.assignee = {
                displayName: f.assignee.displayName,
                avatarUrls: f.assignee.avatarUrls,
            };
        }
        if (f.reporter) {
            data.fields.reporter = {
                displayName: f.reporter.displayName,
                avatarUrls: f.reporter.avatarUrls,
            };
        }
        if (f.project) {
            // Project avatar URL requires Jira auth — rewrite to our proxy
            const raw48 = f.project.avatarUrls?.['48x48'] || '';
            const avatarIdMatch = raw48.match(/avatar\/(\d+)/);
            const BASE = `http://localhost:${process.env.PORT || 3001}`;
            const proxied = avatarIdMatch
                ? `${BASE}/api/jira/project-avatar/${avatarIdMatch[1]}`
                : raw48;
            data.fields.project = {
                name: f.project.name,
                key: f.project.key,
                avatarUrls: { '24x24': proxied, '48x48': proxied },
            };
        }
    } catch (e) {
        console.warn(`Could not augment avatars for ${ticketKey}:`, e.message);
    }
    return data;
}

// Lookup and cache a Jira user's avatar URL by display name
async function getUserAvatarUrl(displayName) {
    if (_jiraAvatarCache.has(displayName)) return _jiraAvatarCache.get(displayName);
    const fallback = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}`;
    try {
        const results = await jiraREST(`/users/search?query=${encodeURIComponent(displayName)}&maxResults=3`);
        const user = results.find(u => u.displayName === displayName) || results[0];
        const url = user?.avatarUrls?.['24x24'] || fallback;
        _jiraAvatarCache.set(displayName, url);
        return url;
    } catch {
        _jiraAvatarCache.set(displayName, fallback);
        return fallback;
    }
}

// Initialize MCP Manager
mcpManager.init().catch(err => console.error('MCP Init Error:', err));

// Active agent sessions keyed by ticketId
const activeAgents = new Map();

// Middleware to wait for MCP readiness
const waitForMCP = (req, res, next) => {
    if (mcpManager.isReady) return next();
    
    console.log('⏳ Waiting for MCP initialization...');
    let checks = 0;
    const interval = setInterval(() => {
        checks++;
        if (mcpManager.isReady) {
            clearInterval(interval);
            return next();
        }
        if (checks > 20) { // 10 seconds timeout
            clearInterval(interval);
            return res.status(503).json({ error: 'MCP servers taking too long to initialize' });
        }
    }, 500);
};

app.use('/api', waitForMCP);

// --- Jira Helper: Parse comments from jira_comments markdown response ---
function parseMarkdownComments(text) {
    const comments = [];
    const blocks = text.split(/\n## Comment \d+\s*-\s*/);
    for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i];
        const nlIdx = block.indexOf('\n');
        const header = nlIdx !== -1 ? block.substring(0, nlIdx) : block;
        const bodyText = nlIdx !== -1 ? block.substring(nlIdx + 1).trim() : '';
        const authorMatch = header.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
        const authorName = authorMatch ? authorMatch[1].trim() : header.trim();
        const createdStr = authorMatch ? authorMatch[2].trim() : null;
        comments.push({
            id: `comment-${i}-${Date.now()}`,
            author: {
                displayName: authorName,
                avatarUrls: { '24x24': `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(authorName)}` }
            },
            body: { type: 'doc', version: 1, content: markdownToADF(bodyText) },
            created: createdStr,
            updated: null,
        });
    }
    return comments;
}

// --- Jira Helper: Parse attachments from jira_attachments markdown table response ---
function parseAttachmentsTable(text) {
    const attachments = [];
    const lines = text.split('\n');
    for (const line of lines) {
        const cols = line.split('|').map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
        if (cols.length === 7 && /^\d+$/.test(cols[0]) && /^\d+$/.test(cols[6])) {
            const [, filename, size, mimeType, author, date, id] = cols;
            const isImage = /^image\//i.test(mimeType);
            const proxyUrl = `http://localhost:${process.env.PORT || 3001}/api/jira/attachment/${id}`;
            attachments.push({ id, filename, mimeType, size, content: proxyUrl, thumbnail: isImage ? proxyUrl : null, created: date, author, isImage });
        }
    }
    return attachments;
}

// --- Jira Routes ---

app.get('/api/jira/tickets', async (req, res) => {
  try {
    const assigneeStr = process.env.JIRA_ASSIGNEE_ID ? `"${process.env.JIRA_ASSIGNEE_ID}"` : 'currentUser()';
    const jql = `assignee = ${assigneeStr} AND statusCategory != Done ORDER BY updated DESC`;
    const result = await mcpManager.callTool('jira', 'jira_search', { action: 'issues', jql });
    
    const text = result.content[0].text;
    const regex = /- \*\*([A-Z0-9\-]+)\*\*: (.*)/g;
    let match;
    const keys = [];
    while ((match = regex.exec(text)) !== null) {
        keys.push(match[1]);
    }
    
    const issues = [];
    for (let i = 0; i < keys.length; i += 10) {
        const batch = keys.slice(i, i + 10);
        const batchResults = await Promise.all(batch.map(async key => {
            try {
                const det = await mcpManager.callTool('jira', 'jira_issues', { action: 'get', issueKey: key });
                return parseJiraMarkdown(det.content[0].text || '', key);
            } catch (e) {
                return null;
            }
        }));
        issues.push(...batchResults.filter(Boolean));
    }
    
    res.json(issues);
  } catch (error) {
    console.error('Jira Search MCP Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch Jira tickets via MCP' });
  }
});

app.get('/api/jira/tickets/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;

    // Fetch issue details, comments, and attachments all in parallel
    const [issueResult, commentsResult, attachmentsResult] = await Promise.allSettled([
      mcpManager.callTool('jira', 'jira_issues', { action: 'get', issueKey: ticketId }),
      mcpManager.callTool('jira', 'jira_comments', { action: 'get', issueKey: ticketId }),
      mcpManager.callTool('jira', 'jira_attachments', { action: 'list', issueKey: ticketId }),
    ]);

    // Parse the main issue
    const issueText = issueResult.status === 'fulfilled' ? issueResult.value.content[0].text : '';
    const data = parseJiraMarkdown(issueText, ticketId);

    // --- Parse Comments ---
    let comments = [];
    if (commentsResult.status === 'fulfilled' && commentsResult.value) {
      const commentsRaw = commentsResult.value.content?.[0]?.text || '';
      try {
        // Try JSON parse first (some MCP servers return JSON)
        const parsed = JSON.parse(commentsRaw);
        const commentList = Array.isArray(parsed) ? parsed : (parsed.comments || parsed.values || []);
        comments = commentList.map(c => ({
          id: c.id,
          author: {
            displayName: c.author?.displayName || c.author?.name || 'Unknown',
            avatarUrls: {
              '24x24': c.author?.avatarUrls?.['24x24'] ||
                `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(c.author?.displayName || 'U')}`
            }
          },
          body: typeof c.body === 'string'
            ? { type: 'doc', version: 1, content: markdownToADF(c.body) }
            : c.body,
          created: c.created,
          updated: c.updated,
        }));
      } catch {
        // MCP returns markdown — parse it
        comments = parseMarkdownComments(commentsRaw);
      }
    }

    // --- Parse Attachments ---
    let attachments = [];
    if (attachmentsResult.status === 'fulfilled' && attachmentsResult.value) {
      const attRaw = attachmentsResult.value.content?.[0]?.text || '';
      if (!attRaw.toLowerCase().includes('no attachments')) {
        try {
          const parsed = JSON.parse(attRaw);
          const attList = Array.isArray(parsed) ? parsed : (parsed.attachments || []);
          attachments = attList.map(a => {
            const isImage = /^image\//i.test(a.mimeType || '');
            const proxyUrl = `http://localhost:${process.env.PORT || 3001}/api/jira/attachment/${a.id}`;
            return {
              id: a.id,
              filename: a.filename,
              mimeType: a.mimeType,
              size: a.size,
              content: proxyUrl,
              thumbnail: isImage ? proxyUrl : null,
              created: a.created,
              author: a.author?.displayName || a.author || 'Unknown',
              isImage,
            };
          });
        } catch {
          // MCP returns markdown table — parse it
          attachments = parseAttachmentsTable(attRaw);
        }
      }
    }

    // Use Jira API field naming (singular) so client code matches
    data.fields.comment = { comments, total: comments.length };
    data.fields.attachment = attachments;

    // Augment with real avatar URLs from Jira REST API (assignee, reporter, project icon)
    await augmentAvatars(data, ticketId);

    // Resolve comment author avatars in parallel (cached after first lookup)
    await Promise.all(
      data.fields.comment.comments.map(async c => {
        const name = c.author?.displayName;
        if (name) {
          const url = await getUserAvatarUrl(name);
          c.author.avatarUrls = { '24x24': url };
        }
      })
    );

    res.json(data);
  } catch (error) {
    console.error('Jira Detail MCP Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch ticket details via MCP' });
  }
});

// --- Attachment Proxy: Serve Jira attachments (images etc.) via server to avoid auth issues ---
app.get('/api/jira/attachment/:attachmentId', async (req, res) => {
  try {
    const { attachmentId } = req.params;
    const result = await mcpManager.callTool('jira', 'jira_attachments', {
      action: 'get_content',
      attachmentId,
    });

    // MCP returns [{type:'text', text:'description'}, {type:'image', data:'base64...', mimeType:'...'}]
    const imageItem = result.content?.find(item => item.type === 'image');
    if (imageItem) {
      const buffer = Buffer.from(imageItem.data, 'base64');
      res.setHeader('Content-Type', imageItem.mimeType || 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(buffer);
    }

    // Text/binary fallback — try to send whatever data we have
    const textItem = result.content?.find(item => item.type === 'text');
    if (textItem?.text) {
      res.setHeader('Content-Type', 'text/plain');
      return res.send(textItem.text);
    }

    res.status(404).send('Attachment content not available');
  } catch (err) {
    console.error('Attachment proxy error:', err.message);
    res.status(500).json({ error: 'Failed to fetch attachment' });
  }
});

// --- Project Avatar Proxy: Jira project icons require auth ---
app.get('/api/jira/project-avatar/:avatarId', async (req, res) => {
  try {
    const { avatarId } = req.params;
    if (!/^\d+$/.test(avatarId)) return res.status(400).send('Invalid avatar ID');
    const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
    const url = `${process.env.JIRA_BASE_URL}/rest/api/3/universal_avatar/view/type/project/avatar/${avatarId}`;
    const jiraRes = await fetch(url, { headers: { 'Authorization': `Basic ${auth}` } });
    if (!jiraRes.ok) return res.status(404).send('Not found');
    const buf = await jiraRes.arrayBuffer();
    res.setHeader('Content-Type', jiraRes.headers.get('content-type') || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(buf));
  } catch (err) {
    console.error('Project avatar proxy error:', err.message);
    res.status(500).send('Error');
  }
});

// --- GitHub Routes ---

app.get('/api/github/prs', async (req, res) => {
  try {
    const { GITHUB_FRONTEND_REPO, GITHUB_BACKEND_REPO } = process.env;
    
    const [ownerF, repoF] = GITHUB_FRONTEND_REPO.split('/');
    const [ownerB, repoB] = GITHUB_BACKEND_REPO.split('/');

    const [frontendRes, backendRes] = await Promise.all([
      mcpManager.callTool('github', 'list_pull_requests', { owner: ownerF, repo: repoF, state: 'open' }).catch(() => ({ content: [{ text: '[]' }] })),
      mcpManager.callTool('github', 'list_pull_requests', { owner: ownerB, repo: repoB, state: 'open' }).catch(() => ({ content: [{ text: '[]' }] }))
    ]);
    
    res.json({
      frontend: JSON.parse(frontendRes.content[0].text),
      backend: JSON.parse(backendRes.content[0].text)
    });
  } catch (error) {
    console.error('GitHub MCP Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch GitHub PRs via MCP' });
  }
});

app.get('/api/user', async (req, res) => {
    try {
        const { GITHUB_USERNAME } = process.env;
        const result = await mcpManager.callTool('github', 'search_users', { q: GITHUB_USERNAME });
        const data = JSON.parse(result.content[0].text);
        const user = data.items?.find(u => u.login.toLowerCase() === GITHUB_USERNAME.toLowerCase()) || data.items?.[0] || { login: GITHUB_USERNAME };
        res.json(user);
    } catch (error) {
        console.error('User MCP Error:', error.message);
        res.json({ login: process.env.GITHUB_USERNAME || 'Unknown' });
    }
});

// --- Fix Flow (Agent) ---

app.get('/api/fix/:ticketId', (req, res) => {
    const { ticketId } = req.params;
    
    req.setTimeout(0);
    res.setTimeout(0);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const heartbeat = setInterval(() => {
        sendEvent({ type: 'heartbeat', time: new Date() });
    }, 15000);

    let agent = activeAgents.get(ticketId);
    if (!agent) {
        agent = new FixAgent(process.env);
        activeAgents.set(ticketId, agent);
    }

    agent.setLogCallback((log) => {
        sendEvent(log);
    });

    agent.run(ticketId).then((result) => {
        clearInterval(heartbeat);
        if (result.status === 'success') {
            sendEvent({ type: 'system', message: 'Agent finished implementation', details: result });
        } else {
            sendEvent({ type: 'system', message: `Agent failed: ${result.error}` });
        }
    }).catch(err => {
        clearInterval(heartbeat);
        sendEvent({ type: 'system', message: `Fatal error: ${err.message}` });
    });

    req.on('close', () => {
        clearInterval(heartbeat);
    });
});

app.post('/api/fix/:ticketId/chat', (req, res) => {
    const { ticketId } = req.params;
    const { message } = req.body;
    const agent = activeAgents.get(ticketId);
    if (agent) {
        agent.run(ticketId, message).then((result) => {
            res.json({ status: 'ok', result });
        }).catch(err => {
            console.error(`Chat error for ${ticketId}:`, err);
            res.status(500).json({ error: err.message });
        });
    } else {
        console.warn(`Agent session NOT FOUND for chat: ${ticketId}. Available sessions:`, Array.from(activeAgents.keys()));
        res.status(404).json({ error: 'Agent session not found' });
    }
});

app.post('/api/fix/:ticketId/approve', async (req, res) => {
    const { ticketId } = req.params;
    const { ticket, diff, commitMsg, prDesc, reviewers, finalize } = req.body;
    const agent = activeAgents.get(ticketId);

    if (agent) {
        if (finalize) {
            const result = await agent.finalize(ticketId, ticket, commitMsg, prDesc, reviewers);
            activeAgents.delete(ticketId);
            res.json(result);
        } else {
            const details = await agent.generatePRDetails(ticketId, ticket, diff);
            res.json(details);
        }
    } else {
        console.warn(`Agent session NOT FOUND for approve: ${ticketId}. Available sessions:`, Array.from(activeAgents.keys()));
        res.status(404).json({ error: 'Agent session not found' });
    }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
