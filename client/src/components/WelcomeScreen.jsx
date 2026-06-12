import { motion } from 'framer-motion';
import { ArrowRight, Github } from 'lucide-react';

export default function WelcomeScreen({ user, onEnter }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="max-w-2xl"
      >
        <div className="mb-8 flex justify-center">
          <div className="w-20 h-20 rounded-full bg-blue-600/20 flex items-center justify-center border border-blue-500/30">
            <Github className="w-10 h-10 text-blue-400" />
          </div>
        </div>
        
        <h1 className="text-5xl md:text-6xl font-bold mb-4 tracking-tight">
          Welcome, <span className="gradient-blue">{user?.name || user?.login || 'Developer'}</span>
        </h1>
        
        <p className="text-xl text-slate-400 mb-8 font-light">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
        
        <div className="glass-card p-6 mb-12 italic text-slate-300">
          "The best way to predict the future is to invent it."
        </div>
        
        <button
          onClick={onEnter}
          className="group relative px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-semibold text-lg transition-all flex items-center gap-2 mx-auto overflow-hidden"
        >
          <span className="relative z-10">Enter DevFlow</span>
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-blue-400 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity"
            initial={false}
          />
        </button>
      </motion.div>
    </div>
  );
}
