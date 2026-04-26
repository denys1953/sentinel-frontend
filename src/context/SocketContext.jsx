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
  const [isConnected, setIsConnected] = useState(false);
  const [currentChatId, setCurrentChatId] = useState(null);
  const currentChatIdRef = useRef(null);
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const connect = useCallback(() => {
    if (!user || !privateKey) return;
    if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const token = sessionStorage.getItem('token');
    const fingerprint = user.fingerprint;
    const wsBase = import.meta.env.VITE_WS_URL;
    const wsUrl = `${wsBase}/ws/${fingerprint}?token=${token}`;
    
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      if (currentChatIdRef.current) {
        ws.send(JSON.stringify({
          type: "enter_chat",
          conversation_id: currentChatIdRef.current,
          recipient_fp: user?.fingerprint
        }));
      }
    };
    
    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'error') {
          console.error("WebSocket error message:", data.detail);
          return;
        }

        if (data.type === 'delete_message') {
          await db.messages.delete(data.message_id);
          setMessages(prev => prev.filter(m => m.id !== data.message_id));
          if (typeof window !== 'undefined' && window.__triggerSidebarUpdate) {
            window.__triggerSidebarUpdate();
          }
          return;
        }

        if (data.type === 'edit_message' && data.message) {
          try {
            const m = data.message;
            const isMe = m.sender_id === user.id || m.sender_fp === user.fingerprint;
            const targetContent = isMe ? m.content_self : m.content_encoded;
            
            let content = "[Помилка дешифрування]";
            let error = false;
            
            if (privateKey) {
              try {
                content = await decryptWithPrivateKey(targetContent, privateKey);
              } catch (err) {
                console.error("Decryption failed for edit", err);
                error = true;
              }
            } else {
              error = true;
            }

            const updatedMsg = {
              id: m.id,
              conversation_id: m.conversation_id,
              sender_fp: m.sender_fp || (isMe ? user.fingerprint : null),
              content,
              error,
              created_at: m.created_at,
              updated_at: m.updated_at,
              is_edited: m.is_edited
            };

            await db.messages.put(updatedMsg);

            setMessages(prev => prev.map(msg => msg.id === m.id ? { ...msg, ...updatedMsg } : msg));
            
            if (typeof window !== 'undefined' && window.__triggerSidebarUpdate) {
              window.__triggerSidebarUpdate();
            }
          } catch (err) {
            console.error("Edit message processing error", err);
          }
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
              created_at: data.timestamp || data.created_at || new Date().toISOString(),
              reply_to_id: data.reply_to_id || null
            };

            await db.messages.put(incomingMsg);

            if (typeof window !== 'undefined' && window.__triggerSidebarUpdate) {
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


    ws.onclose = (event) => {
      if (socketRef.current === ws || socketRef.current === null) {
        setIsConnected(false);
        
        if (socketRef.current === ws) {
          socketRef.current = null;
        }

        if (user && privateKey && event.code !== 1000 && event.code !== 1001) {
          if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 3000);
        }
      }
    };
  }, [user, privateKey, decryptWithPrivateKey]);

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
    if (user && privateKey) {
      const timer = setTimeout(() => {
        connect();
      }, 50);
      return () => clearTimeout(timer);
    } else {
      if (socketRef.current) {
        socketRef.current.close(1000, "User logged out");
        socketRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.close(1000, "Component unmounting");
        socketRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [connect, user, privateKey]);

  const sendMessage = async (text, activeContact, replyToId = null) => {
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
        content_self,
        reply_to_id: replyToId
      };

      socketRef.current.send(JSON.stringify(payload));

      if (typeof window !== 'undefined' && window.__triggerSidebarUpdate) {
        window.__triggerSidebarUpdate();
      }

      const optimisticMsg = {
        id: Date.now(), 
        conversation_id: activeContact.conversation_id || null,
        recipient_id: activeContact.conversation_id ? null : activeContact.id,
        recipient_fp: activeContact.fingerprint || null,
        sender_fp: user.fingerprint,
        content: text, 
        created_at: new Date().toISOString(),
        reply_to_id: replyToId,
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

  const fetchMessages = useCallback(async (conversationId, offset = 0) => {
    if (!conversationId || !privateKey || !user) return 0;
    try {
      const allLocalMsgs = await db.messages
        .where('conversation_id')
        .equals(Number(conversationId))
        .toArray();
      
      const sortedLocal = allLocalMsgs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const localPage = sortedLocal.slice(offset, offset + 50);

      let decodedHistory = [];
      try {
        const response = await api.get(`/conversations/${conversationId}`, {
          params: { limit: 50, offset }
        });
        const history = response.data;

        decodedHistory = await Promise.all(history.map(async (m) => {
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
            updated_at: m.updated_at,
            is_edited: m.is_edited,
            recipient_id: m.recipient_id,
            sender_id: m.sender_id,
            reply_to_id: m.reply_to_id || null
          };

          const existing = await db.messages.get(m.id);
          if (!existing) {
            await db.messages.put(msg);
          }
          return msg;
        }));
      } catch (apiErr) {
        console.warn("Could not fetch from API, using local only", apiErr);
      }

      setMessages(prev => {
        const messagesFromOtherChats = prev.filter(m => Number(m.conversation_id) !== Number(conversationId));
        
        const messagesForThisChat = offset === 0 ? [] : prev.filter(m => Number(m.conversation_id) === Number(conversationId));

        const loadingMessages = prev.filter(m => m.is_loading && Number(m.conversation_id) === Number(conversationId));

        const combinedPool = [...messagesForThisChat, ...localPage, ...decodedHistory];

        const uniqueMessagesMap = new Map();
        combinedPool.forEach(m => uniqueMessagesMap.set(m.id, m));

        loadingMessages.forEach(m => uniqueMessagesMap.set(m.id, m));

        const uniqueMessages = Array.from(uniqueMessagesMap.values());
        
        uniqueMessages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        return [...messagesFromOtherChats, ...uniqueMessages];
      });
      
      return Math.max(localPage.length, decodedHistory.length);
    } catch (err) {
      console.error("Failed to fetch messages history", err);
      return 0;
    }
  }, [user, privateKey]);

  const deleteMessageLocal = async (messageId) => {
    try {
      await api.delete(`/conversations/messages/${messageId}`);
      await db.messages.delete(messageId);
      setMessages(prev => prev.filter(m => m.id !== messageId));
      if (typeof window !== 'undefined' && window.__triggerSidebarUpdate) {
        window.__triggerSidebarUpdate();
      }
    } catch (err) {
      console.error("Failed to delete message", err);
      // optionally show notification to user
    }
  };

  const editMessageLocal = async (messageId, newText, activeContact) => {
    try {
      const { content_encoded, content_self } = await prepareE2EEPayload(
        newText,
        activeContact.public_key,
        user.public_key
      );

      await api.patch(`/conversations/messages/${messageId}`, {
        content_encoded,
        content_self
      });
      // The websocket edit_message event will handle updating the state and db
    } catch (err) {
      console.error("Failed to edit message", err);
    }
  };

  return (
    <SocketContext.Provider value={{ isConnected, messages, sendMessage, addLocalMessage, fetchMessages, setCurrentChat, deleteMessage: deleteMessageLocal, editMessage: editMessageLocal }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);

