const { spawn } = require('child_process');
const path = require('path');
const simpleGit = require('simple-git');
const mcpManager = require('../mcp/manager');
const { parseJiraMarkdown } = require('../jiraHelpers');

class FixAgent {
    constructor(config) {
        this.config = config;
        this.logCallback = null;
        this.repoRoot = path.join(__dirname, '../../');
        this.gits = {
            frontend: simpleGit(path.join(this.repoRoot, 'simnovator-frontend')),
            backend: simpleGit(path.join(this.repoRoot, 'simnovator-backend'))
        };
        this.currentTicket = null;
    }

    setLogCallback(callback) {
        this.logCallback = callback;
    }

    log(type, message, details = null) {
        if (this.logCallback) {
            this.logCallback({ type, message, details, time: new Date() });
        }
    }

    async run(ticketId, additionalInstructions = null) {
        try {
            if (!this.currentTicket) {
                // Ensure a clean workspace ONLY on first initialization
                this.log('system', 'Preparing clean workspace...');
                for (const key in this.gits) {
                    try {
                        await this.gits[key].reset(['--hard']);
                        await this.gits[key].clean('f', ['-d']);
                    } catch (e) {
                        this.log('system', `Warning: Failed to clean ${key}: ${e.message}`);
                    }
                }

                this.log('system', `🚀 Mission Initialized: ${ticketId}`);
                this.currentTicket = await this.getJiraTicket(ticketId);
                
                this.log('agent', 'Synchronizing repositories...');
                for (const key in this.gits) {
                    try {
                        await this.gits[key].checkout('main');
                        await this.gits[key].pull();
                    } catch (e) {
                        this.log('system', `Note: Local sync for ${key} skipped.`);
                    }
                }
            }

            const ticket = this.currentTicket;
            const context = `
            CRITICAL MISSION DATA:
            Ticket: ${ticket.key}
            Goal: ${ticket.fields.summary}
            Context: ${this.extractText(ticket.fields.description)}
            Requirements: ${this.extractText(ticket.fields.customfield_10060)}
            `;

            const fastFixProtocol = `
            ## UNIVERSAL FAST-FIX PROTOCOL

            ### MCP TOOLS
            You have access to:
            - **Jira MCP**: Use it to get more ticket context, read comments, or check issue history if needed.
            - **GitHub MCP**: Use it to check repository metadata or PR history if needed.

            ### ORIENT (Skip this if you are in RESUME CONTEXT and know the area)
...
            When done, say 'FIX_COMPLETE'.
            `;

            let prompt = `
            YOU ARE A SURGICAL REPAIR AGENT OPERATING UNDER THE UNIVERSAL FAST-FIX PROTOCOL.
            MISSION ID: ${ticket.key}_${Date.now()}
            
            ${context}
            
            ${fastFixProtocol}
            
            PRIORITIZE SPEED AND ACCURACY. Avoid redundant steps.
            `;

            if (additionalInstructions) {
                const currentDiff = await this.generateGlobalDiff();
                prompt = `
                YOU ARE A SURGICAL REPAIR AGENT OPERATING UNDER THE UNIVERSAL FAST-FIX PROTOCOL.
                MISSION ID: ${ticket.key}_${Date.now()}
                
                ${context}
                
                RESUME CONTEXT: This is a follow-up. 
                CURRENT WORKSPACE CHANGES (Review this FIRST to see what to keep or revert):
                \`\`\`diff
                ${currentDiff.substring(0, 5000)}
                \`\`\`
                
                URGENT INSTRUCTION: "${additionalInstructions}".
                
                ACTION PLAN for RESUME:
                1. Review the diff above. 
                2. If the user wants to revert or modify specific files, go directly to those files.
                3. DO NOT re-run general orientation or discovery if you can see the target files in the diff.
                4. Execute the URGENT INSTRUCTION immediately.
                
                ${fastFixProtocol}
                `;
            }

            const geminiProcess = spawn('gemini', [
                '--prompt', prompt,
                '--yolo',
                '--skip-trust',
                '--output-format', 'stream-json'
            ], {
                cwd: this.repoRoot,
                env: { 
                    ...process.env, 
                    LANG: 'en_US.UTF-8',
                    GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN,
                    JIRA_INSTANCE_URL: process.env.JIRA_BASE_URL,
                    JIRA_USER_EMAIL: process.env.JIRA_EMAIL,
                    JIRA_API_KEY: process.env.JIRA_API_TOKEN
                }
            });

            this.log('system', 'Agent is working...', { isLoading: true });

            geminiProcess.stdout.on('data', (data) => {
                const lines = data.toString().split('\n');
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const json = JSON.parse(line);
                        console.log('--- AGENT STEP ---');
                        console.log(JSON.stringify(json, null, 2));
                        if (json.type === 'text') {
                            this.log('agent', json.content);
                        } else if (json.type === 'tool_use') {
                            let statusMsg = '';
                            const params = json.parameters || {};
                            switch (json.tool_name) {
                                case 'grep_search':
                                    statusMsg = `Searching for "${params.pattern}"...`;
                                    break;
                                case 'read_file':
                                    statusMsg = `Analyzing ${path.basename(params.file_path)}...`;
                                    break;
                                case 'replace':
                                case 'write_file':
                                    statusMsg = `Applying changes to ${path.basename(params.file_path)}...`;
                                    break;
                                case 'run_shell_command':
                                    statusMsg = `Executing: ${params.description || params.command.substring(0, 30)}...`;
                                    break;
                                case 'list_directory':
                                    statusMsg = `Exploring ${path.basename(params.dir_path)}...`;
                                    break;
                                default:
                                    statusMsg = `Using tool: ${json.tool_name}...`;
                            }
                            if (statusMsg) {
                                this.log('agent-status', statusMsg);
                            }
                        }
                    } catch (e) {
                        console.log('--- AGENT RAW OUTPUT ---');
                        console.log(line);
                    }
                }
            });

