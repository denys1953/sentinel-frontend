import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { decryptPrivateKey } from '../services/crypto';
import { db } from '../services/db';
import api from '../api/axios';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, setPrivateKey } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isExpired = searchParams.get('expired') || searchParams.get('message') === 'session_expired';

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await login(username, password);
      
      const res = await api.get('/users/me'); 
      const { enc_private_key, salt } = res.data;

      const privKey = await decryptPrivateKey(enc_private_key, password, salt);
      setPrivateKey(privKey);
      
      localStorage.setItem('last_pwd', password); 
      await db.keys.put({ username, encPrivateKey: enc_private_key, salt });

      navigate('/chat');
    } catch (err) {
      console.error("Login Error:", err);
      
      if (err.response?.status === 401) {
        setError("Невірне ім'я користувача або пароль. Переконайтеся, що ви зареєстровані.");
        return;
      }

      const detail = err.response?.data?.detail;
      let errorMessage = "Помилка входу: перевірте логін та пароль";
      
      if (typeof detail === 'string') {
        errorMessage = detail;
      } else if (Array.isArray(detail)) {
        errorMessage = detail.map(d => d.msg).join(", ");
      } else if (detail && typeof detail === 'object') {
        errorMessage = detail.msg || JSON.stringify(detail);
      }

      setError(errorMessage);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 font-sans">
      <form onSubmit={handleLogin} className="bg-slate-800 p-8 rounded-xl shadow-lg w-full max-w-md border border-slate-700">
        <h2 className="text-3xl font-bold text-white mb-6 text-center text-blue-400">Sentinel App</h2>
        <p className="text-slate-400 text-center mb-8 italic">Secure messaging for everyone</p>
        
        {isExpired && (
          <div className="bg-yellow-500/10 border border-yellow-500 text-yellow-500 p-3 rounded mb-4 text-sm font-medium">
            Ваша сесія завершилася. Будь ласка, увійдіть знову.
          </div>
        )}

        {error && <div className="bg-red-500/10 border border-red-500 text-red-500 p-3 rounded mb-4 text-sm font-medium">{error}</div>}

        <div className="mb-4">
          <label className="block text-slate-400 text-sm font-medium mb-1">Username</label>
          <input
            type="text"
            className="w-full p-3 rounded bg-slate-700 text-white border border-slate-600 focus:border-blue-500 outline-none transition"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        
        <div className="mb-6">
          <label className="block text-slate-400 text-sm font-medium mb-1">Password</label>
          <input
            type="password"
            className="w-full p-3 rounded bg-slate-700 text-white border border-slate-600 focus:border-blue-500 outline-none transition"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold p-3 rounded-lg transition active:scale-95 shadow-lg">
          Увійти
        </button>

        <p className="mt-6 text-center text-slate-400 text-sm">
          Немає акаунту? <Link to="/register" className="text-blue-500 hover:underline">Зареєструватися</Link>
        </p>
      </form>
    </div>
  );
}
