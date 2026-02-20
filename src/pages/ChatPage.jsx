import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ChatPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-8 border-b border-slate-700 pb-4">
          <h1 className="text-2xl font-bold">Sentinel Messenger</h1>
          <div className="flex items-center gap-4">
            <span>Вітаємо, {user?.username}!</span>
            <button 
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded transition"
            >
              Вийти
            </button>
          </div>
        </header>

        <div className="bg-slate-800 rounded-xl h-[600px] flex items-center justify-center p-8 border border-slate-700">
          <p className="text-slate-400 text-lg">Виберіть чат для початку спілкування</p>
        </div>
      </div>
    </div>
  );
}
