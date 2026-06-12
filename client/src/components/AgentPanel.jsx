import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Bot, Terminal, CheckCircle2, AlertCircle, FileCode, User, ChevronRight } from 'lucide-react';

const ColorizedDiff = ({ diff }) => {
    if (!diff) return null;
    const lines = diff.split('\n');
    return (
        <div className="mt-3 p-4 bg-black/60 rounded-2xl font-mono text-[11px] overflow-x-auto whitespace-pre leading-relaxed border border-white/5 shadow-inner">
            {lines.map((line, i) => {
                let colorClass = "text-slate-400";
                if (line.startsWith('+') && !line.startsWith('+++')) colorClass = "text-emerald-400 bg-emerald-400/5";
                else if (line.startsWith('-') && !line.startsWith('---')) colorClass = "text-red-400 bg-red-400/5";
                else if (line.startsWith('@@')) colorClass = "text-blue-400/60";
                else if (line.startsWith('---') || line.startsWith('+++')) colorClass = "text-white font-bold";
                
                return (
                    <div key={i} className={`${colorClass} px-1 rounded-sm`}>
                        {line}
                    </div>
                );
            })}
        </div>
    );
};

const ThinkingIndicator = ({ activity }) => (
    <div className="flex gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4 animate-pulse" />
        </div>
        <div className="p-4 bg-white/[0.04] border border-white/[0.06] rounded-2xl rounded-tl-none flex flex-col gap-2">
            <div className="flex gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500/40 animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500/40 animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500/40 animate-bounce"></span>
            </div>
            {activity && (
                <div className="text-[10px] text-blue-400/60 font-medium animate-in fade-in slide-in-from-left-2 duration-300">
                    {activity}
                </div>
            )}
        </div>
    </div>
);

