import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import api from '../../api/axios';
import { useSocket } from '../../context/SocketContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import ProfileModal from './ProfileModal';

export default function Sidebar({ user, onLogout, onContactSelect, activeContactId, activeContact }) {
  const { messages } = useSocket();
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const isResizing = useRef(false);

  const fingerprintsToTrack = useMemo(() => {
    return conversations
      .map(c => c.participants.find(p => p.user?.fingerprint !== user?.fingerprint)?.user?.fingerprint)
      .filter(Boolean);
  }, [conversations, user?.fingerprint]);

  const onlineStatuses = useOnlineStatus(fingerprintsToTrack, 30000);

  useEffect(() => {
    const fetchConversations = async () => {
      if (!user) return;
      setIsLoadingConversations(true);
      try {
        const response = await api.get('/conversations/');
        setConversations(Array.isArray(response.data) ? response.data : []);
      } catch (error) {
        console.error("Fetch conversations error:", error);
      } finally {
        setIsLoadingConversations(false);
      }
    };

    window.__triggerSidebarUpdate = () => {
      fetchConversations();
    };

    fetchConversations();

    return () => {
      delete window.__triggerSidebarUpdate;
    };
  }, [user]);

  // Removed manual messages-based sorting update because it caused jumping during history loads.
  // Instead, we rely on window.__triggerSidebarUpdate() which is called by SocketContext 
  // whenever a real new message arrives or is edited.

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

  useEffect(() => {
  }, [conversations, user?.fingerprint]);

  const handleSelect = (contact, convId) => {
    onContactSelect(contact);
    setSearchQuery('');
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

  useEffect(() => {
    if (activeContact && conversations.length > 0) {
       const activeConv = conversations.find(c => {
           const other = getOtherParticipant(c.participants);
           return other && (other.id === activeContact.id || other.username === activeContact.username || other.fingerprint === activeContact.fingerprint);
       });
       
       if (activeConv) {
           const other = getOtherParticipant(activeConv.participants);
           if (!activeContact.conversation_id || other.avatar_url !== activeContact.avatar_url || other.username !== activeContact.username) {
               onContactSelect({ ...other, conversation_id: activeConv.id });
           }
       }
    }
  }, [conversations, activeContact, user?.fingerprint]);

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
        const response = await api.get('/users/', { params: { search: term } });
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
      style={{ '--sidebar-width': `${sidebarWidth}px` }}
      className="flex flex-col border-r border-slate-800 bg-slate-800/50 backdrop-blur-sm relative shrink-0 w-full md:w-[var(--sidebar-width)]"
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
                  onClick={() => handleSelect(contact)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors group text-left ${
                    (activeContactId === (contact.id || contact.username))
                    ? 'bg-blue-600 text-white' 
                    : 'hover:bg-slate-700/50 text-slate-200'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors overflow-hidden ${
                    (activeContactId === (contact.id || contact.username))
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-700 text-blue-400 group-hover:bg-blue-600 group-hover:text-white'
                  }`}>
                    {contact.avatar_url ? (
                      <img src={contact.avatar_url} alt={contact.username} className="w-full h-full object-cover" />
                    ) : (
                      contact.username?.[0]?.toUpperCase()
                    )}
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
                .sort((a, b) => {
                  const dateA = new Date(a.updated_at).getTime();
                  const dateB = new Date(b.updated_at).getTime();
                  if (dateB !== dateA) return dateB - dateA;
                  return b.id - a.id; // Стабільне сортування
                })
                .map((conv) => {
                const other = getOtherParticipant(conv.participants);
                if (!other) return null;

                const isActive = activeContactId === conv.id;
                const unreadCount = getMyUnreadCount(conv.participants);
                const isOnline = onlineStatuses[other.fingerprint];
                
                return (
                  <button
                    key={conv.id}
                    onClick={() => handleSelect({ ...other, conversation_id: conv.id }, conv.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors group text-left ${
                      isActive ? 'bg-blue-600 text-white' : 'hover:bg-slate-700/50 text-slate-200'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors overflow-hidden ${
                        isActive ? 'bg-white/20 text-white' : 'bg-slate-700 text-blue-400 group-hover:bg-blue-600 group-hover:text-white'
                      }`}>
                        {other.avatar_url ? (
                          <img src={other.avatar_url} alt={other.username} className="w-full h-full object-cover" />
                        ) : (
                          other.username?.[0]?.toUpperCase()
                        )}
                      </div>
                      {isOnline && (
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-slate-900 rounded-full shadow-sm"></div>
                      )}
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
          <button 
            onClick={() => setIsProfileOpen(true)}
            className="flex items-center gap-3 overflow-hidden text-nowrap flex-1 hover:bg-slate-700/50 rounded-lg p-1 -ml-1 transition-colors group text-left"
          >
            <div className="relative shrink-0">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={user.username} className="w-10 h-10 rounded-full object-cover shadow-md" />
              ) : (
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md">
                  {user?.username?.[0]?.toUpperCase() || 'U'}
                </div>
              )}
              <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 transition-colors duration-300 bg-green-500" />
            </div>
            
            <div className="flex flex-col truncate">
              <span className="font-bold text-white text-lg leading-tight group-hover:text-blue-100 transition-colors truncate">{user?.username}</span>
              <span className="text-xs font-medium text-green-500 mt-0.5">
                Онлайн
              </span>
            </div>
          </button>
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
        className="absolute top-0 -right-1 w-2 h-full cursor-col-resize hover:bg-blue-500/30 transition-colors group z-10"
      >
        <div className="absolute top-0 right-[3px] w-[1px] h-full bg-slate-800 group-hover:bg-blue-500/50" />
      </div>

      {isProfileOpen && (
        <ProfileModal onClose={() => setIsProfileOpen(false)} />
      )}
    </aside>
  );
}
