import { createContext, useState, useContext, useEffect } from 'react';
import api from '../api/axios';
import { isTokenExpired } from '../api/auth';
import { db } from '../services/db';
import { decryptPrivateKeyWithMasterKey, importMasterKey } from '../services/crypto';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [privateKey, setPrivateKey] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const token = sessionStorage.getItem('token');
      const storedUser = sessionStorage.getItem('user');

      if (token && isTokenExpired(token)) {
        logout();
      } else if (token) {
        try {
          const userData = storedUser ? JSON.parse(storedUser) : null;
          if (userData && userData.username) {
            setUser(userData);
            
            const keyRecord = await db.keys.get(userData.username);
            const savedMasterKey = sessionStorage.getItem('master_key');
            if (keyRecord && savedMasterKey) {
              try {
                const masterKey = await importMasterKey(savedMasterKey);
                const privKey = await decryptPrivateKeyWithMasterKey(
                  keyRecord.encPrivateKey, 
                  masterKey
                );
                setPrivateKey(privKey);
              } catch (e) {
                console.warn("Failed to restore private key automatically", e);
                sessionStorage.removeItem('master_key');
              }
            }
          }
          
          const res = await api.get('/users/me');
          setUser(prev => {
            if (prev && prev.id === res.data.id && prev.fingerprint === res.data.fingerprint) {
              return prev;
            }
            return res.data;
          });
          sessionStorage.setItem('user', JSON.stringify(res.data));
        } catch (err) {
          console.error("Auth initialization failed:", err);
          logout();
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (username, password) => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('master_key');
    sessionStorage.removeItem('last_pwd');

    const formData = new URLSearchParams();
    formData.append('username', username.trim());
    formData.append('password', password);

    const response = await api.post('/auth/login', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { access_token, requires_2fa, temp_token, setup_required, qr_code, secret } = response.data;
    
    if (requires_2fa) {
      return { requires_2fa: true, temp_token, setup_required, qr_code, secret };
    }
    
    await _finishLogin(access_token);
    return { success: true };
  };

  const login2fa = async (tempToken, code) => {
    const response = await api.post('/auth/login/2fa', {
      temp_token: tempToken,
      code
    });
    
    const { access_token } = response.data;
    await _finishLogin(access_token);
  };

  const _finishLogin = async (access_token) => {
    sessionStorage.setItem('token', access_token);
    const meRes = await api.get('/users/me');
    sessionStorage.setItem('user', JSON.stringify(meRes.data));
    setUser(meRes.data);
  };

  const updateUser = async () => {
    try {
      const res = await api.get('/users/me');
      setUser(res.data);
      sessionStorage.setItem('user', JSON.stringify(res.data));
    } catch (err) {
      console.error("Failed to update user info:", err);
    }
  };

  const logout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('master_key');
    sessionStorage.removeItem('last_pwd');
    setUser(null);
    setPrivateKey(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, login2fa, logout, privateKey, setPrivateKey, loading, updateUser }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
