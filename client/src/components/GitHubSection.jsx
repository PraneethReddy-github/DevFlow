import { ExternalLink, GitPullRequest } from 'lucide-react';

export default function GitHubSection({ prs, loading }) {
  if (loading) return <div className="glass-card h-full p-6 animate-pulse bg-white/5"></div>;

  return (
    <div className="glass-card h-full flex flex-col p-6 overflow-hidden">
      <h2 className="text-lg font-bold flex items-center gap-2 mb-6">
        <GitPullRequest className="w-5 h-5 text-indigo-400" />
        My GitHub PRs
      </h2>
      
      <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar">
        {prs.map(pr => (
          <a 
            key={pr.id} 
            href={pr.html_url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="block p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl hover:bg-white/[0.05] hover:border-indigo-500/30 transition-all group"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-slate-500 font-mono">#{pr.number} · {pr.base.repo.name}</span>
              <ExternalLink className="w-3 h-3 text-slate-600 group-hover:text-indigo-400 transition-colors" />
            </div>
            <h3 className="text-sm font-medium text-slate-200 line-clamp-1 mb-2 group-hover:text-indigo-400 transition-colors">
              {pr.title}
            </h3>
            <div className="flex items-center gap-3">
               <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${pr.draft ? 'bg-slate-500/10 text-slate-400' : 'bg-green-500/10 text-green-400'}`}>
                 {pr.draft ? 'Draft' : 'Open'}
               </span>
               <span className="text-[10px] text-slate-500 font-medium">
                 {pr.comments} comments
               </span>
            </div>
          </a>
        ))}
        {prs.length === 0 && <p className="text-sm text-slate-500 italic py-4">No open PRs found</p>}
      </div>
    </div>
  );
}
