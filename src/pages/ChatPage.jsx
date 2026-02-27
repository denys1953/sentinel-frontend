import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import Sidebar from '../components/chat/Sidebar';
import ChatArea from '../components/chat/ChatArea';
import EmptyState from '../components/chat/EmptyState';

export default function ChatPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [activeContact, setActiveContact] = useState(() => {
    const saved = sessionStorage.getItem('last_active_contact');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.error("Error parsing session storage active contact", e);
      return null;
    }
  });

  const handleLogout = () => {
    sessionStorage.removeItem('last_active_contact');
    logout();
    navigate('/login');
  };

  const handleContactSelect = (contact) => {
    setActiveContact(contact);
    if (contact) {
      sessionStorage.setItem('last_active_contact', JSON.stringify(contact));
    } else {
      sessionStorage.removeItem('last_active_contact');
    }
  };

  return (
    <div className="flex h-screen bg-slate-900 text-white overflow-hidden font-sans">
      <Sidebar 
        user={user} 
        onLogout={handleLogout} 
        onContactSelect={handleContactSelect}
        activeContactId={activeContact?.conversation_id || activeContact?.id || activeContact?.username}
      />
      <ChatArea activeContact={activeContact} />
    </div>
  );
}
