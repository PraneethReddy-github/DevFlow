# DevFlow: Autonomous Engineering Workflow

DevFlow is an AI-orchestrated engineering platform that automates the full lifecycle of software development — from Jira ticket analysis to GitHub Pull Request creation and Jira status updates. It uses the **Gemini CLI** for surgical code repairs and the **Model Context Protocol (MCP)** for structured integration with Jira and GitHub.

---

## 🏗 System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (React)                          │
│  Dashboard  │  AgentPanel (SSE stream)  │  TicketDetailView     │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTP + SSE  (localhost:5173 → 3001)
┌──────────────────────▼──────────────────────────────────────────┐
│                   EXPRESS SERVER  (port 3001)                   │
│                                                                 │
│  Routes: /api/jira/*  /api/github/*  /api/fix/:id/*            │
│  MCPManager (persistent clients for Jira + GitHub MCP)         │
│  FixAgent session map  (Map<ticketId, FixAgent>)               │
│  jiraHelpers.js  (parseJiraMarkdown, markdownToADF)            │
└──────┬──────────────────────────────────┬───────────────────────┘
       │ MCP stdio                        │ spawn()
       │                                  │
┌──────▼──────────────┐      ┌────────────▼────────────────────┐
│   Jira MCP Server   │      │        Gemini CLI               │
│ @nexus2520/         │      │  gemini --prompt "..." --yolo   │
│ jira-mcp-server     │      │  --skip-trust                   │
│                     │      │  --output-format stream-json    │
│ Tools:              │      │                                 │
│  jira_issues        │      │  Built-in tools used by agent:  │
│  jira_search        │      │   read_file, grep_search        │
│  jira_comments      │      │   replace, write_file           │
│  jira_workflow      │      │   run_shell_command             │
│  jira_attachments   │      └─────────────────────────────────┘
└─────────────────────┘
┌─────────────────────┐
│  GitHub MCP Server  │
│ @modelcontextprotocol│
│ /server-github      │
│                     │
│ Tools:              │
│  create_pull_request│
│  get_file_contents  │
│  list_pull_requests │
│  get_pull_request   │
│  search_code        │
│  list_issues  ...   │
└─────────────────────┘
```

---

## 📁 Project Structure

```
DevFlow/
├── client/                        # React frontend (Vite, Tailwind)
│   └── src/
│       └── components/
│           ├── Dashboard.jsx      # Main layout + ticket/PR grid
│           ├── JiraSection.jsx    # Jira ticket list
│           ├── TicketDetailView.jsx  # Full ticket modal (ADF renderer, attachments, comments)
│           ├── AgentPanel.jsx     # Sliding AI agent panel (SSE logs, diff view, chat)
│           ├── GitHubSection.jsx  # My open PRs
│           ├── TeamPRs.jsx        # Team PR feed
│           └── WelcomeScreen.jsx
│
├── server/
│   ├── index.js                   # Express app, all routes, MCP init, SSE
│   ├── jiraHelpers.js             # Shared: parseJiraMarkdown(), markdownToADF()
│   ├── scratch_tools.js           # Utility scripts
│   ├── .env                       # Secrets (see below)
│   ├── package.json
│   ├── agents/
│   │   └── FixAgent.js            # AI agent class — full fix + finalize lifecycle
│   └── mcp/
│       └── manager.js             # MCPManager — spawns & wraps Jira + GitHub MCP clients
│
├── simnovator-frontend/           # Target repo for frontend fixes
├── simnovator-backend/            # Target repo for backend fixes
└── DEVFLOW.md                     # This file
```

---

## 🔧 Model Context Protocol (MCP)

### What is MCP?
MCP (Model Context Protocol) is an open standard that exposes external services (Jira, GitHub, databases, etc.) as structured tool-call APIs. Instead of writing custom REST wrappers, you connect an MCP server and call tools like `jira_issues`, `create_pull_request`, etc.

### How DevFlow Uses MCP

DevFlow runs two persistent MCP servers, managed by `server/mcp/manager.js`:

| MCP Server | Package | Registered as |
|---|---|---|
| Jira | `@nexus2520/jira-mcp-server` | `'jira'` |
| GitHub | `@modelcontextprotocol/server-github` | `'github'` |

Both are started as **child processes via stdio transport** when the Express server boots:

```js
// manager.js (simplified)
const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@nexus2520/jira-mcp-server'],
    env: { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN }
});
const client = new Client({ name: 'devflow-server-jira', version: '1.0.0' }, { capabilities: {} });
await client.connect(transport);
this.clients.set('jira', client);
```

All tool calls go through `mcpManager.callTool(server, tool, args)`:

```js
// Example calls used in production
await mcpManager.callTool('jira', 'jira_issues',      { action: 'get', issueKey: 'SIM40-1990' });
await mcpManager.callTool('jira', 'jira_comments',    { action: 'add', issueKey, comment: '...' });
await mcpManager.callTool('jira', 'jira_workflow',    { action: 'transition', issueKey, transitionId: '31' });
await mcpManager.callTool('jira', 'jira_attachments', { action: 'list', issueKey });
await mcpManager.callTool('jira', 'jira_attachments', { action: 'get_content', attachmentId });
await mcpManager.callTool('github', 'create_pull_request', { owner, repo, title, body, head, base });
await mcpManager.callTool('github', 'list_pull_requests',  { owner, repo, state: 'open' });
```

### Jira MCP Tool Reference

| Tool | Actions | Key Parameters |
|---|---|---|
| `jira_issues` | `get`, `create`, `update`, `assign` | `issueKey`, `action` |
| `jira_search` | `issues`, `projects`, `users` | `query`, `action` |
| `jira_comments` | `get`, `add` | `issueKey`, `comment` (not `body`) |
| `jira_workflow` | `get_transitions`, `transition` | `issueKey`, `transitionId` |
| `jira_attachments` | `list`, `get_content`, `upload`, `delete` | `issueKey`, `attachmentId` |

> ⚠️ `jira_comments` add uses `comment:` not `body:`.  
> ⚠️ `jira_workflow` transition uses `transitionId:` (e.g. `'31'` for "In Review"), not `status:`.  
> ⚠️ Jira reassign requires the account ID via direct REST `PUT /rest/api/3/issue/{key}/assignee` — display names are not accepted by the MCP.

### MCP Response Formats

**`jira_issues { action: 'get' }`** — Returns markdown:
```
# SIM40-1990: Summary text
**Status**: In Progress
**Assignee**: Praneeth Reddy
## Description
...
## Custom Fields
**Acceptance Criteria**: ...
```
Parsed by `parseJiraMarkdown()` in `jiraHelpers.js`.

**`jira_comments { action: 'get' }`** — Returns markdown:
```
# Comments (2)
## Comment 1 - Author Name (2026-04-01)
Comment body text...
```

**`jira_attachments { action: 'list' }`** — Returns a markdown table:
```
| # | Filename | Size | Type | Author | Date | ID |
```

**`jira_attachments { action: 'get_content', attachmentId }`** — Returns an array:
```js
[
  { type: 'text', text: 'filename.png' },
  { type: 'image', data: '<base64>', mimeType: 'image/png' }
]
```
Served to the browser via `GET /api/jira/attachment/:id` proxy route.

---

## 🤖 The FixAgent

`server/agents/FixAgent.js` is the AI agent class. One instance is created per active ticket and stored in `activeAgents` Map in `index.js`.

### Agent Lifecycle

```
1. POST /api/fix/:ticketId/start
        │
        ▼
   FixAgent.run(ticketId)
        │
        ├── Clean workspace (git reset --hard + clean)
        ├── getJiraTicket()  →  jira_issues { action: 'get' }  →  parseJiraMarkdown()
        ├── git checkout main + pull (frontend + backend)
        │
        ├── Build prompt (Universal Fast-Fix Protocol)
        │       ├── CRITICAL MISSION DATA (ticket fields)
        │       ├── CONTEXT (summary, description, acceptance criteria)
        │       └── fastFixProtocol (ORIENT → SEARCH → REPAIR → VERIFY)
        │
        ├── spawn('gemini', ['--prompt', prompt, '--yolo', '--skip-trust',
        │                    '--output-format', 'stream-json'])
        │       cwd: /DevFlow root
        │
        ├── Stream stdout JSON → SSE to browser (AgentPanel)
        │       json.type === 'text'      → log as agent message
        │       json.type === 'tool_use'  → log status (Searching / Analyzing / Applying...)
        │
        └── On close → generateGlobalDiff() → emit diff to AgentPanel

2. POST /api/fix/:ticketId/chat   (user sends refinement feedback)
        │
        └── FixAgent.run(ticketId, additionalInstructions)
                  Uses same workspace state, injects diff + instructions into prompt

3. POST /api/fix/:ticketId/approve  { finalize: false }
        │
        └── FixAgent.generatePRDetails()
                  spawn('gemini', ['--prompt', prDocPrompt, '--output-format', 'text'])
                  Parses COMMIT_MESSAGE: and PR_DESCRIPTION: from output
                  Returns { commitMsg, prDesc }

4. POST /api/fix/:ticketId/approve  { finalize: true }
        │
        └── FixAgent.finalize(ticketId, ticket, commitMsg, prDesc, reviewers)
                  │
                  ├── For each repo with changes (frontend / backend):
                  │     ├── git checkoutLocalBranch(ticketId)
                  │     ├── git add . + commit(commitMsg)
                  │     ├── git push origin ticketId --set-upstream
                  │     └── mcpManager.callTool('github', 'create_pull_request', {...})
                  │
                  ├── jira_comments { action: 'add', comment: 'PR raised: <url>' }
                  ├── jira_workflow { action: 'transition', transitionId: '31' }  → "In Review"
                  ├── REST PUT /assignee { accountId: '629990e3cd636500697d9c4b' }  → Nikhil Jain
                  └── git checkout main (reset both repos)
```

### The Gemini CLI

DevFlow does **not** use the Gemini API directly. It uses the **Gemini CLI** installed globally:

```bash
npm install -g @google/gemini-cli
gemini auth login   # one-time OAuth setup
```

The CLI is invoked in non-interactive headless mode:

```bash
gemini \
  --prompt "...full mission prompt..." \
  --yolo \          # auto-approve all tool calls (no interactive confirmation)
  --skip-trust \    # skip workspace trust prompt
  --output-format stream-json   # emit each action as a JSON line to stdout
```

The `stream-json` format emits lines like:
```json
{ "type": "text", "content": "Looking at the statistics page..." }
{ "type": "tool_use", "tool_name": "grep_search", "parameters": { "pattern": "bg-orange-500" } }
{ "type": "tool_result", "content": "..." }
```

The server parses each line and forwards relevant events via SSE to the AgentPanel in the browser.

Gemini has these built-in tools available without any MCP configuration for the fix step:
- `read_file` — read any file in the workspace
- `grep_search` — search for text patterns
- `replace` / `write_file` — make edits
- `list_directory` — explore structure
- `run_shell_command` — run terminal commands

---

## 🖥 The Client

**Tech Stack**: React 19, Vite 5, Tailwind CSS 3, Framer Motion, Lucide React

### Key Components

#### `Dashboard.jsx`
- Main 12-column grid layout
- Left 8 cols: `JiraSection` (my tickets)
- Right 4 cols: `GitHubSection` (my PRs) + `TeamPRs`
- Both columns pinned to `h-[calc(100vh-9rem)]`

#### `JiraSection.jsx`
- Fetches `GET /api/jira/tickets` — list of my assigned tickets
- Each ticket card opens `TicketDetailView` modal on click
- "Fix This Ticket" button → opens `AgentPanel`

#### `TicketDetailView.jsx`
- Full ticket details rendered from MCP data
- **ADF Renderer** — handles paragraph, bulletList, orderedList, heading, codeBlock, mediaSingle, mention node types
- **Attachments** — image previews inline, other types shown with file icons; all loaded via `/api/jira/attachment/:id` proxy
- **Comments** — author avatar (from Jira REST), timestamp, body
- **Acceptance Criteria** — from `customfield_10060`

#### `AgentPanel.jsx`
- Slides in from right when "Fix This Ticket" clicked
- Connects to `GET /api/fix/:ticketId/stream` (SSE)
- Displays: agent logs, tool-use status toasts, colorized diff
- Chat input for mid-session refinements
- **Approve Changes** → `POST /api/fix/:ticketId/approve { finalize: false }` → gets commit msg + PR desc
- **Finalize & Raise PR** → `POST /api/fix/:ticketId/approve { finalize: true }` → runs full finalize

### SSE Streaming

```
Browser                          Server
  |                                |
  |-- GET /api/fix/:id/stream ---->|  (EventSource)
  |<-- data: {"type":"system"...} -|  agent initialized
  |<-- data: {"type":"agent"...}  -|  gemini text output
  |<-- data: {"type":"agent-status"}|  tool-use status
  |<-- data: {"type":"agent", diff}|  diff on completion
```

---

## 🌐 Server Routes Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/jira/tickets` | List my assigned Jira tickets |
| `GET` | `/api/jira/tickets/:id` | Full ticket detail (comments, attachments, avatars) |
| `GET` | `/api/jira/attachment/:id` | Proxy Jira attachment (base64 → binary) |
| `GET` | `/api/jira/project-avatar/:id` | Proxy Jira project avatar (requires auth) |
| `GET` | `/api/github/prs` | My open PRs |
| `GET` | `/api/github/team-prs` | Team PRs (frontend + backend repos) |
| `POST` | `/api/fix/:ticketId/start` | Start FixAgent session for ticket |
| `GET` | `/api/fix/:ticketId/stream` | SSE stream of agent logs |
| `POST` | `/api/fix/:ticketId/chat` | Send chat message to active agent |
| `POST` | `/api/fix/:ticketId/approve` | Generate PR details or finalize |

---

## ⚙️ Environment Configuration

`server/.env`:

```env
# Jira
JIRA_EMAIL=praneeth.reddy@simnovus.com
JIRA_API_TOKEN=<atlassian-api-token>
JIRA_BASE_URL=https://simnovus.atlassian.net
JIRA_PROJECT=SIM
JIRA_ASSIGNEE_ID=<your-account-id>

# GitHub
GITHUB_TOKEN=<personal-access-token>
GITHUB_USERNAME=Praneeth-exe
GITHUB_FRONTEND_REPO=Simnovus-Corp/simnovator-frontend
GITHUB_BACKEND_REPO=Simnovus-Corp/simnovator-backend

# Server
PORT=3001
```

---

## 🚀 How to Run

### Prerequisites
- Node.js 18+
- Gemini CLI installed and authenticated:
  ```bash
  npm install -g @google/gemini-cli
  gemini   # follow OAuth login prompt
  ```
- Both `simnovator-frontend` and `simnovator-backend` cloned inside `/DevFlow/`

### Start the Server
```bash
cd server
npm install
node index.js
```
Server starts on `http://localhost:3001`. MCP clients (Jira + GitHub) initialize automatically on boot — watch for:
```
✅ Connected to GitHub MCP Server. Available tools: create_pull_request, ...
✅ Connected to Jira MCP Server. Available tools: jira_issues, jira_search, ...
✨ All MCP Clients initialized
```

### Start the Client
```bash
cd client
npm install
npm run dev
```
Open `http://localhost:5173`.

### Full Agent Flow
1. Open DevFlow → your Jira tickets appear on the dashboard
2. Click a ticket → view full details (description, attachments, comments, acceptance criteria)
3. Click **"Fix This Ticket"** → AgentPanel slides in
4. Agent fetches ticket context, syncs repos, spawns Gemini CLI
5. Watch live logs as the agent searches, reads files, and applies changes
6. Optionally type feedback in the chat to refine changes
7. Click **"Approve Changes"** → generates commit message and PR description
8. Review and click **"Finalize & Raise PR"** → branch pushed, PR created, Jira updated

---

## 🔑 Known Values & IDs

| Item | Value |
|---|---|
| Nikhil Jain Jira account ID | `629990e3cd636500697d9c4b` |
| Jira "In Review" transition ID | `31` |
| Jira "In Progress" transition ID | `21` |
| Jira "Done" transition ID | `41` |
| Jira "To Do" transition ID | `11` |
| Jira "Backlog" transition ID | `3` |
