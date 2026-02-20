import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/chat/Sidebar';
import ChatArea from '../components/chat/ChatArea';
import EmptyState from '../components/chat/EmptyState';

export default function ChatPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-slate-900 text-white overflow-hidden font-sans">
      <Sidebar user={user} onLogout={handleLogout} />
      <ChatArea>
        <EmptyState />
      </ChatArea>
    </div>
  );
}