            geminiProcess.stderr.on('data', (data) => {
                const msg = data.toString().trim();
                if (msg) console.error('[gemini stderr]', msg);
            });

            return new Promise((resolve) => {
                geminiProcess.on('close', async (code) => {
                    const diff = await this.generateGlobalDiff();
                    this.log('agent', 'Implementation round finished. Review the diff below.', { 
                        ticket: this.currentTicket,
                        ticketId: this.currentTicket.key,
                        diff 
                    });
                    resolve({ status: 'success', ticket, ticketId: ticket.key, diff });
                });
            });

        } catch (error) {
            this.log('system', `❌ Fatal Error: ${error.message}`);
            return { status: 'error', error: error.message };
        }
    }

    async generateGlobalDiff() {
        const frontendDiff = await this.gits.frontend.diff();
        const backendDiff = await this.gits.backend.diff();
        return `${frontendDiff}\n${backendDiff}`;
    }

    async generatePRDetails(ticketId, ticket, diff) {
        this.log('system', 'Generating concise logical PR documentation via CLI...');
        const prompt = `
        Draft a professional commit message and Pull Request description for:
        TICKET: [${ticketId}] ${ticket.fields.summary}
        JIRA URL: https://simnovus.atlassian.net/browse/${ticketId}
        
        CHANGES MADE (RAW DIFF):
        ${diff.substring(0, 4000)}
        
        Instructions:
        1. Summarize the changes logically. What was fixed? What was added? 
        2. Do NOT mention specific file names. Use functional descriptions (e.g., "Updated the table sorting logic" instead of "Modified Table.tsx").
        3. Keep it professional and concise but descriptive.

        Format your response EXACTLY as follows:
        COMMIT_MESSAGE: <Short logical summary starting with [${ticketId}]>
        PR_DESCRIPTION: <Detailed logical markdown summary of what was fixed/added. Include bullet points if multiple changes were made. End with the Jira link: https://simnovus.atlassian.net/browse/${ticketId}>
        `;

        return new Promise((resolve) => {
            const geminiProcess = spawn('gemini', [
                '--prompt', prompt,
                '--output-format', 'text'
            ], {
                cwd: this.repoRoot,
                env: { ...process.env, LANG: 'en_US.UTF-8' }
            });

            let output = '';
            geminiProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            geminiProcess.on('close', (code) => {
                // Parse COMMIT_MESSAGE and PR_DESCRIPTION from gemini output
                const commitMatch = output.match(/COMMIT_MESSAGE:\s*([\s\S]+?)(?=\nPR_DESCRIPTION:|$)/i);
                const prMatch = output.match(/PR_DESCRIPTION:\s*([\s\S]+)/i);

                const commitMsg = commitMatch?.[1]?.trim() || `[${ticketId}] ${ticket.fields.summary}`;
                const prDesc = prMatch?.[1]?.trim() || `Logical fix for ${ticketId}. \n\nJira: https://simnovus.atlassian.net/browse/${ticketId}`;
                
                resolve({ commitMsg, prDesc });
            });
        });
    }

    async finalize(ticketId, ticket, commitMsg, prDesc, reviewers) {
        try {
            this.log('system', `🚀 Pushing changes and raising PR for ${ticketId}...`);

            const frontendOwner = (process.env.GITHUB_FRONTEND_REPO || 'Simnovus-Corp/simnovator-frontend').split('/')[0];
            const frontendRepo = (process.env.GITHUB_FRONTEND_REPO || 'Simnovus-Corp/simnovator-frontend').split('/')[1];
            const backendOwner = (process.env.GITHUB_BACKEND_REPO || 'Simnovus-Corp/simnovator-backend').split('/')[0];
            const backendRepo = (process.env.GITHUB_BACKEND_REPO || 'Simnovus-Corp/simnovator-backend').split('/')[1];

            // --- Step 1: Git — branch, commit, push for repos with changes ---
            const prUrls = [];
            for (const [key, git] of Object.entries(this.gits)) {
                try {
                    const status = await git.status();
                    const hasChanges = status.files.length > 0;
                    if (!hasChanges) {
                        this.log('system', `No changes in ${key}, skipping.`);
                        continue;
                    }

                    this.log('system', `📦 Committing and pushing ${key}...`);
                    await git.checkoutLocalBranch(ticketId).catch(() => git.checkout(ticketId));
                    await git.add('.');
                    await git.commit(commitMsg);
                    await git.push('origin', ticketId, ['--set-upstream']);

                    // --- Step 2: GitHub — raise PR ---
                    const owner = key === 'frontend' ? frontendOwner : backendOwner;
                    const repo = key === 'frontend' ? frontendRepo : backendRepo;
                    this.log('system', `📬 Raising PR for ${owner}/${repo}...`);
                    const prResult = await mcpManager.callTool('github', 'create_pull_request', {
                        owner,
                        repo,
                        title: `[${ticketId}] ${ticket.fields?.summary || ticketId}`,
                        body: prDesc,
                        head: ticketId,
                        base: 'main',
                        draft: false
                    });
                    const prText = prResult?.content?.[0]?.text || '';
                    const prUrlMatch = prText.match(/https:\/\/github\.com\/[^\s"]+\/pull\/\d+/);
                    const prUrl = prUrlMatch ? prUrlMatch[0] : `https://github.com/${owner}/${repo}/pulls`;
                    prUrls.push(prUrl);
                    this.log('agent', `✅ PR raised: ${prUrl}`);
                } catch (e) {
                    this.log('system', `⚠️ Git/PR step failed for ${key}: ${e.message}`);
                    console.error(`finalize ${key} error:`, e);
                }
            }

            // --- Step 3: Jira — comment, transition, reassign ---
            const prLinksText = prUrls.length ? prUrls.join('\n') : '(no PR link available)';

            try {
                this.log('system', '💬 Adding Jira comment...');
                await mcpManager.callTool('jira', 'jira_comments', {
                    action: 'add',
                    issueKey: ticketId,
                    comment: `PR raised by DevFlow Agent:\n${prLinksText}`
                });
            } catch (e) {
                this.log('system', `⚠️ Jira comment failed: ${e.message}`);
            }

            try {
                this.log('system', '🔄 Transitioning Jira to In Review...');
                await mcpManager.callTool('jira', 'jira_workflow', {
                    action: 'transition',
                    issueKey: ticketId,
                    transitionId: '31'
                });
            } catch (e) {
                this.log('system', `⚠️ Jira transition failed: ${e.message}`);
            }

            try {
                this.log('system', '👤 Reassigning to Nikhil Jain...');
                // Use Jira REST API directly — MCP assign needs account ID, not display name
                const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
                await fetch(`${process.env.JIRA_BASE_URL}/rest/api/3/issue/${ticketId}/assignee`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accountId: '629990e3cd636500697d9c4b' })
                });
            } catch (e) {
                this.log('system', `⚠️ Jira reassign failed: ${e.message}`);
            }

            this.log('agent', '🎉 Mission finalized! Resetting workspace to main...');
            for (const key in this.gits) {
                try { await this.gits[key].checkout('main'); } catch (e) {}
            }

            return { status: 'done', branchName: ticketId, prUrl: prUrls[0] || '#' };

        } catch (error) {
            console.error('Finalize Error:', error.message);
            this.log('system', `❌ Finalize Failed: ${error.message}`);
            return { status: 'error', error: error.message };
        }
    }

    async getJiraTicket(ticketId) {
        try {
            const result = await mcpManager.callTool('jira', 'jira_issues', { action: 'get', issueKey: ticketId });
            return parseJiraMarkdown(result.content[0].text || '', ticketId);
        } catch (err) {
            console.error('getJiraTicket MCP Error:', err.message);
            throw err;
        }
    }

    extractText(doc) {
        if (!doc || !doc.content) return '';
        if (typeof doc === 'string') return doc;
        try {
            return doc.content.map(block => {
                if (block.content) return block.content.map(c => c.text).join(' ');
                return '';
            }).join('\n');
        } catch (e) { return JSON.stringify(doc); }
    }
}

module.exports = FixAgent;
