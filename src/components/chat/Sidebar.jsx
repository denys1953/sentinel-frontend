import { useState, useRef, useEffect, useCallback } from 'react';
import api from '../../api/axios';
import { useSocket } from '../../context/SocketContext';

export default function Sidebar({ user, onLogout, onContactSelect, activeContactId }) {
  const { messages } = useSocket();
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const isResizing = useRef(false);

  useEffect(() => {
    const fetchConversations = async () => {
      if (!user) return;
      setIsLoadingConversations(true);
      try {
        const response = await api.get('/conversations');
        setConversations(Array.isArray(response.data) ? response.data : []);
      } catch (error) {
        console.error("Fetch conversations error:", error);
      } finally {
        setIsLoadingConversations(false);
      }
    };

    fetchConversations();
  }, [user]);

  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    
    if (!lastMsg.conversation_id) return;

    setConversations(prev => prev.map(conv => {
        if (Number(conv.id) === Number(lastMsg.conversation_id)) {
            let updatedConv = { 
              ...conv, 
              updated_at: lastMsg.created_at || new Date().toISOString() 
            };
            
            const isMe = lastMsg.sender_fp === user?.fingerprint;
            const isCurrentChat = Number(lastMsg.conversation_id) === Number(activeContactId);

            if (!isMe && !isCurrentChat) {
                updatedConv.participants = updatedConv.participants.map(p => {
                    if (p.user?.fingerprint === user?.fingerprint) {
                        return { ...p, unread_count: (p.unread_count || 0) + 1 };
                    }
                    return p;
                });
            }
            return updatedConv;
        }
        return conv;
    }));
  }, [messages.length, user?.fingerprint]); 

  useEffect(() => {
    if (activeContactId) {
        setConversations(prev => prev.map(conv => {
            if (Number(conv.id) === Number(activeContactId)) {
                return {
                    ...conv,
                    participants: conv.participants.map(p => {
                        if (p.user?.fingerprint === user?.fingerprint) {
                            return { ...p, unread_count: 0 };
                        }
                        return p;
                    })
                };
            }
            return conv;
        }));
    }
  }, [activeContactId, user?.fingerprint]);

  const handleSelect = (contact, convId) => {
    onContactSelect(contact);
  };

  const startResizing = useCallback(() => {
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const stopResizing = useCallback(() => {
    isResizing.current = false;
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  }, []);

  const resize = useCallback((e) => {
    if (isResizing.current) {
      const newWidth = e.clientX;
      if (newWidth > 240 && newWidth < 600) {
        setSidebarWidth(newWidth);
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  const getOtherParticipant = (participants) => {
    if (!participants || !Array.isArray(participants)) return null;
    const participant = participants.find(p => p.user?.fingerprint !== user?.fingerprint);
    return participant?.user || null;
  };

  const getMyUnreadCount = (participants) => {
    if (!participants || !Array.isArray(participants)) return 0;
    const me = participants.find(p => p.user?.fingerprint === user?.fingerprint);
    return me?.unread_count || 0;
  };

  useEffect(() => {
    const fetchUsers = async () => {
      const term = searchQuery.trim();
      if (!term) {
        setSearchResults([]);
        return;
      }
      
      setIsSearching(true);
      try {
        const response = await api.get('/users', { params: { search: term } });
        const results = Array.isArray(response.data) ? response.data : [];
        setSearchResults(results.filter(u => u.username !== user?.username));
      } catch (error) {
        console.error("Search error:", error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    const debounceTimer = setTimeout(fetchUsers, 500);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery, user?.username]);

  return (
    <aside 
      style={{ width: `${sidebarWidth}px` }}
      className="flex flex-col border-r border-slate-800 bg-slate-800/50 backdrop-blur-sm relative shrink-0"
    >
      <div className="h-16 flex items-center px-4 border-b border-slate-700/50">        
        {/* Search Input */}
        <div className="relative w-full">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
            {isSearching ? (
              <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-blue-500 animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
          </span>
          <input
            type="text"
            className="w-full bg-slate-900/50 text-slate-200 text-sm rounded-xl py-2 pl-10 pr-4 border border-slate-700 focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-slate-600"
            placeholder="Пошук..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Main sidebar area for chats or search results */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 mt-2">
        {searchQuery.trim() ? (
          <div className="flex flex-col gap-1">
            <h3 className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Результати пошуку
            </h3>
            {searchResults.length > 0 ? (
              searchResults.map((contact) => (
                <button
                  key={contact.id || contact.username}
                  onClick={() => onContactSelect(contact)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors group text-left ${
                    (activeContactId === (contact.id || contact.username))
                    ? 'bg-blue-600 text-white' 
                    : 'hover:bg-slate-700/50 text-slate-200'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors ${
                    (activeContactId === (contact.id || contact.username))
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-700 text-blue-400 group-hover:bg-blue-600 group-hover:text-white'
                  }`}>
                    {contact.username?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="font-medium truncate">{contact.username}</div>
                    <div className={`text-xs truncate ${
                      (activeContactId === (contact.id || contact.username))
                      ? 'text-blue-100'
                      : 'text-slate-500'
                    }`}>Додати до розмови</div>
                  </div>
                </button>
              ))
            ) : !isSearching ? (
              <p className="text-center text-slate-500 text-sm mt-4">Нікого не знайдено</p>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <h3 className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Активні чати
            </h3>
            {conversations.length > 0 ? (
              [...conversations]
                .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
                .map((conv) => {
                const other = getOtherParticipant(conv.participants);
                if (!other) return null;

                const isActive = activeContactId === conv.id;
                const unreadCount = getMyUnreadCount(conv.participants);
                
                return (
                  <button
                    key={conv.id}
                    onClick={() => handleSelect({ ...other, conversation_id: conv.id }, conv.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors group text-left ${
                      isActive ? 'bg-blue-600 text-white' : 'hover:bg-slate-700/50 text-slate-200'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors shrink-0 ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-700 text-blue-400 group-hover:bg-blue-600 group-hover:text-white'
                    }`}>
                      {other.username?.[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 overflow-hidden pr-2">
                      <div className="font-medium truncate">{other.username}</div>
                      <div className={`text-xs truncate ${isActive ? 'text-blue-100' : 'text-slate-500'}`}>
                        {conv.type === 'direct' ? 'Особистий чат' : 'Груповий чат'}
                      </div>
                    </div>
                    {unreadCount > 0 && !isActive && (
                      <div className="bg-red-500 text-white text-[10px] font-bold h-5 min-w-[20px] px-1.5 rounded-full flex items-center justify-center shadow-lg animate-in zoom-in-50 duration-200">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </div>
                    )}
                  </button>
                );
              })
            ) : isLoadingConversations ? (
              <p className="text-center text-slate-500 text-sm mt-4 animate-pulse">Завантаження...</p>
            ) : (
              <p className="text-center text-slate-500 text-sm mt-4 italic px-4">
                Немає активних чатів. Скористайтеся пошуком, щоб почати розмову.
              </p>
            )}
          </div>
        )}
      </div>

      {/* User Info & Logout Button */}
      <div className="p-4 border-t border-slate-700/50 bg-slate-800">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-hidden text-nowrap">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold shrink-0">
              {user?.username?.[0]?.toUpperCase() || 'U'}
            </div>
            <span className="truncate text-sm font-medium">{user?.username}</span>
          </div>
          <button 
            onClick={onLogout}
            className="px-3 py-1.5 bg-slate-700 hover:bg-red-600/20 hover:text-red-500 text-slate-300 text-xs font-medium rounded-lg transition-all duration-200 border border-slate-600 shrink-0"
          >
            Вийти
          </button>
        </div>
      </div>

      {/* Resize Handle */}
      <div 
        onMouseDown={startResizing}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500/30 transition-colors group"
      >
        <div className="absolute top-0 right-0 w-[1px] h-full bg-slate-800 group-hover:bg-blue-500/50" />
      </div>
    </aside>
  );
}
