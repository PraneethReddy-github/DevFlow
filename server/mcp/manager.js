const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
class MCPManager {
    constructor() {
        this.clients = new Map();
        this.isReady = false;
    }

    async init() {
        console.log('🚀 Initializing MCP Clients...');

        // Initialize GitHub MCP
        try {
            console.log('Starting GitHub MCP Server via npx...');
            const githubTransport = new StdioClientTransport({
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-github'],
                env: {
                    ...process.env,
                    GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN
                }
            });
            const githubClient = new Client({
                name: 'devflow-server-github',
                version: '1.0.0'
            }, {
                capabilities: {}
            });
            await githubClient.connect(githubTransport);
            this.clients.set('github', githubClient);
            const tools = await githubClient.listTools();
            console.log('✅ Connected to GitHub MCP Server. Available tools:', tools.tools.map(t => t.name).join(', '));
        } catch (err) {
            console.error('❌ Failed to connect to GitHub MCP:', err.message, err.stack);
        }

        // Initialize Jira MCP
        try {
            console.log('Starting Jira MCP Server via npx (@nexus2520/jira-mcp-server)...');
            const jiraTransport = new StdioClientTransport({
                command: 'npx',
                args: ['-y', '@nexus2520/jira-mcp-server'],
                env: {
                    ...process.env,
                    JIRA_BASE_URL: process.env.JIRA_BASE_URL,
                    JIRA_EMAIL: process.env.JIRA_EMAIL,
                    JIRA_API_TOKEN: process.env.JIRA_API_TOKEN
                }
            });
            const jiraClient = new Client({
                name: 'devflow-server-jira',
                version: '1.0.0'
            }, {
                capabilities: {}
            });
            await jiraClient.connect(jiraTransport);
            this.clients.set('jira', jiraClient);
            const tools = await jiraClient.listTools();
            console.log('✅ Connected to Jira MCP Server. Available tools:', tools.tools.map(t => t.name).join(', '));
        } catch (err) {
            console.error('❌ Failed to connect to Jira MCP:', err.message, err.stack);
        }

        this.isReady = true;
        console.log('✨ All MCP Clients initialized');
    }

    async listTools(serverName) {
        const client = this.clients.get(serverName);
        if (!client) throw new Error(`MCP Client ${serverName} not initialized`);
        return await client.listTools();
    }

    async callTool(serverName, toolName, args = {}) {
        console.log(`🛠 Calling tool: ${serverName}:${toolName}`, args);
        const client = this.clients.get(serverName);
        if (!client) {
            const msg = `MCP Client ${serverName} not initialized. Ready: ${this.isReady}`;
            console.error(`❌ ${msg}`);
            throw new Error(msg);
        }

        try {
            const result = await client.callTool({
                name: toolName,
                arguments: args
            });
            return result;
        } catch (err) {
            console.error(`❌ Error calling tool ${serverName}:${toolName}:`, err.message);
            throw err;
        }
    }
}

module.exports = new MCPManager();
