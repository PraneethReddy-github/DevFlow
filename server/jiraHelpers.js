// Shared Jira parsing helpers used by index.js and FixAgent.js

function markdownToADF(text) {
    if (!text) return [];
    const nodes = [];
    const lines = text.split('\n');
    let i = 0;

    const makeText = (raw) => {
        const inlineNodes = [];
        const parts = raw.split(/(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/);
        for (const part of parts) {
            if (!part) continue;
            if (part.startsWith('**') && part.endsWith('**')) {
                inlineNodes.push({ type: 'text', text: part.slice(2, -2), marks: [{ type: 'strong' }] });
            } else if (part.startsWith('`') && part.endsWith('`')) {
                inlineNodes.push({ type: 'text', text: part.slice(1, -1), marks: [{ type: 'code' }] });
            } else if (part.startsWith('_') && part.endsWith('_')) {
                inlineNodes.push({ type: 'text', text: part.slice(1, -1), marks: [{ type: 'em' }] });
            } else {
                inlineNodes.push({ type: 'text', text: part });
            }
        }
        return inlineNodes.length === 1 ? inlineNodes[0] : inlineNodes;
    };

    while (i < lines.length) {
        const line = lines[i];

        if (line.startsWith('```')) {
            const lang = line.slice(3).trim();
            const codeLines = [];
            i++;
            while (i < lines.length && !lines[i].startsWith('```')) {
                codeLines.push(lines[i]);
                i++;
            }
            nodes.push({ type: 'codeBlock', attrs: { language: lang || null }, content: [{ type: 'text', text: codeLines.join('\n') }] });
            i++;
            continue;
        }

        const headingMatch = line.match(/^(#{1,4})\s+(.*)/);
        if (headingMatch) {
            nodes.push({ type: 'heading', attrs: { level: headingMatch[1].length }, content: [{ type: 'text', text: headingMatch[2] }] });
            i++;
            continue;
        }

        if (line.match(/^[-*]\s+/)) {
            const items = [];
            while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
                const content = lines[i].replace(/^[-*]\s+/, '');
                const inline = makeText(content);
                items.push({ type: 'listItem', content: [{ type: 'paragraph', content: Array.isArray(inline) ? inline : [inline] }] });
                i++;
            }
            nodes.push({ type: 'bulletList', content: items });
            continue;
        }

        if (line.match(/^\d+\.\s+/)) {
            const items = [];
            while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
                const content = lines[i].replace(/^\d+\.\s+/, '');
                const inline = makeText(content);
                items.push({ type: 'listItem', content: [{ type: 'paragraph', content: Array.isArray(inline) ? inline : [inline] }] });
                i++;
            }
            nodes.push({ type: 'orderedList', content: items });
            continue;
        }

        if (!line.trim()) { i++; continue; }

        const paraLines = [];
        while (i < lines.length && lines[i].trim() && !lines[i].match(/^[#\-*`]|\d+\./) && !lines[i].startsWith('```')) {
            paraLines.push(lines[i]);
            i++;
        }
        if (paraLines.length) {
            const combined = paraLines.join(' ');
            const inline = makeText(combined);
            nodes.push({ type: 'paragraph', content: Array.isArray(inline) ? inline : [inline] });
        } else {
            i++;
        }
    }
    return nodes;
}

function parseJiraMarkdown(text, defaultKey) {
    const titleMatch = text.match(/# (?:\[([A-Z0-9\-]+)\]|([A-Z0-9\-]+):) (.*)/);
    const key = titleMatch ? (titleMatch[1] || titleMatch[2]) : defaultKey;
    const summary = titleMatch ? titleMatch[3].trim() : 'Unknown Summary';

    const statusMatch = text.match(/\*\*Status\*\*:\s*([^|\n]+)/);
    const priorityMatch = text.match(/\*\*Priority\*\*:\s*([^|\n]+)/);
    const assigneeMatch = text.match(/\*\*Assignee\*\*:\s*([^|\n]+)/);
    const reporterMatch = text.match(/\*\*Reporter\*\*:\s*([^|\n]+)/);
    const createdMatch = text.match(/\*\*Created\*\*:\s*([^|\n]+)/);
    const updatedMatch = text.match(/\*\*Updated\*\*:\s*([^|\n]+)/);

    const descIndex = text.indexOf('## Description');
    let description = '';
    let customfield_10060 = null;

    if (descIndex !== -1) {
        const afterDesc = text.substring(descIndex + 14).trim();
        const customFieldsIndex = afterDesc.indexOf('## Custom Fields');

        if (customFieldsIndex !== -1) {
            description = afterDesc.substring(0, customFieldsIndex).trim();
            const customFieldsText = afterDesc.substring(customFieldsIndex + 16);
            const acMatch = customFieldsText.match(/- \*\*Acceptance Criteria \([^)]+\)\*\*: (.*)/);
            if (acMatch) {
                try {
                    customfield_10060 = JSON.parse(acMatch[1]);
                } catch (e) {
                    customfield_10060 = {
                        content: [{ type: 'paragraph', content: [{ type: 'text', text: acMatch[1] }] }]
                    };
                }
            }
        } else {
            description = afterDesc;
        }
    }

    return {
        id: key,
        key: key,
        fields: {
            summary,
            status: { name: statusMatch ? statusMatch[1].trim() : 'Open' },
            priority: { name: priorityMatch ? priorityMatch[1].trim() : 'Medium' },
            assignee: assigneeMatch ? { displayName: assigneeMatch[1].trim(), avatarUrls: { '24x24': 'https://api.dicebear.com/7.x/initials/svg?seed=' + assigneeMatch[1].trim() } } : null,
            reporter: reporterMatch ? { displayName: reporterMatch[1].trim(), avatarUrls: { '24x24': 'https://api.dicebear.com/7.x/initials/svg?seed=' + reporterMatch[1].trim() } } : null,
            project: { name: key.split('-')[0] || 'Unknown', avatarUrls: { '24x24': 'https://api.dicebear.com/7.x/identicon/svg?seed=' + key } },
            created: createdMatch ? createdMatch[1].trim() : new Date().toISOString(),
            updated: updatedMatch ? updatedMatch[1].trim() : new Date().toISOString(),
            customfield_10060,
            description: {
                type: 'doc',
                version: 1,
                content: markdownToADF(description)
            }
        }
    };
}

module.exports = { markdownToADF, parseJiraMarkdown };
