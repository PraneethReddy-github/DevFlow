import { X, ExternalLink, Calendar, User, Tag, CheckCircle2, MessageSquare, Paperclip, Image, Film, FileText } from 'lucide-react';
import { motion } from 'framer-motion';

export default function TicketDetailView({ ticket, onClose, onFix }) {
  if (!ticket) return null;

  const f = ticket.fields;
  
  const getPriorityColor = (name) => {
    if (['High', 'Highest', 'Critical', 'Blocker'].includes(name)) return 'text-red-400 bg-red-400/10 border-red-400/20';
    if (name === 'Medium') return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
    return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
  };

  const getStatusColor = (name) => {
    if (name.toLowerCase().includes('done')) return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
    if (name.toLowerCase().includes('progress')) return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
    return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
  };

  // ADF (Atlassian Document Format) Rendering Engine
  const renderADF = (node, index) => {
    if (!node) return null;

    switch (node.type) {
      case 'paragraph':
        return (
          <p key={index} className="mb-4 text-slate-300 leading-relaxed">
            {node.content?.map((c, i) => renderADF(c, i))}
          </p>
        );
      
      case 'text':
        if (node.marks) {
          let text = node.text;
          node.marks.forEach(mark => {
            if (mark.type === 'strong') text = <strong key={Math.random()}>{text}</strong>;
            if (mark.type === 'em') text = <em key={Math.random()}>{text}</em>;
            if (mark.type === 'code') text = <code key={Math.random()} className="bg-white/5 px-1 rounded font-mono text-blue-400">{text}</code>;
          });
          return text;
        }
        return node.text;

      case 'bulletList':
        return (
          <ul key={index} className="list-disc list-outside ml-6 mb-4 space-y-2 text-slate-300">
            {node.content?.map((item, i) => renderADF(item, i))}
          </ul>
        );

      case 'orderedList':
        return (
          <ol key={index} className="list-decimal list-outside ml-6 mb-4 space-y-2 text-slate-300">
            {node.content?.map((item, i) => renderADF(item, i))}
          </ol>
        );

      case 'listItem':
        return <li key={index}>{node.content?.map((c, i) => renderADF(c, i))}</li>;

      case 'mention':
        return <span key={index} className="text-blue-400 font-semibold">@{node.attrs.text}</span>;

      case 'mediaSingle':
        if (node.content?.[0]?.attrs?.id) {
          // Media IDs aren't directly accessible without Jira auth; skip silently
          return null;
        }
        return null;

      case 'codeBlock':
        return (
          <pre key={index} className="bg-white/5 rounded-xl p-4 overflow-x-auto mb-4 font-mono text-sm text-blue-300">
            <code>{node.content?.map(c => c.text).join('')}</code>
          </pre>
        );

      case 'heading':
        const Tag = `h${node.attrs.level}`;
        const sizes = { h1: 'text-2xl', h2: 'text-xl', h3: 'text-lg', h4: 'text-base' };
        return <Tag key={index} className={`${sizes[Tag] || 'text-base'} font-bold text-white mt-6 mb-4`}>{node.content?.map((c, i) => renderADF(c, i))}</Tag>;

      default:
        return null;
    }
  };

  const acceptanceCriteria = f.customfield_10060;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-card border border-white/10 w-full max-w-5xl max-h-[92vh] rounded-[2rem] overflow-hidden flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-8 py-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-4">
             <span className="text-xs font-bold text-slate-500 font-mono tracking-wider uppercase">{ticket.key}</span>
             <div className="h-4 w-px bg-white/10" />
             <div className={`px-3 py-1 rounded-full text-[10px] font-bold border ${getPriorityColor(f.priority.name)}`}>
               {f.priority.name}
             </div>
             <div className={`px-3 py-1 rounded-full text-[10px] font-bold border ${getStatusColor(f.status.name)}`}>
               {f.status.name}
             </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-all text-slate-500 hover:text-white border border-transparent hover:border-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-8 lg:p-12 custom-scrollbar">
          <div className="grid grid-cols-12 gap-12">
            {/* Left Content */}
            <div className="col-span-12 lg:col-span-8">
              <h1 className="text-3xl font-bold text-white mb-10 leading-tight tracking-tight">{f.summary}</h1>
              
              <div className="space-y-12">
                <section>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    Description
                  </h3>
                  <div className="text-slate-300">
                    {f.description?.content?.map((node, i) => renderADF(node, i)) || <p className="italic text-slate-500">No description available.</p>}
                  </div>
                </section>

                {acceptanceCriteria && (
                  <section>
                    <h3 className="text-xs font-bold text-emerald-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                      <CheckCircle2 className="w-4 h-4" />
                      Acceptance Criteria
                    </h3>
                    <div className="p-6 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-slate-300">
                      {acceptanceCriteria.content?.map((node, i) => renderADF(node, i))}
                    </div>
                  </section>
                )}

                {/* Comments Section */}
                <section>
                  <h3 className="text-xs font-bold text-indigo-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                    <MessageSquare className="w-4 h-4" />
                    Team Discussion ({f.comment?.total || 0})
                  </h3>
                  <div className="space-y-4">
                    {f.comment?.comments?.length > 0 ? f.comment.comments.map((comment, i) => (
                      <div key={comment.id || i} className="p-6 rounded-2xl bg-white/[0.02] border border-white/10">
                        <div className="flex items-center justify-between mb-4">
                           <div className="flex items-center gap-3">
                              <img
                                src={comment.author?.avatarUrls?.['24x24'] || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(comment.author?.displayName || 'U')}`}
                                alt=""
                                className="w-6 h-6 rounded-full"
                                onError={e => { e.target.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(comment.author?.displayName || 'U')}`; }}
                              />
                              <span className="text-sm font-bold text-slate-200">{comment.author?.displayName || 'Unknown'}</span>
                           </div>
                           <span className="text-[10px] text-slate-500">
                             {comment.created ? new Date(comment.created).toLocaleString() : ''}
                           </span>
                        </div>
                        <div className="text-sm text-slate-400">
                           {comment.body?.content?.map((node, i) => renderADF(node, i))
                             || (typeof comment.body === 'string' && <p className="text-slate-400">{comment.body}</p>)}
                        </div>
                      </div>
                    )) : (
                      <p className="text-sm text-slate-500 italic">No comments yet.</p>
                    )}
                  </div>
                </section>
              </div>
            </div>

            {/* Right Sidebar */}
            <div className="col-span-12 lg:col-span-4 space-y-8">
              <div className="p-8 rounded-[2rem] bg-white/[0.02] border border-white/10 space-y-6">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-4">Project</label>
                  <div className="flex items-center gap-3">
                    <img src={f.project.avatarUrls['24x24']} alt="" className="w-6 h-6 rounded" />
                    <span className="text-sm font-medium text-slate-200">{f.project.name}</span>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-4">Assignee</label>
                  <div className="flex items-center gap-3">
                    <img src={f.assignee?.avatarUrls['24x24']} alt="" className="w-6 h-6 rounded-full" />
                    <span className="text-sm font-medium text-slate-200">{f.assignee?.displayName || 'Unassigned'}</span>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-4">Reporter</label>
                  <div className="flex items-center gap-3">
                    <img src={f.reporter?.avatarUrls['24x24']} alt="" className="w-6 h-6 rounded-full" />
                    <span className="text-sm font-medium text-slate-200">{f.reporter?.displayName}</span>
                  </div>
                </div>

                <div className="h-px bg-white/5" />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Created</label>
                    <div className="text-xs text-slate-300 font-medium">
                      {new Date(f.created).toLocaleDateString()}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Updated</label>
                    <div className="text-xs text-slate-300 font-medium">
                      {new Date(f.updated).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </div>

              {f.attachment?.length > 0 && (
                <div className="p-8 rounded-[2rem] bg-white/[0.02] border border-white/10">
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Paperclip className="w-3 h-3" /> Attachments ({f.attachment.length})
                  </h3>
                  <div className="space-y-3">
                    {f.attachment.map((a, i) => {
                      const isImage = a.isImage || /^image\//i.test(a.mimeType || '');
                      const isVideo = /^video\//i.test(a.mimeType || '');
                      const proxyUrl = a.content || `/api/jira/attachment/${a.id}`;
                      const Icon = isImage ? Image : isVideo ? Film : FileText;
                      return (
                        <div key={a.id || i} className="rounded-xl overflow-hidden border border-white/10">
                          {isImage && (
                            <a href={proxyUrl} target="_blank" rel="noreferrer" className="block">
                              <img
                                src={proxyUrl}
                                alt={a.filename}
                                className="w-full max-h-48 object-contain bg-black/30"
                                onError={e => { e.target.style.display = 'none'; }}
                              />
                            </a>
                          )}
                          <a
                            href={proxyUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between p-3 hover:bg-white/5 transition-colors group"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Icon className="w-4 h-4 text-slate-500 shrink-0" />
                              <span className="text-xs text-slate-400 truncate group-hover:text-blue-400">{a.filename}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              {a.size && <span className="text-[10px] text-slate-600">{a.size}</span>}
                              <ExternalLink className="w-3 h-3 text-slate-600" />
                            </div>
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <a 
                href={`https://simnovus.atlassian.net/browse/${ticket.key}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 w-full py-4 border border-white/10 rounded-2xl text-sm font-bold text-slate-300 hover:bg-white/5 hover:text-white transition-all group"
              >
                Open in Jira <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </a>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-8 py-6 border-t border-white/10 bg-white/[0.02] flex justify-end gap-4">
            <button
              onClick={onClose}
              className="px-6 py-3 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white font-bold rounded-2xl transition-all border border-white/10"
            >
              Close
            </button>
            <button
              onClick={() => onFix(ticket)}
              className="px-10 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition-all shadow-[0_10px_30px_rgba(37,99,235,0.3)] flex items-center gap-2 transform hover:-translate-y-0.5"
            >
              🔧 Fix This Ticket
            </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
