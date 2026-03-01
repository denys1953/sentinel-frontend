import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { encryptForRecipient, decryptWithPrivateKey, prepareE2EEPayload } from '../services/crypto';
import { db } from '../services/db';
import api from '../api/axios';
import { showNotification } from '../services/notification.service';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const { user, privateKey } = useAuth();
  const [messages, setMessages] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const currentChatIdRef = useRef(null);
  const socketRef = useRef(null);

  const setCurrentChat = (conversationId) => {
    setCurrentChatId(conversationId);
    currentChatIdRef.current = conversationId ? Number(conversationId) : null;
    
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: "enter_chat",
        conversation_id: conversationId,
        recipient_fp: user?.fingerprint
      }));
    }
  };

  useEffect(() => {
    if (!user || !privateKey) {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      return;
    }

    const token = localStorage.getItem('token');
    const fingerprint = user.fingerprint;
    const wsBase = import.meta.env.VITE_WS_URL;
    const wsUrl = `${wsBase}/ws/${fingerprint}?token=${token}`;
    
    let isShuttingDown = false;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      if (isShuttingDown) {
        ws.close(1000, "Cleanup during connection process");
        return;
      }
    };
    
    ws.onmessage = async (event) => {
      if (isShuttingDown) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'error') {
          console.error("WebSocket error message:", data.detail);
          return;
        }

        if ((data.type === 'chat_message' || data.type === 'new_message') && data.content) {
          try {
            let content = "[Повідомлення зашифроване]";
            let error = false;

            if (privateKey) {
              try {
                content = await decryptWithPrivateKey(data.content, privateKey);
              } catch (err) {
                console.error("Decryption failed", err);
                error = true;
              }
            } else {
              error = true;
            }
            
            const incomingMsg = {
              id: data.id,
              conversation_id: data.conversation_id,
              sender_fp: data.sender_fp || data.sender,
              content,
              error,
              created_at: data.timestamp || data.created_at || new Date().toISOString()
            };

            await db.messages.put(incomingMsg);

            if (window.__triggerSidebarUpdate) {
              window.__triggerSidebarUpdate();
            }

            setMessages(prev => {
               if (prev.some(m => m.id === incomingMsg.id)) return prev;
               
               if (incomingMsg.sender_fp === user.fingerprint) {
                 const optIdx = prev.findIndex(m => 
                   m.is_loading && 
                   m.content === incomingMsg.content &&
                   (!m.conversation_id || Number(m.conversation_id) === Number(incomingMsg.conversation_id))
                 );
                 if (optIdx !== -1) {
                   const updated = [...prev];
                   updated[optIdx] = incomingMsg;
                   return updated;
                 }
               }

               return [...prev, incomingMsg];
            });

            const isCurrentChat = currentChatIdRef.current && Number(incomingMsg.conversation_id) === Number(currentChatIdRef.current);
            if (!error && incomingMsg.sender_fp !== user.fingerprint && !isCurrentChat) {
              showNotification(
                "Нове повідомлення",
                content,
                incomingMsg.sender_fp
              );
            }
          } catch (err) {
            console.error("WebSocket data transformation error:", err);
          }
        }
      } catch (err) {
        console.error("💭 WebSocket message processing error:", err);
      }
    };

    ws.onerror = (error) => {
      if (!isShuttingDown) {
        console.error("🚫 WebSocket ERROR:", error);
      }
    };

    ws.onclose = (event) => {
      if (isShuttingDown) {
      } else {
        console.warn("🔌 WebSocket disconnected!", {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean
        });
        
        if (socketRef.current === ws) {
          socketRef.current = null;
        }
      }
    };

    return () => {
      isShuttingDown = true;
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, "Component unmounting or dependency changed");
      }
    };
  }, [user?.fingerprint, privateKey]);

  const sendMessage = async (text, activeContact) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      console.error("Socket is not open! Current state:", socketRef.current?.readyState);
      return;
    }

    try {
      const { content_encoded, content_self } = await prepareE2EEPayload(
        text,
        activeContact.public_key,
        user.public_key
      );

      const payload = {
        conversation_id: activeContact.conversation_id || null, 
        recipient_id: activeContact.conversation_id ? null : activeContact.id, 
        content_encoded,
        content_self
      };

      socketRef.current.send(JSON.stringify(payload));

      const optimisticMsg = {
        id: Date.now(), 
        conversation_id: activeContact.conversation_id || null,
        recipient_id: activeContact.conversation_id ? null : activeContact.id,
        recipient_fp: activeContact.fingerprint || null,
        sender_fp: user.fingerprint,
        content: text, 
        created_at: new Date().toISOString(),
        is_loading: true
      };

      setMessages(prev => [...prev, optimisticMsg]);
    } catch (err) {
      console.error("Encryption/Sending failed", err);
    }
  };

  const addLocalMessage = (msg) => {
    setMessages(prev => [...prev, { ...msg, created_at: msg.created_at || new Date().toISOString() }]);
  };

  const fetchMessages = useCallback(async (conversationId) => {
    if (!conversationId || !privateKey || !user) return;
    try {
      const localMsgs = await db.messages
        .where('conversation_id')
        .equals(Number(conversationId))
        .toArray();
      
      if (localMsgs.length > 0) {
        setMessages(prev => {
          const filteredPrev = prev.filter(m => 
            !(m.is_loading && Number(m.conversation_id) === Number(conversationId))
          );
          
          const existingIds = new Set(filteredPrev.map(m => m.id));
          const sorted = [...filteredPrev, ...localMsgs.filter(m => !existingIds.has(m.id))]
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
          return sorted;
        });
      }

      const response = await api.get(`/conversations/${conversationId}`);
      const history = response.data;

      const decodedHistory = await Promise.all(history.map(async (m) => {
        const isMe = m.sender_id === user.id;
        const targetContent = isMe ? m.content_self : m.content_encoded;
        
        let content = "[Помилка дешифрування]";
        try {
          content = await decryptWithPrivateKey(targetContent, privateKey);
        } catch (err) {
          console.error("History decryption failed", err);
        }

        const msg = {
          id: m.id,
          conversation_id: m.conversation_id,
          sender_fp: m.sender_fp || (isMe ? user.fingerprint : null),
          content,
          created_at: m.created_at,
          recipient_id: m.recipient_id,
          sender_id: m.sender_id
        };

        await db.messages.put(msg);
        return msg;
      }));

      setMessages(prev => {
        const filteredPrev = prev.filter(m => 
          !(m.is_loading && Number(m.conversation_id) === Number(conversationId))
        );
        const existingIds = new Set(filteredPrev.map(m => m.id));
        const newMsgs = decodedHistory.filter(m => !existingIds.has(m.id));
        return [...filteredPrev, ...newMsgs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      });
    } catch (err) {
      console.error("Failed to fetch messages history", err);
    }
  }, [user, privateKey]);

  return (
    <SocketContext.Provider value={{ messages, sendMessage, addLocalMessage, fetchMessages, setCurrentChat }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);

