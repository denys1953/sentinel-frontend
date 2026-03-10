import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

export default function ProfileModal({ onClose }) {
  const { user, updateUser } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleAvatarClick = () => {
    if (!uploading && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);
    setError('');

    try {
      await api.post('/users/me/avatar', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      await updateUser();
    } catch (err) {
      console.error("Failed to upload avatar:", err);
      setError('Failed to upload avatar. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const copyFingerprint = () => {
    if (user?.fingerprint) {
      navigator.clipboard.writeText(user.fingerprint);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-800 border border-slate-700/50 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors bg-slate-900/50 hover:bg-slate-700 rounded-full p-1 z-10"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="p-6 pt-8">
          <div className="flex flex-col items-center gap-4 mb-6">
            <div className="relative group cursor-pointer" onClick={handleAvatarClick}>
              <div className="w-28 h-28 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-4xl font-bold text-white overflow-hidden ring-4 ring-slate-700/50 shadow-xl relative z-0">
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                ) : (
                  user?.username?.[0]?.toUpperCase()
                )}
              </div>
              
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full backdrop-blur-[2px] z-10">
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handleAvatarChange}
                  disabled={uploading}
                  ref={fileInputRef}
                />
                {uploading ? (
                  <div className="w-8 h-8 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <svg className="w-8 h-8 text-white drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </div>
              
              <div className="absolute bottom-1 right-1 bg-slate-800 rounded-full p-1.5 border border-slate-600 group-hover:opacity-0 transition-opacity z-20 shadow-lg">
                 <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                 </svg>
              </div>
            </div>
            
            <div className="text-center w-full">
              <h3 className="text-xl font-bold text-white tracking-tight">{user?.username}</h3>
              <div className="flex items-center justify-center gap-2 mt-1">
                 <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                 <span className="text-xs text-green-400/80 font-medium">В мережі</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50 hover:border-slate-600/50 transition-colors group">
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Fingerprint ID</label>
                <div className="text-[10px] text-slate-600 italic group-hover:text-blue-400/50 transition-colors">Унікальний ідентифікатор</div>
              </div>
              <div className="flex items-center gap-2 bg-slate-950/50 rounded-lg p-2 border border-slate-800/50 group-hover:border-slate-700 transition-colors">
                <code className="flex-1 text-xs font-mono text-slate-300 break-all line-clamp-2" title={user?.fingerprint}>
                  {user?.fingerprint}
                </code>
                <button 
                  onClick={copyFingerprint}
                  className="p-1.5 text-slate-500 hover:text-white hover:bg-blue-600 rounded-md transition-all active:scale-95 shrink-0"
                  title="Копіювати"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>
            
            {error && (
              <p className="text-red-400 text-xs text-center bg-red-500/10 border border-red-500/20 p-3 rounded-xl animate-in fade-in slide-in-from-top-1">{error}</p>
            )}
            
            <button 
                onClick={onClose}
                className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded-xl transition-all duration-200 mt-2"
            >
                Закрити
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}