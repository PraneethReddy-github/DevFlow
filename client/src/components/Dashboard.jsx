import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import JiraSection from './JiraSection';
import GitHubSection from './GitHubSection';
import TeamPRs from './TeamPRs';
import AgentPanel from './AgentPanel';
import TicketDetailView from './TicketDetailView';
import { LayoutDashboard, Settings, User, ExternalLink } from 'lucide-react';

export default function Dashboard({ user }) {
  const [jiraTickets, setJiraTickets] = useState([]);
  const [myPRs, setMyPRs] = useState([]);
  const [teamPRs, setTeamPRs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [showAgent, setShowAgent] = useState(false);
  const [detailTicket, setDetailTicket] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [jiraRes, githubRes] = await Promise.all([
        fetch('http://localhost:3001/api/jira/tickets').then(r => r.json()),
        fetch('http://localhost:3001/api/github/prs').then(r => r.json())
      ]);
      setJiraTickets(jiraRes);
      
      const login = user?.login || 'Praneeth-exe';
      setMyPRs(githubRes.frontend.filter(pr => pr.user.login === login).concat(githubRes.backend.filter(pr => pr.user.login === login)));
      setTeamPRs(githubRes.frontend.concat(githubRes.backend));
    } catch (error) {
      console.error("Failed to fetch dashboard data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleFixTicket = (ticket) => {
    setSelectedTicket(ticket);
    setDetailTicket(null);
    setShowAgent(true);
  };

  const handleCloseAgent = (refresh) => {
    setShowAgent(false);
    if (refresh === true) {
      fetchData();
    }
  };

  const handleSelectTicket = async (ticket) => {
    // Show a loading state or just fetch immediately
    try {
      // We can show a "loading" modal here if we want, but for now let's just fetch
      const res = await fetch(`http://localhost:3001/api/jira/tickets/${ticket.key}`);
      const fullTicket = await res.json();
      setDetailTicket(fullTicket);
    } catch (error) {
      console.error("Failed to fetch full ticket details", error);
      // Fallback to the partial data we already have if fetch fails
      setDetailTicket(ticket);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-white/[0.08] flex items-center justify-between px-8 bg-background/50 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <span className="text-xl font-bold gradient-blue tracking-tight">DevFlow</span>
          <div className="h-4 w-px bg-white/10" />
          <nav className="flex items-center gap-6">
            <button className="text-sm font-medium text-white flex items-center gap-2">
              <LayoutDashboard className="w-4 h-4 text-blue-400" />
              Dashboard
            </button>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <a 
            href={user?.html_url || `https://github.com/${user?.login}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 pl-2 pr-4 py-1.5 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 transition-all group overflow-hidden"
          >
            <img src={user?.avatar_url} alt="" className="w-6 h-6 rounded-full border border-white/10" />
            <span className="text-xs font-medium text-slate-300 group-hover:text-white transition-colors">{user?.name || user?.login}</span>
            <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-blue-400 transition-colors" />
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-8 grid grid-cols-12 gap-6 max-w-[1600px] mx-auto w-full">
        {/* Panel 1: Jira Tickets */}
        <div className="col-span-12 lg:col-span-7 xl:col-span-8 h-[calc(100vh-9rem)]">
          <JiraSection 
            tickets={jiraTickets} 
            loading={loading} 
            onFix={handleFixTicket} 
            onSelect={handleSelectTicket}
          />
        </div>

        {/* Right Sidebar Panels */}
        <div className="col-span-12 lg:col-span-5 xl:col-span-4 flex flex-col gap-6 h-[calc(100vh-9rem)]">
          <div className="flex-1 min-h-0">
            <GitHubSection prs={myPRs} loading={loading} />
          </div>
          <div className="flex-1 min-h-0">
            <TeamPRs prs={teamPRs} loading={loading} />
          </div>
        </div>
      </main>

      {/* Ticket Detail Modal */}
      <AnimatePresence>
        {detailTicket && (
          <TicketDetailView 
            ticket={detailTicket} 
            onClose={() => setDetailTicket(null)} 
            onFix={handleFixTicket}
          />
        )}
      </AnimatePresence>

      {/* Agent Activity Side Panel */}
      <AnimatePresence>
        {showAgent && (
          <AgentPanel 
            ticket={selectedTicket} 
            onClose={handleCloseAgent} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}
