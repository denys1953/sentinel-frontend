import { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import EmptyState from './EmptyState';

export default function ChatArea({ activeContact, onBack }) {
  const [messageText, setMessageText] = useState('');
  const { messages, sendMessage, fetchMessages, setCurrentChat, isConnected } = useSocket();
  const { user } = useAuth();
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const lastMessageIdRef = useRef(null);
  const prevScrollHeightRef = useRef(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  
  const onlineStatuses = useOnlineStatus(activeContact?.fingerprint, 30000);
  const isOnline = activeContact ? !!onlineStatuses[activeContact.fingerprint] : false;

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

  const handleScroll = async (e) => {
    const { scrollTop, scrollHeight } = e.currentTarget;
    
    if (scrollTop === 0 && !loadingMore && hasMore && activeContact?.conversation_id) {
        setLoadingMore(true);
        prevScrollHeightRef.current = scrollHeight; // Capture height before fetch
        
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
      sendMessage(messageText.trim(), activeContact);
      setMessageText('');
    }
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
      {/* Header with User Info */}
      <header className="h-16 px-4 md:px-6 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-3 md:gap-4">
          {/* Back button for mobile */}
          {onBack && (
            <button 
              onClick={onBack}
              className="md:hidden p-2 -ml-2 text-slate-400 hover:text-white"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center text-sm font-bold shadow-lg overflow-hidden shrink-0">
              {activeContact.avatar_url ? (
                <img src={activeContact.avatar_url} alt={activeContact.username} className="w-full h-full object-cover" />
              ) : (
                activeContact.username?.[0]?.toUpperCase()
              )}
            </div>
            {isOnline && (
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-slate-900 rounded-full animate-pulse shadow-green-500/20 shadow-lg"></div>
            )}
          </div>
          
          <div className="flex flex-col justify-center">
            <span className="font-semibold text-white tracking-wide">{activeContact.username}</span>
            {isOnline ? (
              <span className="text-xs text-green-400 font-medium">Онлайн</span>
            ) : (
             <span className="text-xs text-slate-500">Офлайн</span>
            )}
          </div>
        </div>

        {!isConnected && (
            <div className="text-xs font-bold text-amber-500 bg-amber-500/10 px-3 py-1 rounded-full animate-pulse">
                З'єднання...
            </div>
        )}
      </header>
      
      <div 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent bg-gradient-to-br from-slate-900 via-slate-900 to-blue-900/10"
      >
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
              <div 
                className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                {!isMe && (
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold overflow-hidden shrink-0 mb-1 z-0 transition-opacity ${
                    isLastInSequence ? 'bg-slate-700 shadow-md opacity-100' : 'opacity-0'
                  }`}>
                    {activeContact.avatar_url ? (
                      <img src={activeContact.avatar_url} alt={activeContact.username} className="w-full h-full object-cover" />
                    ) : (
                      activeContact.username?.[0]?.toUpperCase()
                    )}
                  </div>
                )}
                <div className={`max-w-[85%] sm:max-w-[70%] min-w-[70px] p-2.5 px-3.5 rounded-2xl ${
                  isMe ? 'bg-blue-600 rounded-tr-sm' : 'bg-slate-800 rounded-tl-sm'
                } shadow-lg relative group`}>
                  <div className="flex flex-col leading-tight">
                    <p className="text-[15px] whitespace-pre-wrap break-words pr-8">
                      {msg.content}
                    </p>
                    <div className="absolute bottom-1 right-2 flex items-center gap-1.5 opacity-60">
                      <span className="text-[9px] font-medium tabular-nums">
                        {new Date(msg.created_at || Date.now()).toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit',
                          hour12: false 
                        })}
                      </span>
                      {msg.is_loading && (
                        <span className="w-1 h-1 rounded-full bg-white/50 animate-pulse"></span>
                      )}
                    </div>
                  </div>
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
        {activeMessages.length === 0 && (
          <p className="text-slate-500 text-center mt-10">Початок переписки з {activeContact.username}</p>
        )}
        <div ref={messagesEndRef} />
      </div>

      <footer className="p-4 bg-slate-900/80 backdrop-blur-md border-t border-slate-800">
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
             <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
              </svg>
          </button>
        </form>
      </footer>
    </main>
  );
}
