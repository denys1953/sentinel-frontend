import { useState, useEffect } from 'react';
import api from '../api/axios';

const globalStatuses = {};
const listeners = new Set();

const notifyListeners = () => {
  const current = { ...globalStatuses };
  listeners.forEach(fn => fn(current));
};

export const useOnlineStatus = (fingerprints, intervalMs = 30000) => {
  const [statuses, setStatuses] = useState(globalStatuses);

  useEffect(() => {
    listeners.add(setStatuses);
    // Trigger initial state sync
    setStatuses({ ...globalStatuses });
    return () => listeners.delete(setStatuses);
  }, []);

  useEffect(() => {
    const targets = Array.isArray(fingerprints) 
      ? fingerprints.filter(Boolean) 
      : (fingerprints ? [fingerprints] : []);
      
    if (targets.length === 0) {
        return;
    }

    const fetchStatuses = async () => {
      try {
        const res = await api.post('/users/statuses', targets);
        let changed = false;
        for (const [fp, status] of Object.entries(res.data)) {
          if (globalStatuses[fp] !== status) {
            globalStatuses[fp] = status;
            changed = true;
          }
        }
        if (changed) {
            notifyListeners();
        }
      } catch (e) {
      }
    };

    fetchStatuses();
    const timer = setInterval(fetchStatuses, intervalMs);

    return () => clearInterval(timer);
  }, [JSON.stringify(fingerprints), intervalMs]); 

  return statuses;
};
