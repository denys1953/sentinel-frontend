import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { decryptPrivateKeyWithMasterKey, deriveMasterKey, exportMasterKey } from '../services/crypto';
import { db } from '../services/db';
import api from '../api/axios';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [code2fa, setCode2fa] = useState('');
  const { login, login2fa, setPrivateKey } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isExpired = searchParams.get('expired') || searchParams.get('message') === 'session_expired';

  const finishKeySetup = async () => {
      const res = await api.get('/users/me'); 
      const { enc_private_key, salt } = res.data;

      const masterKey = await deriveMasterKey(password, salt);
      const privKey = await decryptPrivateKeyWithMasterKey(enc_private_key, masterKey);
      setPrivateKey(privKey);
      
      const exportedMasterKey = await exportMasterKey(masterKey);
      sessionStorage.setItem('master_key', exportedMasterKey);

      await db.keys.put({ username, encPrivateKey: enc_private_key, salt });

      navigate('/chat');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const result = await login(username, password);
      
      if (result && result.requires_2fa) {
          setRequires2FA(true);
          setTempToken(result.temp_token);
          if (result.setup_required) {
              setSetupRequired(true);
              setQrCode(result.qr_code);
              setSecret(result.secret);
          }
          return;
      }
      
      await finishKeySetup();
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

  const handle2FASubmit = async (e) => {
      e.preventDefault();
      setError('');
      try {
          await login2fa(tempToken, code2fa);
          await finishKeySetup();
      } catch (err) {
          setError(err.response?.data?.detail || "Невірний код 2FA");
      }
  };

  if (requires2FA) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 font-sans p-4">
          <form onSubmit={handle2FASubmit} className="bg-slate-800 p-8 rounded-xl shadow-lg w-full max-w-md border border-slate-700">
            <h2 className="text-3xl font-bold text-white mb-6 text-center text-blue-400">Двофакторна автентифікація</h2>
            
            {setupRequired ? (
              <div className="flex flex-col items-center mb-6">
                <div className="bg-blue-500/10 border border-blue-500/30 text-blue-400 p-3 rounded-lg text-sm text-center mb-4">
                  Для вашої безпеки, використання 2FA є обов'язковим. Відскануйте QR-код нижче у своєму додатку Authenticator (напр. Google Authenticator).
                </div>
                <div className="bg-white p-2 rounded-xl mb-4">
                  <img src={qrCode} alt="2FA QR Code" className="w-40 h-40" />
                </div>
                <code className="text-xs text-slate-400 bg-slate-900 p-2 rounded break-all text-center max-w-full mb-2">
                  {secret}
                </code>
                <p className="text-slate-400 text-center text-sm">Введіть 6-значний код для підтвердження</p>
              </div>
            ) : (
              <p className="text-slate-400 text-center mb-8">Введіть 6-значний код з вашого додатку Authenticator</p>
            )}
            
            {error && <div className="bg-red-500/10 border border-red-500 text-red-500 p-3 rounded mb-4 text-sm font-medium">{error}</div>}

            <div className="mb-6">
              <input
                type="text"
                maxLength="6"
                placeholder="000000"
                className="w-full p-3 rounded bg-slate-700 text-white border border-slate-600 focus:border-blue-500 outline-none transition text-center tracking-widest text-2xl"
                value={code2fa}
                onChange={(e) => setCode2fa(e.target.value.replace(/\D/g, ''))}
                required
              />
            </div>

            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold p-3 rounded-lg transition active:scale-95 shadow-lg">
              {setupRequired ? 'Підтвердити та увійти' : 'Перевірити'}
            </button>
            <button type="button" onClick={() => { setRequires2FA(false); setSetupRequired(false); }} className="w-full mt-4 bg-transparent text-slate-400 hover:text-white p-2 text-sm">
              Повернутись
            </button>
          </form>
        </div>
      );
  }

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
