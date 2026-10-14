import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import DSRSMeta from './pages/DSRSMeta';
import Simulator from './pages/Simulator';
import Recommendations from './pages/Recommendations';
import Transactions from './pages/Transactions';
import ChatbotPage from './pages/ChatbotPage';
import Login from './pages/Login';
import { BotMessageSquare } from 'lucide-react';

const MainLayout = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedProductForSimulation, setSelectedProductForSimulation] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [key, setKey] = useState(0);

  const handleRefresh = () => {
    setRefreshing(true);
    setKey(k => k + 1);
    setTimeout(() => setRefreshing(false), 600);
  };

  const navigateToSimulator = (product = null) => {
    if (product) setSelectedProductForSimulation(product);
    setActiveTab('simulator');
  };

  const navigateToRecs = (product = null) => {
    setActiveTab('recommendations');
  };

  if (!user) {
    return <Login onLoginSuccess={() => setActiveTab('dashboard')} />;
  }

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Navbar */}
      <Navbar onRefresh={handleRefresh} refreshing={refreshing} />

      {/* Main Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Content View */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-900/40">
          <div className="max-w-7xl mx-auto space-y-6" key={key}>
            {activeTab === 'dashboard' && (
              <Dashboard onNavigateToSimulator={() => navigateToSimulator()} />
            )}

            {activeTab === 'inventory' && (
              <Inventory 
                onSelectProductForSimulation={navigateToSimulator}
                onSelectProductForRecs={navigateToRecs}
              />
            )}

            {activeTab === 'dsrs' && <DSRSMeta />}

            {activeTab === 'simulator' && (
              <Simulator initialProduct={selectedProductForSimulation} />
            )}

            {activeTab === 'recommendations' && (
              <Recommendations onNavigateToSimulator={() => navigateToSimulator()} />
            )}

            {activeTab === 'transactions' && <Transactions />}

            {activeTab === 'chatbot' && <ChatbotPage />}
          </div>
        </main>
      </div>

      {/* Floating Chatbot Bubble if not on chatbot tab */}
      {activeTab !== 'chatbot' && (
        <button
          onClick={() => setActiveTab('chatbot')}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 to-indigo-600 px-4 py-3 text-xs font-bold text-white shadow-xl shadow-sky-500/30 hover:scale-105 transition transform"
        >
          <BotMessageSquare className="w-5 h-5" />
          <span>Ask StockGhost AI</span>
        </button>
      )}
    </div>
  );
};

export const App = () => {
  return (
    <AuthProvider>
      <MainLayout />
    </AuthProvider>
  );
};

export default App;
