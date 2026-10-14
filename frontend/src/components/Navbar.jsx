import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Ghost, Shield, RefreshCw, Server, CheckCircle2, AlertTriangle, X, LogOut, User } from 'lucide-react';
import axios from 'axios';

export const Navbar = ({ onRefresh, refreshing }) => {
  const { user, logout, switchRole } = useAuth();
  const [backendOnline, setBackendOnline] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 4000);
    return () => clearInterval(interval);
  }, []);

  const checkHealth = async () => {
    try {
      const res = await axios.get('/api/health', { timeout: 1500 });
      if (res.data?.status === 'healthy') {
        setBackendOnline(true);
      } else {
        setBackendOnline(false);
      }
    } catch (e) {
      setBackendOnline(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-800 bg-slate-900/95 px-6 backdrop-blur-md">
      {/* Brand & Project Info */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 shadow-lg shadow-sky-500/25 text-white">
          <Ghost className="h-6 w-6 animate-pulse" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight text-white">StockGhost</span>
            <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-sky-400 border border-sky-500/30 uppercase">
              ERP 2.0
            </span>
          </div>
          <p className="text-xs text-slate-400 hidden sm:block">
            Dead Stock & Blocked Capital Detection System
          </p>
        </div>
      </div>

      {/* College / Department Tag */}
      <div className="hidden lg:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-800/90 border border-slate-700 text-xs text-slate-200 shadow-inner">
        <span className="w-2 h-2 rounded-full bg-sky-400"></span>
        <span className="font-medium">Dept of IT • Priyadarshini College of Engineering</span>
      </div>

      {/* Right Controls: Role Switcher, Status & Logout */}
      <div className="flex items-center gap-3">
        {/* Backend Connectivity Status Indicator */}
        <button
          onClick={() => setShowStatusModal(true)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
            backendOnline
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
              : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
          }`}
          title="Click for Connection Details"
        >
          <span className={`w-2 h-2 rounded-full ${backendOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
          <span className="hidden sm:inline">
            {backendOnline ? 'Flask API Online (5050)' : 'Standalone Mode'}
          </span>
        </button>

        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            title="Refresh Live Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-sky-400' : ''}`} />
            <span className="hidden md:inline">Sync</span>
          </button>
        )}

        {/* Immutable Verified Role Badge (No switching without full logout & 2FA) */}
        <div className="flex items-center gap-1.5 bg-slate-800/90 px-3 py-1.5 rounded-lg border border-slate-700">
          <Shield className="w-3.5 h-3.5 text-sky-400" />
          <span className="text-xs font-bold text-sky-400">
            {user?.role || 'Admin'}
          </span>
          <span className="text-[10px] text-emerald-400 font-mono font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
            2FA
          </span>
        </div>

        {/* User Pill & Sign Out Button */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
          <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white text-xs font-bold ring-2 ring-slate-700">
            {user?.username ? user.username.substring(0, 2).toUpperCase() : 'SG'}
          </div>
          <div className="hidden xl:block text-left text-xs">
            <p className="font-semibold text-white leading-none">{user?.username || 'User'}</p>
            <p className="text-[10px] text-slate-400 leading-none mt-1">{user?.role || 'Guest'}</p>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition border border-transparent hover:border-slate-700"
            title="Log out and return to Login page"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden sm:inline text-rose-400 font-semibold">Logout</span>
          </button>
        </div>
      </div>

      {/* Backend Status Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Server className="w-5 h-5 text-sky-400" />
                <h3 className="text-base font-bold text-white">System Architecture & Connection Status</h3>
              </div>
              <button onClick={() => setShowStatusModal(false)} className="rounded-lg p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs leading-relaxed text-slate-300">
              <div className={`p-3 rounded-xl border flex items-start gap-3 ${
                backendOnline 
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' 
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
              }`}>
                {backendOnline ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400 mt-0.5" />
                    <div>
                      <p className="font-bold text-white">Flask REST API is Connected (Port 5050)</p>
                      <p className="text-[11px] mt-0.5">Database queries, simulation calculations, and transactions are synchronized live with SQLite/MySQL.</p>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-400 mt-0.5" />
                    <div>
                      <p className="font-bold text-white">Running in Standalone Fallback Mode</p>
                      <p className="text-[11px] mt-0.5">
                        The Flask server is not currently reachable at <code>http://127.0.0.1:5050</code>. 
                        StockGhost has automatically enabled its client-side engine with full sample data (Gaming Keyboard, DSRS calculator, Simulator, and AI Chatbot) so you can test all features without interruption.
                      </p>
                    </div>
                  </>
                )}
              </div>

              {!backendOnline && (
                <div className="space-y-2 pt-2">
                  <p className="font-semibold text-white">To launch the live Python Flask backend on port 5050:</p>
                  <div className="rounded-lg bg-slate-950 p-3 font-mono text-[11px] text-sky-400 border border-slate-800">
                    cd C:\Users\lucky\.gemini\antigravity\scratch\stockghost\backend<br />
                    pip install -r requirements.txt<br />
                    python app.py
                  </div>
                  <p className="text-[11px] text-slate-400">Or simply double-click <strong><code>run_backend.bat</code></strong> or <strong><code>start_all.bat</code></strong>.</p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowStatusModal(false)}
                className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
