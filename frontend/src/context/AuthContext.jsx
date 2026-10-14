import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  // If not logged in, user is null and Login page is shown
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('stockghost_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.two_factor_verified) return parsed;
      } catch (e) { }
    }
    return null;
  });
  
  const [token, setToken] = useState(() => localStorage.getItem('stockghost_token') || null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      localStorage.setItem('stockghost_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('stockghost_user');
    }
  }, [user]);

  const sendOTP = async (username, password) => {
    setLoading(true);
    try {
      const res = await authAPI.sendOTP({ username, password });
      return { success: true, data: res.data };
    } catch (err) {
      return {
        success: false,
        error: err.response?.data?.error || 'Authentication failed. Please check ID and password.'
      };
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async (username, otp) => {
    setLoading(true);
    try {
      const res = await authAPI.verifyOTP({ username, otp });
      setUser(res.data.user);
      setToken(res.data.token);
      localStorage.setItem('stockghost_token', res.data.token);
      return { success: true, user: res.data.user };
    } catch (err) {
      return {
        success: false,
        error: err.response?.data?.error || err.message || 'OTP verification failed. Check the 6-digit code.'
      };
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    setLoading(true);
    try {
      const res = await authAPI.login({ email, password });
      setUser(res.data.user);
      setToken(res.data.token);
      localStorage.setItem('stockghost_token', res.data.token);
      return { success: true, user: res.data.user };
    } catch (err) {
      return { 
        success: false, 
        error: err.response?.data?.error || 'Login failed. Please check your credentials.' 
      };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('stockghost_token');
    localStorage.removeItem('stockghost_user');
    sessionStorage.removeItem('stockghost_pending_otp');
  };

  // Switch role utility with full 2FA flag
  const switchRole = (newRole) => {
    const roleProfiles = {
      'Admin': { id: 1, username: 'admin', email: 'admin@stockghost.com', role: 'Admin', two_factor_verified: true },
      'Inventory Manager': { id: 2, username: 'inventory_mgr', email: 'inventory@stockghost.com', role: 'Inventory Manager', two_factor_verified: true },
      'Sales Manager': { id: 3, username: 'sales_mgr', email: 'sales@stockghost.com', role: 'Sales Manager', two_factor_verified: true },
    };
    const selected = roleProfiles[newRole] || roleProfiles['Admin'];
    setUser(selected);
    setToken('jwt-2fa-verified-token');
    localStorage.setItem('stockghost_token', 'jwt-2fa-verified-token');
  };

  return (
    <AuthContext.Provider value={{ user, token, sendOTP, verifyOTP, login, logout, switchRole, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