export default function AgentPanel({ ticket, onClose }) {
  const [logs, setLogs] = useState([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('initializing'); // initializing, working, reviewing, generating_pr, confirm_pr, finalizing, done
  const [currentActivity, setCurrentActivity] = useState('');
  const [result, setResult] = useState(null);
  const [prDetails, setPrDetails] = useState({ commitMsg: '', prDesc: '' });
  const [selectedReviewers, setSelectedReviewers] = useState(['gabisimn', 'gauravsimnovus', 'simnovusadmin']);
  const [finalResult, setFinalResult] = useState(null);
  const logEndRef = useRef(null);
  const eventSourceRef = useRef(null);

  const allReviewers = ['gabisimn', 'gauravsimnovus', 'riteshsimnovus', 'SIM-rohit', 'simnovusadmin'];

  const toggleReviewer = (login) => {
    setSelectedReviewers(prev => 
        prev.includes(login) ? prev.filter(r => r !== login) : [...prev, login]
    );
  };

  useEffect(() => {
    const eventSource = new EventSource(`http://localhost:3001/api/fix/${ticket.key}`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'heartbeat' || (data.type === 'system' && data.message === 'Agent is working...')) {
          if (data.details?.isLoading) setStatus('working');
          return;
      }

      if (data.type === 'agent-status') {
          setCurrentActivity(data.message);
          return;
      }

      if (data.type === 'system' && data.message === 'Agent finished implementation') {
          setResult(data.details);
          setStatus('reviewing');
          setCurrentActivity('');
      } else {
          setLogs(prev => [...prev, { ...data, id: Date.now(), time: new Date(data.time) }]);
          
          if (data.message.includes('Cleaning workspace')) setStatus('preparing');
          else if (data.message.includes('Reading ticket')) setStatus('reading');
          else if (data.message.includes('Implementation round finished')) {
              setResult(data.details);
              setStatus('reviewing');
              setCurrentActivity('');
          }
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE Error:", err);
    };

    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, [ticket.key]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const msg = input;
    setInput('');
    setLogs(prev => [...prev, { id: Date.now(), type: 'user', message: msg, time: new Date() }]);
    
    try {
        await fetch(`http://localhost:3001/api/fix/${ticket.key}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg })
        });
    } catch (e) {
        console.error("Failed to send chat", e);
    }
  };

  const handleApproveChanges = async () => {
      setStatus('generating_pr');
      try {
          const res = await fetch(`http://localhost:3001/api/fix/${ticket.key}/approve`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ticket: result.ticket, diff: result.diff })
          });
          const data = await res.json();
          setPrDetails(data);
          setStatus('confirm_pr');
      } catch (e) {
          console.error("Failed to generate PR details", e);
          setStatus('reviewing');
      }
  };

  const handleFinalizePR = async () => {
    setStatus('finalizing');
    try {
        const res = await fetch(`http://localhost:3001/api/fix/${ticket.key}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                ticket: result.ticket, 
                commitMsg: prDetails.commitMsg, 
                prDesc: prDetails.prDesc,
                reviewers: selectedReviewers,
                finalize: true 
            })
        });
        const data = await res.json();
        setFinalResult(data);
        setStatus('done');
        if (eventSourceRef.current) eventSourceRef.current.close();
    } catch (e) {
        console.error("Failed to finalize PR", e);
        setStatus('confirm_pr');
    }
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed top-0 right-0 h-screen w-full max-w-lg bg-card border-l border-white/10 shadow-2xl z-50 flex flex-col"
    >
      {/* Panel Header */}
      <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center border border-blue-500/30">
            <Bot className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h2 className="font-bold text-slate-200">Agent Activity</h2>
            <div className="flex items-center gap-2">
               <span className={`flex h-2 w-2 rounded-full ${status === 'done' ? 'bg-green-500' : 'bg-blue-500 animate-pulse'}`}></span>
               <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">
                 {status === 'done' ? 'PR Raised' : `Status: ${status.replace('_', ' ')}`}
               </span>
            </div>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors text-slate-500 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Activity Log */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
        {logs.map(log => (
          <div key={log.id} className={`flex gap-3 ${log.type === 'user' ? 'flex-row-reverse' : ''}`}>
             <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${
               log.type === 'agent' ? 'bg-blue-600/20 text-blue-400' : 
               log.type === 'system' ? 'bg-slate-800 text-slate-400' :
               'bg-indigo-600 text-white'
             }`}>
               {log.type === 'agent' ? <Bot className="w-4 h-4" /> : 
                log.type === 'system' ? <Terminal className="w-4 h-4" /> : 
                <User className="w-4 h-4" />}
             </div>
             <div className={`max-w-[85%] ${log.type === 'user' ? 'text-right' : ''}`}>
                <div className={`p-3 rounded-2xl text-sm ${
                  log.type === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 
                  'bg-white/[0.04] text-slate-300 rounded-tl-none border border-white/[0.06]'
                }`}>
                  {log.message}
                  {log.details?.diff && <ColorizedDiff diff={log.details.diff} />}
                </div>
                <span className="text-[10px] text-slate-600 mt-1 block px-1">
                  {new Date(log.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
             </div>
          </div>
        ))}

        {['working', 'preparing', 'reading', 'searching', 'analyzing', 'implementing'].includes(status) && (
            <ThinkingIndicator activity={currentActivity} />
        )}

        {status === 'reviewing' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 bg-blue-600/10 border border-blue-600/20 rounded-2xl mt-4 shadow-lg shadow-blue-500/5"
            >
                <h3 className="font-bold text-blue-400 mb-2">Step 1: Review Changes</h3>
                <p className="text-xs text-slate-400 mb-4 leading-relaxed">The agent has finished the fix. Review the diff above. If it looks good, proceed to generate PR details. If not, <strong>type requested changes in the chat</strong>.</p>
                <button 
                    onClick={handleApproveChanges}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                >
                    ✅ Approve Changes <ChevronRight className="w-4 h-4" />
                </button>
            </motion.div>
        )}

        {status === 'generating_pr' && (
            <div className="flex flex-col items-center justify-center p-8 gap-4">
                <div className="spinner !w-8 !h-8 border-3 border-indigo-500" />
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest text-center animate-pulse">Drafting PR description...</p>
            </div>
        )}

        {status === 'confirm_pr' && (
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-6 bg-indigo-500/5 border border-indigo-500/20 rounded-3xl mt-4 space-y-6 shadow-2xl"
            >
                <div className="flex items-center gap-3 text-indigo-400">
                    <FileCode className="w-5 h-5" />
                    <h3 className="font-bold">Step 2: Confirm PR Metadata</h3>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2 px-1">Commit Message</label>
                        <textarea 
                            value={prDetails.commitMsg}
                            onChange={(e) => setPrDetails({...prDetails, commitMsg: e.target.value})}
                            className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-xs text-slate-300 focus:outline-none focus:border-indigo-500/50 min-h-[60px] custom-scrollbar"
                            placeholder="Drafting..."
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2 px-1">PR Description</label>
                        <textarea 
                            value={prDetails.prDesc}
                            onChange={(e) => setPrDetails({...prDetails, prDesc: e.target.value})}
                            className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-xs text-slate-300 focus:outline-none focus:border-indigo-500/50 min-h-[120px] custom-scrollbar"
                            placeholder="Drafting..."
                        />
                    </div>
                </div>

                <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3 px-1">Assign Reviewers</label>
                    <div className="flex flex-wrap gap-2">
                        {allReviewers.map(login => {
                            const isSelected = selectedReviewers.includes(login);
                            return (
                                <button
                                    key={login}
                                    onClick={() => toggleReviewer(login)}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold transition-all border ${
                                        isSelected 
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-lg shadow-emerald-500/5' 
                                        : 'bg-white/5 text-slate-500 border-white/5 grayscale opacity-50'
                                    }`}
                                >
                                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
                                        isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'
                                    }`}>
                                        {isSelected && <CheckCircle2 className="w-2.5 h-2.5 text-black" />}
                                    </div>
                                    {login}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <button 
                    onClick={handleFinalizePR}
                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
                >
                    🚀 Finalize & Raise PR
                </button>
                <p className="text-[10px] text-center text-slate-600 italic">Or type in chat to request edits to these details</p>
            </motion.div>
        )}

        {status === 'finalizing' && (
            <div className="flex flex-col items-center justify-center p-8 gap-4">
                <div className="spinner !w-8 !h-8 border-3 border-emerald-500" />
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest text-center animate-pulse">Pushing branch & Raising PR...</p>
            </div>
        )}

        {status === 'done' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-8 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl mt-4 text-center"
            >
                <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <h3 className="font-bold text-white text-lg mb-2">PR Raised Successfully!</h3>
                <p className="text-sm text-slate-400 mb-8 leading-relaxed">
                    Branch <code className="bg-white/5 px-1.5 py-0.5 rounded text-blue-400 font-mono">{finalResult?.branchName}</code> has been pushed and your PR is live. Workspace reset to main.
                </p>
                <button 
                  onClick={() => onClose(true)}
                  className="w-full py-3 bg-white text-black font-bold rounded-xl transition-all hover:bg-slate-200"
                >
                    Back to Dashboard
                </button>
            </motion.div>
        )}
        <div ref={logEndRef} />
      </div>

      {/* Chat Input */}
      {status !== 'done' && status !== 'finalizing' && status !== 'generating_pr' && (
        <div className="p-6 border-t border-white/10 bg-white/[0.01]">
            <div className="relative">
            <input 
                type="text" 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask a question or provide feedback..."
                className="w-full bg-white/[0.05] border border-white/10 rounded-2xl py-4 pl-5 pr-14 text-sm focus:outline-none focus:border-blue-500/50 transition-all text-slate-200"
            />
            <button 
                onClick={handleSend}
                className="absolute right-3 top-3 p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all"
            >
                <Send className="w-4 h-4" />
            </button>
            </div>
        </div>
      )}
    </motion.div>
  );
}
