import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertCircle, Clock, List } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function JiraSection({ tickets, loading, onFix, onSelect }) {
  const [expanded, setExpanded] = useState({ yesterday: true, critical: true, all: true });

  if (loading) return <div className="glass-card h-full p-6 animate-pulse bg-white/5"></div>;

  const yesterday = tickets.filter(t => {
      const created = new Date(t.fields.created);
      const now = new Date();
      return (now - created) < 24 * 60 * 60 * 1000;
  });
  const critical = tickets.filter(t => ['High', 'Highest', 'Critical', 'Blocker'].includes(t.fields.priority.name));
  const all = tickets;

  const Section = ({ title, id, count, items, icon: Icon, color }) => (
    <div className="mb-4">
      <button 
        onClick={() => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))}
        className="w-full flex items-center justify-between p-3 hover:bg-white/5 rounded-xl transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${color} bg-opacity-20`}>
            <Icon className={`w-4 h-4 ${color.replace('bg-', 'text-')}`} />
          </div>
          <span className="font-semibold text-slate-200">{title}</span>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/10 text-slate-400">{count}</span>
        </div>
        {expanded[id] ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
      </button>
      
      <AnimatePresence>
        {expanded[id] && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-2 space-y-3 px-2 pb-4">
              {items.map(ticket => (
                <TicketCard key={ticket.id} ticket={ticket} onFix={onFix} onSelect={onSelect} />
              ))}
              {items.length === 0 && <p className="text-sm text-slate-500 py-4 px-4 italic">No tickets found</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="glass-card h-full flex flex-col p-6 overflow-y-auto custom-scrollbar">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <List className="w-5 h-5 text-blue-400" />
          My Jira Tickets
        </h2>
      </div>

      <Section 
        title="Assigned Yesterday" 
        id="yesterday" 
        count={yesterday.length} 
        items={yesterday} 
        icon={Clock} 
        color="bg-blue-500" 
      />
      <Section 
        title="Critical Tickets" 
        id="critical" 
        count={critical.length} 
        items={critical} 
        icon={AlertCircle} 
        color="bg-red-500" 
      />
      <Section 
        title="All My Tickets" 
        id="all" 
        count={all.length} 
        items={all} 
        icon={List} 
        color="bg-slate-500" 
      />
    </div>
  );
}

function TicketCard({ ticket, onFix, onSelect }) {
  const [isHovered, setIsHovered] = useState(false);

  const getPriorityStyles = (name) => {
    if (['High', 'Highest', 'Critical', 'Blocker'].includes(name)) return 'text-red-400 bg-red-400/10 border-red-400/20';
    if (name === 'Medium') return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
    return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
  };

  const getStatusStyles = (name) => {
    if (name.toLowerCase().includes('done')) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (name.toLowerCase().includes('progress')) return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  };

  return (
    <div 
      className="group p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl hover:border-blue-500/30 hover:bg-white/[0.04] transition-all cursor-pointer relative overflow-hidden"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onSelect(ticket)}
    >
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">{ticket.key}</span>
          <div className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getPriorityStyles(ticket.fields.priority.name)}`}>
            {ticket.fields.priority.name}
          </div>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${getStatusStyles(ticket.fields.status.name)}`}>
          {ticket.fields.status.name}
        </span>
      </div>
      
      <h3 className="font-semibold text-slate-200 mb-3 group-hover:text-blue-400 transition-colors leading-snug pr-8">
        {ticket.fields.summary}
      </h3>
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-[8px] font-bold uppercase">
             {ticket.fields.assignee?.displayName.charAt(0) || '?'}
          </div>
          <span className="text-xs text-slate-500">{ticket.fields.assignee?.displayName || 'Unassigned'}</span>
        </div>
      </div>

      <AnimatePresence>
        {isHovered && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute right-4 bottom-4"
          >
            <button 
              onClick={(e) => { e.stopPropagation(); onFix(ticket); }}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-lg shadow-blue-500/20"
            >
              🔧 Fix This Ticket
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
