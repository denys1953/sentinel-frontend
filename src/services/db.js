import Dexie from 'dexie';

export const db = new Dexie('SentinelDB');
db.version(1).stores({
  keys: 'username', 
  messages: '++id, chatId'
});