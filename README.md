# DevFlow 🤖

DevFlow is an autonomous, AI-orchestrated engineering platform designed to automate the full lifecycle of software development. It seamlessly connects your issue tracker (Jira) and version control (GitHub), using AI to autonomously resolve tickets, generate code fixes, and raise Pull Requests—all without leaving your dashboard.

## ✨ Features

- **Jira & GitHub Integration**: Directly reads Jira tickets and manages GitHub Pull Requests using the Model Context Protocol (MCP).
- **Autonomous FixAgent**: Powered by the Gemini CLI, the agent analyzes tickets, searches the codebase, applies repairs, and verifies changes.
- **Real-Time Collaboration**: Watch the AI agent work in real-time through an interactive sliding panel (AgentPanel) with live streaming logs (SSE) and colorized diffs.
- **Human-in-the-Loop**: Chat with the agent mid-session to provide refinement feedback before approving changes.
- **One-Click PR Generation**: Automatically generates meaningful commit messages and PR descriptions based on the applied fixes and transitions Jira tickets to review.

## 🏗 System Architecture

The core architecture operates over an Express backend that manages the frontend requests and maintains persistent streams with two MCP servers and the Gemini CLI.

```text
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (React)                          │
│  Dashboard  │  AgentPanel (SSE stream)  │  TicketDetailView     │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTP + SSE  (localhost:5173 → 3001)
┌──────────────────────▼──────────────────────────────────────────┐
│                   EXPRESS SERVER  (port 3001)                   │
│                                                                 │
│  Routes: /api/jira/*  /api/github/*  /api/fix/:id/*             │
│  MCPManager (persistent clients for Jira + GitHub MCP)          │
│  FixAgent session map  (Map<ticketId, FixAgent>)                │
└──────┬──────────────────────────────────┬───────────────────────┘
       │ MCP stdio                        │ spawn()
       │                                  │
┌──────▼──────────────┐      ┌────────────▼────────────────────┐
│   Jira MCP Server   │      │        Gemini CLI               │
│ @nexus2520/         │      │  gemini --prompt "..." --yolo   │
│ jira-mcp-server     │      │  --skip-trust                   │
│                     │      │  --output-format stream-json    │
└─────────────────────┘      │                                 │
┌─────────────────────┐      │  Built-in tools used by agent:  │
│  GitHub MCP Server  │      │   read_file, grep_search        │
│ @modelcontextprotocol│      │   replace, write_file           │
│ /server-github      │      │   run_shell_command             │
└─────────────────────┘      └─────────────────────────────────┘
```

## ⚙️ How it Works

DevFlow functions as a bridge between Jira, GitHub, and the Gemini AI via the **Model Context Protocol (MCP)**. Here is the lifecycle of a single fix:

1. **Ticket Selection**: You select an assigned Jira ticket from the DevFlow dashboard.
2. **Context Gathering**: The backend `FixAgent` uses the Jira MCP server to pull down all ticket details, including attachments, comments, and acceptance criteria.
3. **Workspace Preparation**: DevFlow automatically checks out the latest `main` branch across your repositories (e.g., `simnovator-frontend` and `simnovator-backend`).
4. **AI Execution (The FixAgent)**:
   - The agent is fed a structured prompt containing the ticket data and a mission protocol (Orient → Search → Repair → Verify).
   - It executes autonomously using the Gemini CLI in headless mode (`--yolo`), utilizing built-in tools like `read_file`, `grep_search`, and `replace` to implement the required changes.
   - All agent actions are streamed back to your browser in real-time via Server-Sent Events (SSE).
5. **Review & Refine**: Once the agent completes its run, you can review the generated diffs in the UI. If something needs tweaking, you can use the built-in chat to request refinements.
6. **Finalize & Raise PR**:
   - DevFlow asks the AI to summarize the changes into a cohesive commit message and PR description.
   - It then creates a new branch, commits the changes, pushes to GitHub, and uses the GitHub MCP server to open a Pull Request.
   - Finally, it automatically adds a comment to the Jira ticket with the PR link and transitions the ticket's status to "In Review."

## 🛠 Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Framer Motion
- **Backend**: Node.js, Express
- **AI/LLM**: Gemini CLI (Universal Fast-Fix Protocol)
- **Integration**: Model Context Protocol (MCP) using `@nexus2520/jira-mcp-server` and `@modelcontextprotocol/server-github`

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- [Gemini CLI](https://github.com/google/gemini-cli) authenticated (`gemini auth login`)
- Your target repositories (e.g., `simnovator-frontend` and `simnovator-backend`) cloned inside the workspace.

### Configuration
Create a `.env` file in the `server` directory with your Jira and GitHub credentials:
```env
JIRA_EMAIL=your.email@example.com
JIRA_API_TOKEN=your_token
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_PROJECT=SIM
JIRA_ASSIGNEE_ID=your_account_id

GITHUB_TOKEN=your_personal_access_token
GITHUB_USERNAME=your_username
GITHUB_FRONTEND_REPO=Org/repo-frontend
GITHUB_BACKEND_REPO=Org/repo-backend
PORT=3001
```

### Running Locally

**Start the Server:**
```bash
cd server
npm install
node index.js
```

**Start the Client:**
```bash
cd client
npm install
npm run dev
```

Visit `http://localhost:5173` to access the DevFlow dashboard. Select a ticket and let the AI do the heavy lifting!

---
*Built to accelerate engineering workflows with AI.*
