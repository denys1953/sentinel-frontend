import { useState, useEffect, useRef } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import EmptyState from './EmptyState';

export default function ChatArea({ activeContact }) {
  const [messageText, setMessageText] = useState('');
  const { messages, sendMessage, fetchMessages, setCurrentChat } = useSocket();
  const { user } = useAuth();
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (activeContact?.conversation_id) {
       fetchMessages(activeContact.conversation_id);
       setCurrentChat(activeContact.conversation_id);
    } else {
       setCurrentChat(null);
    }
  }, [activeContact?.conversation_id]);

  const activeMessages = messages.filter(m => {
    if (activeContact?.conversation_id) {
      return Number(m.conversation_id) === Number(activeContact.conversation_id);
    }
    
    const isFromMe = (m.sender_fp === user?.fingerprint);
    const isFromContact = (m.sender_fp === activeContact?.fingerprint);
    const isToContact = (m.recipient_fp === activeContact?.fingerprint);

    return (isFromMe && isToContact) || isFromContact;
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages]);

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
      <main className="flex-1 flex flex-col bg-slate-900/50 relative">
        <EmptyState />
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col bg-slate-900/50 relative">
      <header className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex items-center justify-between px-6 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">
            {activeContact.username?.[0]?.toUpperCase()}
          </div>
          <span className="font-semibold text-slate-200">{activeContact.username}</span>
        </div>
      </header>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeMessages.map((msg, i) => {
          const isMe = msg.sender_fp === user?.fingerprint;
          const currentMsgDate = new Date(msg.created_at || Date.now()).toDateString();
          const prevMsgDate = i > 0 ? new Date(activeMessages[i-1].created_at || Date.now()).toDateString() : null;
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
              <div 
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] sm:max-w-[60%] min-w-[70px] p-2.5 px-3.5 rounded-2xl ${
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
