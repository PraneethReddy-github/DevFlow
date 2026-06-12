import { useState, useEffect } from 'react';
import WelcomeScreen from './components/WelcomeScreen';
import Dashboard from './components/Dashboard';

export default function App() {
  const [user, setUser] = useState(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/user');
        const data = await res.json();
        setUser(data);
      } catch (error) {
        console.error("Failed to fetch user", error);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="spinner !w-12 !h-12 border-4"></div>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen text-slate-200 font-sans selection:bg-blue-500/30">
      {showDashboard ? (
        <Dashboard user={user} />
      ) : (
        <WelcomeScreen user={user} onEnter={() => setShowDashboard(true)} />
      )}
    </div>
  );
}
