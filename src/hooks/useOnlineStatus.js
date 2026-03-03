import { useState, useEffect } from 'react';
import api from '../api/axios';


export const useOnlineStatus = (fingerprints, intervalMs = 30000) => {
  const [statuses, setStatuses] = useState({});

  useEffect(() => {
    const targets = Array.isArray(fingerprints) 
      ? fingerprints.filter(Boolean) 
      : (fingerprints ? [fingerprints] : []);
      
    if (targets.length === 0) {
        setStatuses({});
        return;
    }

    const fetchStatuses = async () => {
      try {
        const res = await api.post('/users/statuses', targets);
        setStatuses(prev => {
           return { ...prev, ...res.data };
        });
      } catch (e) {
      }
    };

    fetchStatuses();
    const timer = setInterval(fetchStatuses, intervalMs);

    return () => clearInterval(timer);
  }, [JSON.stringify(fingerprints), intervalMs]); 

  return statuses;
};
