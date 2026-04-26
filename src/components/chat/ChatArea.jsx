import { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useSemanticSearch } from '../../hooks/useSemanticSearch';
import EmptyState from './EmptyState';
import { db } from '../../services/db';

export default function ChatArea({ activeContact, onBack }) {
  const [messageText, setMessageText] = useState('');
  const { messages, sendMessage, fetchMessages, setCurrentChat, isConnected, deleteMessage, editMessage } = useSocket();
  const { user } = useAuth();
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const lastMessageIdRef = useRef(null);
  const prevScrollHeightRef = useRef(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [msgToDelete, setMsgToDelete] = useState(null);
  const [activeTouchMessageId, setActiveTouchMessageId] = useState(null);
  const touchTimerRef = useRef(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [replyingToMessage, setReplyingToMessage] = useState(null);
  const [showUserInfo, setShowUserInfo] = useState(false);
  
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  
  const [isSemanticSearch, setIsSemanticSearch] = useState(false);
  const [semanticSearching, setSemanticSearching] = useState(false);
  const { initModel, isReady, modelLoading, progress, search: doSemanticSearch, indexMessages } = useSemanticSearch();
  
  const onlineStatuses = useOnlineStatus(activeContact?.fingerprint, 30000);
  const isOnline = activeContact ? !!onlineStatuses[activeContact.fingerprint] : false;

  useEffect(() => {
    if (!isSearchOpen || !searchQuery.trim() || !activeContact?.conversation_id) {
       setSearchResults([]);
       return;
    }
    
    const fetchSearchResults = async () => {
       const allMsgs = await db.messages.where('conversation_id').equals(Number(activeContact.conversation_id)).toArray();
       
       if (isSemanticSearch) {
          if (!isReady) {
             await initModel(); 
          }
          setSemanticSearching(true);
          indexMessages(allMsgs);
          const matches = await doSemanticSearch(searchQuery, allMsgs);
          setSearchResults(matches);
          setSemanticSearching(false);
       } else {
           const query = searchQuery.toLowerCase();
           const matches = allMsgs.filter(m => m.content && m.content.toLowerCase().includes(query));
           setSearchResults(matches.sort((a,b) => new Date(a.created_at) - new Date(b.created_at)));
       }
    };
    
    const timer = setTimeout(() => fetchSearchResults(), isSemanticSearch ? 500 : 200); 
    return () => clearTimeout(timer);
  }, [searchQuery, isSearchOpen, activeContact?.conversation_id, isSemanticSearch, isReady, doSemanticSearch, initModel, indexMessages]);

  const highlightText = (text, highlight) => {
    if (!highlight.trim()) return text;
    const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
    return parts.map((part, index) => 
      part.toLowerCase() === highlight.toLowerCase() ? 
        <span key={index} className="bg-yellow-500/40 text-yellow-100 rounded px-0.5 shadow-sm">{part}</span> : part
    );
  };

  useEffect(() => {
    setHasMore(true); 
    lastMessageIdRef.current = null;
    if (activeContact?.conversation_id) {
       fetchMessages(activeContact.conversation_id, 0);
       setCurrentChat(activeContact.conversation_id);
    } else {
       setCurrentChat(null);
    }
  }, [activeContact?.conversation_id, fetchMessages]);

  const activeMessages = useMemo(() => messages.filter(m => {
    if (activeContact?.conversation_id) {
      return Number(m.conversation_id) === Number(activeContact.conversation_id);
    }
    
    const isFromMe = (m.sender_fp === user?.fingerprint);
    const isFromContact = (m.sender_fp === activeContact?.fingerprint);
    const isToContact = (m.recipient_fp === activeContact?.fingerprint);

    return (isFromMe && isToContact) || isFromContact;
  }), [messages, activeContact, user]);

  useLayoutEffect(() => {
    if (prevScrollHeightRef.current && messagesContainerRef.current) {
        const newHeight = messagesContainerRef.current.scrollHeight;
        if (newHeight > prevScrollHeightRef.current) {
            const diff = newHeight - prevScrollHeightRef.current;
            messagesContainerRef.current.scrollTop = diff;
            prevScrollHeightRef.current = null;
        }
    }
  }, [activeMessages]);

  useEffect(() => {
    if (!loadingMore && activeMessages.length > 0) {
        const lastMsg = activeMessages[activeMessages.length - 1];
        if (lastMsg.id !== lastMessageIdRef.current) {
            lastMessageIdRef.current = lastMsg.id;
            messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
        }
    }
  }, [activeMessages, loadingMore]);

  const jumpToMessage = async (msgId) => {
    setIsSearchOpen(false);
    setSearchQuery('');
    
    setTimeout(async () => {
      const tryHighlight = () => {
         const el = document.getElementById(`msg-${msgId}`);
         if (el) {
             el.scrollIntoView({ behavior: 'smooth', block: 'center' });
             const bubble = el.querySelector('.message-bubble');
             if (bubble) {
                bubble.classList.add('ring-2', 'ring-amber-500', 'animate-pulse');
                setTimeout(() => bubble.classList.remove('ring-2', 'ring-amber-500', 'animate-pulse'), 3000);
             }
             return true;
         }
         return false;
      };

      if (tryHighlight()) return;
      
      let loadedMore = true;
      let currentLength = messagesContainerRef.current?.children.length || 0; 
      
      const loadInterval = setInterval(async () => {
          if (tryHighlight()) {
              clearInterval(loadInterval);
              return;
          }
          if (!hasMore || loadingMore) return;
          
          if (messagesContainerRef.current) {
              setLoadingMore(true);
              const count = await fetchMessages(activeContact.conversation_id, activeMessages.length);
              setLoadingMore(false);
              if (count === 0) setHasMore(false);
          }
      }, 500);

      setTimeout(() => clearInterval(loadInterval), 10000);
    }, 100);
  };

  const handleScroll = async (e) => {
    const { scrollTop, scrollHeight } = e.currentTarget;
    
    if (scrollTop === 0 && !loadingMore && hasMore && activeContact?.conversation_id) {
        setLoadingMore(true);
        prevScrollHeightRef.current = scrollHeight;
        
        const loadedCount = await fetchMessages(activeContact.conversation_id, activeMessages.length);
        
        if (loadedCount < 50) {
            setHasMore(false);
        }
        
        setLoadingMore(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (messageText.trim() && activeContact) {
      if (editingMessageId) {
        editMessage(editingMessageId, messageText.trim(), activeContact);
        setEditingMessageId(null);
      } else {
        sendMessage(messageText.trim(), activeContact, replyingToMessage?.id);
        setReplyingToMessage(null);
      }
      setMessageText('');
    }
  };

  const handleEditInit = (msg) => {
    setEditingMessageId(msg.id);
    setReplyingToMessage(null);
    setMessageText(msg.content);
  };

  const handleReplyInit = (msg) => {
    setReplyingToMessage(msg);
    setEditingMessageId(null);
    document.querySelector('footer input')?.focus();
  };

  const formatDateLabel = (date) => {
    const d = new Date(date);
    const now = new Date();
    
    if (d.toDateString() === now.toDateString()) return "Сьогодні";
    
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Вчора";
    
    return d.toLocaleDateString('uk-UA', { 
      day: 'numeric', 
      month: 'long', 
      year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' 
    });
  };

  if (!activeContact) {
    return (
      <main className="flex-1 flex flex-col bg-slate-900/50 relative w-full h-full">
        <EmptyState />
      </main>
    );
  }

  return (
    <main className="w-full flex-1 flex flex-col bg-slate-900/50 relative text-slate-200">
      <header className="p-4 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 flex items-center justify-between sticky top-0 z-10 transition-colors">
        <div className="flex items-center gap-3">
          <button 
            onClick={(e) => { e.stopPropagation(); onBack(); }}
            className="md:hidden p-2 -ml-2 text-slate-400 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          <div 
            className="flex items-center gap-3 cursor-pointer p-1 -ml-1 rounded-lg hover:bg-white/5 transition-colors"
            onClick={() => setShowUserInfo(true)}
          >
            <div className="relative">
              {activeContact?.avatar_url ? (
                <img 
                  src={activeContact.avatar_url} 
                  alt={activeContact.username} 
                  className="w-10 h-10 rounded-full object-cover shadow-md"
                />
              ) : (
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md">
                  {activeContact?.username?.[0]?.toUpperCase()}
                </div>
              )}
              <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 transition-colors duration-300 ${
                isOnline ? 'bg-green-500' : 'bg-slate-500'
              }`} />
            </div>
            
            <div>
              <h2 className="font-bold text-white text-lg leading-tight">{activeContact?.username}</h2>
              <p className={`text-xs font-medium ${isOnline ? 'text-green-500' : 'text-slate-400'}`}>
                {isOnline ? 'Онлайн' : 'Не в мережі'}
              </p>
            </div>
          </div>
        </div>
        {isSearchOpen ? (
          <div className="flex w-full flex-col gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-slate-400 shrink-0 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input 
                autoFocus
                type="text"
                placeholder={isSemanticSearch ? "Опишіть зміст (напр. 'зустріч завтра')" : "Пошук за точним словом..."}
                className={`flex-1 bg-slate-800 text-slate-200 py-2 px-4 rounded-xl border focus:outline-none transition-all placeholder:text-slate-500 shadow-inner ${
                  isSemanticSearch 
                    ? 'border-indigo-500/50 focus:border-indigo-400/80' 
                    : 'border-slate-700 focus:border-blue-500/50'
                }`}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <button 
                onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }}
                className="p-2 text-slate-400 hover:text-white transition-colors text-sm font-medium"
              >
                Закрити
              </button>
            </div>
            
            <div className="flex justify-between items-center pl-10 pr-2">
              <label className="flex items-center gap-2 cursor-pointer group">
                <div className="relative flex items-center">
                  <input 
                    type="checkbox" 
                    className="peer sr-only"
                    checked={isSemanticSearch}
                    onChange={(e) => {
                      setIsSemanticSearch(e.target.checked);
                      if (e.target.checked && !isReady) initModel();
                    }}
                  />
                  <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-500"></div>
                </div>
                <span className={`text-xs font-medium transition-colors ${
                  isSemanticSearch ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300'
                }`}>
                  Семантичний (ШІ)
                </span>
              </label>
              
              <div className="text-[10px] text-slate-400 font-medium">
                {modelLoading && <span className="text-indigo-400 animate-pulse">Завантаження ШІ {progress}%...</span>}
                {isSemanticSearch && !modelLoading && isReady && semanticSearching && <span className="text-indigo-400 animate-pulse">Пошук смислу...</span>}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {!isConnected && (
                <div className="text-xs font-bold text-amber-500 bg-amber-500/10 px-3 py-1 rounded-full animate-pulse mr-2">
                    З'єднання...
                </div>
            )}
            <button 
              onClick={() => setIsSearchOpen(true)}
              className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors"
              title="Пошук у чаті"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </div>
        )}
      </header>
      
      <div 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        onClick={() => {
           if (activeTouchMessageId) setActiveTouchMessageId(null);
        }}
        className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent bg-gradient-to-br from-slate-900 via-slate-900 to-blue-900/10"
      >
        {isSearchOpen && searchQuery.trim() ? (
           <div className="flex flex-col gap-4 py-2">
             {searchResults.length === 0 ? (
                <div className="text-center text-slate-500 mt-10">
                  <svg className="w-12 h-12 mx-auto text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  За вашим запитом нічого не знайдено
                </div>
             ) : (
                searchResults.map((msg, i) => {
                  const currentMsgDate = new Date(msg.created_at || Date.now()).toDateString();
                  const prevMsgDate = i > 0 ? new Date(searchResults[i-1].created_at || Date.now()).toDateString() : null;
                  const showDateSeparator = currentMsgDate !== prevMsgDate;
                  
                  return (
                    <div key={i}>
                      {showDateSeparator && (
                        <div className="flex items-center gap-4 my-6 opacity-30">
                          <div className="h-[1px] flex-1 bg-slate-500"></div>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            {formatDateLabel(msg.created_at || Date.now())}
                          </span>
                          <div className="h-[1px] flex-1 bg-slate-500"></div>
                        </div>
                      )}
                      <div className={`flex items-end gap-2 ${msg.sender_fp === user?.fingerprint ? 'justify-end' : 'justify-start'} opacity-95`}>
                          <div 
                            onClick={() => jumpToMessage(msg.id)}
                            className={`message-bubble cursor-pointer hover:brightness-110 active:scale-[0.98] transition-all max-w-[85%] sm:max-w-[70%] min-w-[70px] p-2.5 px-3.5 rounded-2xl ${
                              msg.sender_fp === user?.fingerprint ? 'bg-blue-600 rounded-tr-sm' : 'bg-slate-800 rounded-tl-sm'
                            } shadow-lg relative shrink-0 overflow-hidden`}
                          >
                              <div className="flex flex-col leading-tight">
                              <p className="text-[15px] whitespace-pre-wrap break-words">
                                {highlightText(msg.content, searchQuery)}
                                <span className={`inline-block translate-y-1 ${msg.is_edited ? 'w-[85px]' : 'w-[40px]'}`}></span>
                              </p>
                              <div className="absolute bottom-1 right-2 flex items-center gap-1 opacity-60">
                                {msg.is_edited && <span className="text-[11px] italic leading-none">змінено</span>}
                                <span className="text-[11px] font-medium tabular-nums leading-none">
                                  {new Date(msg.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                                </span>
                              </div>
                            </div>
                          </div>
                      </div>
                    </div>
                  );
                })
             )}
           </div>
        ) : (
          <>
            {loadingMore && (
               <div className="flex justify-center p-2 mb-2 w-full">
                   <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
               </div>
            )}
            {activeMessages.map((msg, i) => {
              const isMe = msg.sender_fp === user?.fingerprint;
              const currentMsgDate = new Date(msg.created_at || Date.now()).toDateString();
              const prevMsgDate = i > 0 ? new Date(activeMessages[i-1].created_at || Date.now()).toDateString() : null;
              const showDateSeparator = currentMsgDate !== prevMsgDate;

              const nextMsg = activeMessages[i + 1];
              const nextMsgDate = nextMsg ? new Date(nextMsg.created_at || Date.now()).toDateString() : null;
              const isLastInSequence = !nextMsg || nextMsg.sender_fp !== msg.sender_fp || nextMsgDate !== currentMsgDate;
              
              return (
                <div key={i} id={`msg-${msg.id}`}>
                  {showDateSeparator && (
                    <div className="flex items-center gap-4 my-6 opacity-30">
                      <div className="h-[1px] flex-1 bg-slate-500"></div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        {formatDateLabel(msg.created_at || Date.now())}
                      </span>
                      <div className="h-[1px] flex-1 bg-slate-500"></div>
                    </div>
                  )}
                  <div 
                    className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isMe && (
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold overflow-hidden shrink-0 mb-1 z-10 transition-opacity ${
                        isLastInSequence ? 'bg-slate-700 shadow-md opacity-100' : 'opacity-0'
                      }`}>
                        {activeContact.avatar_url ? (
                          <img src={activeContact.avatar_url} alt={activeContact.username} className="w-full h-full object-cover" />
                        ) : (
                          activeContact.username?.[0]?.toUpperCase()
                        )}
                      </div>
                    )}
                    <div 
                      className={`message-bubble max-w-[85%] sm:max-w-[70%] min-w-[70px] p-2.5 px-3.5 rounded-2xl ${
                        isMe ? 'bg-blue-600 rounded-tr-sm' : 'bg-slate-800 rounded-tl-sm'
                      } shadow-lg relative group transition-all min-w-0`}
                      onTouchStart={() => {
                         touchTimerRef.current = setTimeout(() => {
                            setActiveTouchMessageId(msg.id);
                         }, 400); // 400ms long press
                      }}
                      onTouchMove={() => {
                         if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
                      }}
                      onTouchEnd={() => {
                         if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
                      }}
                    >
                        <div className="flex flex-col leading-tight w-full min-w-0">
                        {msg.reply_to_id && (() => {
                          const repliedMsg = activeMessages.find(m => m.id === msg.reply_to_id);
                          return (
                            <div 
                              onClick={() => jumpToMessage(msg.reply_to_id)}
                              className="mb-1.5 pl-2.5 border-l-2 border-white/30 bg-black/10 rounded-r-md py-1 px-2 cursor-pointer hover:bg-black/20 transition-colors opacity-90 overflow-hidden min-w-0 max-w-[250px] sm:max-w-[350px]"
                            >
                              <span className="text-[11px] font-bold text-white/90 block mb-0.5 truncate">
                                {repliedMsg ? (repliedMsg.sender_fp === user?.fingerprint ? 'Ви' : activeContact.username) : 'Видалене повідомлення'}
                              </span>
                              <span className="text-[12px] opacity-80 truncate block leading-tight">
                                {repliedMsg ? repliedMsg.content : 'Повідомлення було видалено'}
                              </span>
                            </div>
                          );
                        })()}
                        <p className="text-[15px] whitespace-pre-wrap break-words">
                          {isSearchOpen && searchQuery.trim() ? highlightText(msg.content, searchQuery) : msg.content}
                          <span className={`inline-block translate-y-1 ${msg.is_edited ? 'w-[85px]' : 'w-[45px]'}`}></span>
                        </p>
                        <div className="absolute bottom-1 right-2 flex items-end gap-1 opacity-60">
                          {msg.is_edited && <span className="text-[11px] italic leading-none">змінено</span>}
                          <span className="text-[11px] font-medium tabular-nums leading-none">
                            {new Date(msg.created_at || Date.now()).toLocaleTimeString([], { 
                              hour: '2-digit', 
                              minute: '2-digit',
                              hour12: false 
                            })}
                          </span>
                          {msg.is_loading && (
                            <span className="w-1 h-1 rounded-full bg-white/50 animate-pulse mb-0.5"></span>
                          )}
                        </div>
                      </div>
                      
                      {!isMe && (
                        <div className={`absolute top-1/2 -translate-y-1/2 -right-10 flex items-center transition-all ${activeTouchMessageId === msg.id ? 'opacity-100 z-10' : 'opacity-0 group-hover:opacity-100'}`}>
                          <button 
                            onClick={() => handleReplyInit(msg)}
                            title="Відповісти"
                            className="p-1.5 bg-slate-800 rounded-full text-slate-400 hover:text-white hover:bg-slate-700 transition-colors shadow-md"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                            </svg>
                          </button>
                        </div>
                      )}

                      {isMe && !msg.is_loading && (
                        <div className={`absolute top-1/2 -translate-y-1/2 -left-24 flex items-center gap-1 transition-all shadow-md ${activeTouchMessageId === msg.id ? 'opacity-100 z-10' : 'opacity-0 group-hover:opacity-100'}`}>
                          <button 
                            onClick={() => handleReplyInit(msg)}
                            title="Відповісти"
                            className="p-1.5 bg-slate-800 rounded-full text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                            </svg>
                          </button>
                          <button 
                            onClick={() => handleEditInit(msg)}
                            title="Редагувати"
                            className="p-1.5 bg-slate-800 rounded-full text-slate-400 hover:text-blue-400 hover:bg-slate-700 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button 
                            onClick={() => setMsgToDelete(msg.id)}
                            title="Видалити"
                            className="p-1.5 bg-slate-800 rounded-full text-slate-400 hover:text-red-500 hover:bg-slate-700 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                    {isMe && (
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold overflow-hidden shrink-0 mb-1 z-0 transition-opacity ${
                        isLastInSequence ? 'bg-blue-700 shadow-md ring-2 ring-blue-800 opacity-100' : 'opacity-0'
                      }`}>
                        {user?.avatar_url ? (
                          <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                        ) : (
                          user?.username?.[0]?.toUpperCase()
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {activeMessages.length === 0 && !loadingMore && (
              <p className="text-slate-500 text-center mt-10">Початок переписки з {activeContact.username}</p>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      <footer className="p-4 bg-slate-900/80 backdrop-blur-md border-t border-slate-800 flex flex-col gap-2 relative">
        {editingMessageId && (
          <div className="flex items-center justify-between text-xs text-blue-400 px-2 animate-in slide-in-from-bottom-2 duration-200">
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              Редагування повідомлення
            </span>
            <button 
              onClick={() => { setEditingMessageId(null); setMessageText(''); }}
              className="text-slate-400 hover:text-slate-200"
            >
              Скасувати
            </button>
          </div>
        )}
        {replyingToMessage && !editingMessageId && (
          <div className="flex items-center justify-between text-xs px-2 animate-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center gap-2 border-l-2 border-blue-500 pl-2">
              <div className="flex flex-col max-w-[200px] sm:max-w-xs">
                <span className="text-blue-400 font-bold">
                  {replyingToMessage.sender_fp === user?.fingerprint ? 'Відповідь собі' : `Відповідь: ${activeContact.username}`}
                </span>
                <span className="text-slate-400 truncate w-full">{replyingToMessage.content}</span>
              </div>
            </div>
            <button 
              onClick={() => setReplyingToMessage(null)}
              className="text-slate-400 hover:text-slate-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <form onSubmit={handleSend} className="flex items-center gap-3 w-full">
          <input
            type="text"
            className="flex-1 bg-slate-800 text-slate-200 py-3 px-4 rounded-xl border border-slate-700 focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-slate-600"
            placeholder="Напишіть повідомлення..."
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
          />
          <button 
            type="submit" 
            disabled={!messageText.trim()}
            className="w-10 h-10 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-full flex items-center justify-center transition-all active:scale-95 shrink-0"
          >
             {editingMessageId ? (
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
               </svg>
             ) : (
               <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                 <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
               </svg>
             )}
          </button>
        </form>
      </footer>

      {showUserInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowUserInfo(false)}>
          <div 
            className="bg-slate-900 border border-slate-700/50 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="relative h-24 bg-gradient-to-r from-blue-600 to-indigo-600">
              <button 
                onClick={() => setShowUserInfo(false)}
                className="absolute top-3 right-3 p-1.5 bg-black/20 hover:bg-black/40 rounded-full text-white/80 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="px-6 pb-6 pt-0 relative flex flex-col items-center">
              <div className="w-24 h-24 rounded-full border-4 border-slate-900 overflow-hidden bg-slate-800 -mt-12 mb-3 shadow-lg relative">
                {activeContact?.avatar_url ? (
                  <img src={activeContact.avatar_url} alt={activeContact.username} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-blue-600 flex items-center justify-center text-white font-bold text-4xl">
                    {activeContact?.username?.[0]?.toUpperCase()}
                  </div>
                )}
                <div className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-slate-900 ${
                  isOnline ? 'bg-green-500' : 'bg-slate-500'
                }`} />
              </div>
              
              <h2 className="text-2xl font-bold text-white mb-1">{activeContact?.username}</h2>
              <p className={`text-sm mb-6 ${isOnline ? 'text-green-500' : 'text-slate-400'}`}>
                {isOnline ? 'Онлайн' : 'Не в мережі'}
              </p>
              
              <div className="w-full space-y-3">
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 hover:border-slate-600/50 transition-colors group">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Fingerprint ID</label>
                    <div className="text-[10px] text-slate-600 italic group-hover:text-blue-400/50 transition-colors">Унікальний ідентифікатор</div>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-950/50 rounded-lg p-2 border border-slate-800/50 group-hover:border-slate-700 transition-colors">
                    <code className="flex-1 text-xs font-mono text-slate-300 break-all line-clamp-2" title={activeContact?.fingerprint}>
                      {activeContact?.fingerprint || 'Невідомо'}
                    </code>
                    <button 
                      onClick={() => {
                        if (activeContact?.fingerprint) {
                          navigator.clipboard.writeText(activeContact.fingerprint);
                        }
                      }}
                      className="p-1.5 text-slate-500 hover:text-white hover:bg-blue-600 rounded-md transition-all active:scale-95 shrink-0"
                      title="Копіювати"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                {activeContact?.about && (
                  <div className="bg-slate-800/50 border border-slate-700/50 p-3 rounded-xl">
                    <p className="text-xs text-slate-400 uppercase tracking-wider mb-1 font-semibold">Про себе</p>
                    <p className="text-sm text-slate-200">
                      {activeContact.about}
                    </p>
                  </div>
                )}
                
                <button 
                    onClick={() => setShowUserInfo(false)}
                    className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl transition-all duration-200 mt-2 border border-slate-700"
                >
                    Закрити
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {msgToDelete !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-800 rounded-2xl p-6 shadow-2xl border border-slate-700 max-w-sm w-full mx-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-white mb-2">Видалити повідомлення?</h3>
            <p className="text-slate-300 mb-6 text-sm">
              Ця дія незворотня. Повідомлення буде назавжди видалено для всіх учасників переписки.
            </p>
            <div className="flex justify-end gap-3 font-medium">
              <button 
                onClick={() => setMsgToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white transition-colors"
              >
                Скасувати
              </button>
              <button 
                onClick={() => {
                  deleteMessage(msgToDelete);
                  setMsgToDelete(null);
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white transition-colors shadow-lg shadow-red-600/20"
              >
                Видалити
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
