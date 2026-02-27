import Dexie from 'dexie';

export const db = new Dexie('SentinelDB');

db.version(1).stores({
  keys: 'username', 
  messages: '++id, conversation_id, sender_fp, recipient_id, recipient_fp'
});


if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
  navigator.storage.persist();
}
