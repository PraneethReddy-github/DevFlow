import { Users, ExternalLink } from 'lucide-react';

export default function TeamPRs({ prs, loading }) {
  if (loading) return <div className="glass-card h-full p-6 animate-pulse bg-white/5"></div>;

  return (
    <div className="glass-card h-full flex flex-col p-6 overflow-hidden">
      <h2 className="text-lg font-bold flex items-center gap-2 mb-6">
        <Users className="w-5 h-5 text-emerald-400" />
        Recent Team PRs
      </h2>
      
      <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar">
        {prs.map(pr => (
          <a 
            key={pr.id} 
            href={pr.html_url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="block p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl hover:bg-white/[0.05] hover:border-emerald-500/30 transition-all group"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-full overflow-hidden bg-slate-700">
                <img src={pr.user.avatar_url} alt={pr.user.login} className="w-full h-full object-cover" />
              </div>
              <span className="text-[10px] font-bold text-slate-400">@{pr.user.login}</span>
              <div className="flex-1" />
              <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                pr.base.repo.name.includes('frontend') ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
              }`}>
                {pr.base.repo.name.includes('frontend') ? 'Frontend' : 'Backend'}
              </span>
            </div>
            
            <h3 className="text-sm font-medium text-slate-200 line-clamp-1 group-hover:text-emerald-400 transition-colors">
              {pr.title}
            </h3>
          </a>
        ))}
        {prs.length === 0 && <p className="text-sm text-slate-500 italic py-4">No recent team PRs</p>}
      </div>
    </div>
  );
}
