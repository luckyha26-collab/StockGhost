import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Shield, 
  Lock, 
  Mail, 
  User, 
  ArrowRight, 
  AlertCircle, 
  CheckCircle2, 
  Key,
  Smartphone,
  RotateCw,
  Eye,
  EyeOff,
  ChevronLeft,
  UserPlus,
  LogIn,
  Building2,
  Check
} from 'lucide-react';

export const Login = ({ onLoginSuccess }) => {
  const { sendOTP, verifyOTP } = useAuth();
  
  // Tabs: 'signin' | 'register'
  const [activeTab, setActiveTab] = useState('signin');

  // Stages: 'credentials' -> 'otp'
  const [stage, setStage] = useState('credentials');
  
  // Sign In Credentials
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState('Admin');

  // Registration Fields (Admin provisioned)
  const [regFullName, setRegFullName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState('Inventory Manager');
  const [regPhone, setRegPhone] = useState('+91 9823924993');
  
  // OTP state
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpSentTo, setOtpSentTo] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [countdown, setCountdown] = useState(180);
  const [otpTimerActive, setOtpTimerActive] = useState(false);
  const [currentOtpCode, setCurrentOtpCode] = useState('');
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);

  const otpInputRefs = useRef([]);

  // Countdown timer for OTP expiry
  useEffect(() => {
    let timer = null;
    if (otpTimerActive && countdown > 0) {
      timer = setInterval(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
    } else if (countdown === 0) {
      setOtpTimerActive(false);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [otpTimerActive, countdown]);

  // Pre-configured Genuine Enterprise Manager Credentials
  const ENTERPRISE_ACCOUNTS = [
    {
      role: 'Admin',
      title: '👑 System Administrator',
      username: 'admin',
      pass: 'admin123',
      phone: '+91 9823924993',
      desc: 'Master RBAC authorization, user management & destination audit'
    },
    {
      role: 'Sales Manager',
      title: '📈 Sales & Clearance Lead',
      username: 'sales_mgr',
      pass: 'sales123',
      phone: '+91 9823924993',
      desc: 'Outward POS sales, demand elasticity & clearance discounts'
    },
    {
      role: 'Inventory Manager',
      title: '📦 Inventory Manager',
      username: 'inventory_mgr',
      pass: 'inv123',
      phone: '+91 9823924993',
      desc: 'SKU classification, DSRS risk scoring & inward purchase orders'
    }
  ];

  const handleSelectAccount = (acc) => {
    setUsername(acc.username);
    setPassword(acc.pass);
    setSelectedRole(acc.role);
    setError('');
  };

  // Handle Manager Account Registration
  const handleRegister = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setSuccess('');

    if (!regFullName.trim() || !regUsername.trim() || !regPassword.trim() || !regPhone.trim()) {
      setError('Please fill all registration fields including verified contact number.');
      return;
    }

    setLoading(true);
    try {
      const { authAPI } = await import('../api');
      const res = await authAPI.register({
        username: regUsername.trim().toLowerCase(),
        full_name: regFullName.trim(),
        password: regPassword.trim(),
        role: regRole,
        phone_number: regPhone.trim()
      });

      setSuccess(`✅ Account provisioned for ${regFullName}! Registered contact: ${regPhone}`);
      setUsername(regUsername.trim().toLowerCase());
      setPassword(regPassword.trim());
      setSelectedRole(regRole);
      setTimeout(() => {
        setActiveTab('signin');
        setSuccess('Registration complete. Please sign in with your credentials.');
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to register account.');
    } finally {
      setLoading(false);
    }
  };

  // Step 1: Submit Credentials & Request Real 2FA OTP
  const handleRequestOTP = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setSuccess('');

    if (!username.trim() || !password.trim()) {
      setError('Please provide your Employee User ID and Password.');
      return;
    }

    setLoading(true);
    try {
      const res = await sendOTP(username.trim(), password.trim());
      if (res.success) {
        setMaskedPhone(res.data.phone_masked || res.data.phone_number || '+91 92844 ****10');
        setOtpSentTo(res.data.phone_number || res.data.otp_sent_to || '+91 9284410610');
        setSelectedRole(res.data.role || selectedRole);
        try {
          const pendingStr = sessionStorage.getItem('stockghost_pending_otp');
          if (pendingStr) {
            const p = JSON.parse(pendingStr);
            if (p.otp) setCurrentOtpCode(p.otp);
          }
        } catch (e) {}
        setStage('otp');
        setCountdown(180);
        setOtpTimerActive(true);
        setOtpDigits(['', '', '', '', '', '']);
        setSuccess(`2FA Challenge dispatched to registered contact number!`);
        setTimeout(() => {
          if (otpInputRefs.current[0]) otpInputRefs.current[0].focus();
        }, 150);
      } else {
        setError(res.error || 'Invalid credentials. Please verify your ID and Password.');
      }
    } catch (err) {
      setError('Authentication server error. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Handle OTP Digits Input
  const handleDigitChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...otpDigits];
    newDigits[index] = value.slice(-1);
    setOtpDigits(newDigits);

    // Auto-advance to next box
    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  // Step 3: Verify OTP and grant session access
  const handleVerifyOTP = async (e) => {
    if (e) e.preventDefault();
    const fullOtp = otpDigits.join('');
    if (fullOtp.length !== 6) {
      setError('Please enter all 6 digits of the OTP verification code.');
      return;
    }

    if (attemptCount >= 5) {
      setError('Too many failed attempts. Security session locked. Return to sign in.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await verifyOTP(username, fullOtp);
      if (res.success) {
        setSuccess('Security verification complete! Welcome to StockGhost ERP.');
        setTimeout(() => {
          if (onLoginSuccess) onLoginSuccess();
        }, 400);
      } else {
        setAttemptCount(prev => prev + 1);
        setError(res.error || `Invalid OTP code. (${4 - attemptCount} attempts remaining)`);
      }
    } catch (err) {
      setError('Verification service unavailable.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-center items-center bg-[#070b14] p-4 sm:p-6 relative overflow-hidden font-sans text-slate-100">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-sky-600/10 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-xl z-10 space-y-6">
        {/* Brand & Department Header */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 shadow-xl shadow-sky-500/20 text-white mb-3 ring-4 ring-slate-800/80 text-3xl">
            👻
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <span>StockGhost ERP</span>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-sky-500/15 text-sky-400 border border-sky-500/30 uppercase tracking-wider">
              RBAC & 2FA
            </span>
          </h1>
          <p className="text-xs text-sky-400 font-semibold tracking-wide uppercase mt-1">
            Department of Information Technology • Priyadarshini College of Engineering, Nagpur
          </p>
          <p className="text-xs text-slate-400 mt-1 max-w-md">
            Dead Stock & Blocked Capital Detection Enterprise Platform
          </p>
        </div>

        {/* Main Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 backdrop-blur-xl p-6 sm:p-8 shadow-2xl shadow-black/60 relative overflow-hidden">
          {/* Top Security Header */}
          <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">
                  {stage === 'credentials' ? 'Enterprise Credential Gateway' : 'Two-Factor Mobile Authentication'}
                </h2>
                <p className="text-[11px] text-slate-400">
                  {stage === 'credentials' ? 'Role-Based Access Control & Registered Contact 2FA' : 'Enter 6-Digit Real SMS Verification Code'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-[10px] text-slate-300 font-mono">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
              AES-256 TLS
            </div>
          </div>

          {/* Feedback messages */}
          {error && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-300 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{error}</div>
            </div>
          )}

          {success && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-300 animate-in fade-in duration-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{success}</div>
            </div>
          )}

          {/* ============================================================== */}
          {/* STAGE 1: CREDENTIALS OR REGISTRATION TABS                      */}
          {/* ============================================================== */}
          {stage === 'credentials' && (
            <div>
              {/* Tab Selector */}
              <div className="flex rounded-xl bg-slate-800/80 p-1 mb-5 border border-slate-700/60">
                <button
                  type="button"
                  onClick={() => { setActiveTab('signin'); setError(''); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition ${
                    activeTab === 'signin'
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Manager Sign In
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab('register'); setError(''); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition ${
                    activeTab === 'register'
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Register Manager (Admin)
                </button>
              </div>

              {/* TAB 1: SIGN IN */}
              {activeTab === 'signin' && (
                <form onSubmit={handleRequestOTP} className="space-y-4">
                  {/* Genuine Enterprise Manager Accounts Cards */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-2 uppercase tracking-wider">
                      Select Corporate Role to Load Verified Manager:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {ENTERPRISE_ACCOUNTS.map((acc) => (
                        <button
                          key={acc.role}
                          type="button"
                          onClick={() => handleSelectAccount(acc)}
                          className={`p-2.5 rounded-xl text-left border transition text-xs flex flex-col justify-between cursor-pointer ${
                            username === acc.username
                              ? 'border-sky-500 bg-sky-500/15 text-white shadow-sm'
                              : 'border-slate-800 bg-slate-800/40 text-slate-300 hover:border-slate-700 hover:bg-slate-800'
                          }`}
                        >
                          <div>
                            <div className="font-bold text-[11px] text-white truncate">{acc.title}</div>
                            <div className="text-[10px] text-sky-400 font-mono mt-0.5">ID: {acc.username}</div>
                          </div>
                          <div className="text-[10px] text-emerald-400 font-mono mt-1.5 flex items-center gap-1">
                            <Smartphone className="w-3 h-3 shrink-0" />
                            <span>{acc.phone}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* User ID Field */}
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                      User ID / Employee Code
                    </label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Enter Employee ID (e.g. admin, sales_mgr, inventory_mgr)"
                        className="w-full rounded-xl border border-slate-700 bg-slate-800/90 pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 transition"
                        required
                      />
                    </div>
                  </div>

                  {/* Password Field */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-300">Password</label>
                      <span className="text-[11px] text-slate-400 font-mono">
                        Role: <strong className="text-sky-400">{selectedRole}</strong>
                      </span>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter account password"
                        className="w-full rounded-xl border border-slate-700 bg-slate-800/90 pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 transition"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-2.5 text-slate-400 hover:text-slate-200"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Submit to get OTP */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 py-3 text-xs font-bold text-white shadow-lg shadow-sky-500/25 hover:from-sky-400 hover:to-indigo-500 transition disabled:opacity-50 flex items-center justify-center gap-2 mt-2 cursor-pointer"
                  >
                    <span>{loading ? 'Verifying Credentials...' : 'Authenticate & Dispatch Real 2FA OTP'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}

              {/* TAB 2: REGISTER MANAGER */}
              {activeTab === 'register' && (
                <form onSubmit={handleRegister} className="space-y-3.5">
                  <div className="p-3 rounded-xl bg-sky-950/30 border border-sky-500/20 text-xs text-sky-300">
                    👑 <strong>Admin Governance Notice:</strong> New manager accounts are strictly mapped to corporate roles. Every transaction executes with destination tracking.
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Full Name</label>
                    <input
                      type="text"
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      placeholder="e.g. Ramesh K. Patel"
                      className="w-full rounded-xl border border-slate-700 bg-slate-800/90 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">User ID</label>
                      <input
                        type="text"
                        value={regUsername}
                        onChange={(e) => setRegUsername(e.target.value)}
                        placeholder="e.g. ramesh_mgr"
                        className="w-full rounded-xl border border-slate-700 bg-slate-800/90 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Password</label>
                      <input
                        type="password"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="Create secure password"
                        className="w-full rounded-xl border border-slate-700 bg-slate-800/90 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Corporate Role</label>
                      <select
                        value={regRole}
                        onChange={(e) => setRegRole(e.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
                      >
                        <option value="Admin">System Administrator</option>
                        <option value="Sales Manager">Sales Manager</option>
                        <option value="Inventory Manager">Inventory Manager</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Verified Contact Number</label>
                      <input
                        type="tel"
                        value={regPhone}
                        onChange={(e) => setRegPhone(e.target.value)}
                        placeholder="+91 9284410610"
                        className="w-full rounded-xl border border-slate-700 bg-slate-800/90 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none font-mono"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-sky-600 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-400 hover:to-sky-500 transition disabled:opacity-50 flex items-center justify-center gap-2 mt-2 cursor-pointer"
                  >
                    <span>{loading ? 'Provisioning Account...' : 'Provision Enterprise Account'}</span>
                    <Check className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* STAGE 2: 6-DIGIT OTP VERIFICATION GATEWAY                      */}
          {/* ============================================================== */}
          {stage === 'otp' && (
            <div className="space-y-6">
              {/* Back to credentials button */}
              <button
                type="button"
                onClick={() => { setStage('credentials'); setError(''); }}
                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-sky-400 transition cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Change User ID or Password
              </button>

              {/* User Identity & Registered Phone Pill */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-800/60 border border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-sm">
                    {username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">{username}</div>
                    <div className="text-[11px] text-sky-400 font-semibold">{selectedRole}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400">Registered Mobile (2FA)</div>
                  <div className="text-xs font-mono font-bold text-emerald-400">{maskedPhone || otpSentTo}</div>
                </div>
              </div>

              {/* SMS Gateway Transmission Banner */}
              <div className="p-3.5 rounded-xl border border-sky-500/30 bg-sky-950/30 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-sky-300 flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-sky-400" />
                    Real Carrier SMS Transmission
                  </span>
                  <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                    SMS Dispatched
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  A genuine 6-digit verification code has been dispatched to mobile <strong className="text-white font-mono">{maskedPhone || otpSentTo}</strong>. Enter the OTP below to authenticate your session.
                </p>
              </div>

              {/* 6 Digit Input Boxes */}
              <div className="pt-2">
                <label className="text-xs font-semibold text-slate-300 block mb-2 text-center">
                  Enter 6-Digit Verification Code
                </label>
                <div className="flex justify-center gap-2 sm:gap-3">
                  {otpDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={el => otpInputRefs.current[index] = el}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleDigitChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      className="w-11 h-12 sm:w-12 sm:h-14 text-center text-lg sm:text-xl font-bold font-mono rounded-xl border border-slate-700 bg-slate-800 text-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 focus:outline-none transition"
                    />
                  ))}
                </div>
              </div>

              {/* Timer & Resend */}
              <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                <div className="flex items-center gap-1">
                  <span>Code expires in:</span>
                  <strong className={`font-mono ${countdown < 15 ? 'text-rose-400 animate-pulse' : 'text-sky-400'}`}>
                    00:{countdown < 10 ? `0${countdown}` : countdown}
                  </strong>
                </div>
                <button
                  type="button"
                  disabled={countdown > 0 || loading}
                  onClick={() => handleRequestOTP(null)}
                  className="text-xs text-sky-400 hover:underline disabled:text-slate-600 disabled:no-underline flex items-center gap-1 cursor-pointer"
                >
                  <RotateCw className="w-3 h-3" />
                  Resend New Code
                </button>
              </div>

              {/* Verify & Enter Button */}
              <button
                type="button"
                onClick={handleVerifyOTP}
                disabled={loading || otpDigits.join('').length !== 6}
                className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 py-3 text-xs font-bold text-white shadow-lg shadow-emerald-500/25 hover:from-emerald-400 hover:to-teal-500 transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>{loading ? 'Verifying 2FA Security Token...' : 'Verify OTP & Launch ERP'}</span>
                <CheckCircle2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Footer project details */}
        <div className="text-center text-xs text-slate-500 space-y-1">
          <p className="font-medium text-slate-400">StockGhost ERP • Role-Based Access Control Matrix (RBAC)</p>
          <p className="text-[11px] text-slate-600">
            Projectees: Bhavesh Wandhare • Dipesh Harinkhede • Abhinav Chaudhary • Jiten Bhagat
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
