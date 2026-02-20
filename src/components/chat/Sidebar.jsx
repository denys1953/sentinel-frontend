import { useState, useRef, useEffect, useCallback } from 'react';
import api from '../../api/axios';

export default function Sidebar({ user, onLogout }) {
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const isResizing = useRef(false);

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

  useEffect(() => {
    const fetchUsers = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }
      
      setIsSearching(true);
      try {
        const response = await api.get(`/users?search=${searchQuery.trim()}`);
        const filteredUsers = response.data.filter(u => u.username !== user?.username);
        setSearchResults(filteredUsers);
      } catch (error) {
        console.error("Search error:", error);
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
      <div className="p-6 border-b border-slate-700/50">        
        {/* Search Input */}
        <div className="relative">
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
            placeholder="Пошук контактів..."
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
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-700/50 transition-colors group text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    {contact.username?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="font-medium truncate text-slate-200">{contact.username}</div>
                    <div className="text-xs text-slate-500 truncate">Додати до розмови</div>
                  </div>
                </button>
              ))
            ) : !isSearching ? (
              <p className="text-center text-slate-500 text-sm mt-4">Нікого не знайдено</p>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-2 p-4 text-center">
            <p className="text-slate-500 text-sm">Ваші активні чати будуть тут</p>
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
