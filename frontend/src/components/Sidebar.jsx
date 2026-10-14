import React from 'react';
import { 
  LayoutDashboard, 
  Package, 
  Gauge, 
  Sliders, 
  Lightbulb, 
  ArrowLeftRight, 
  BotMessageSquare,
  FileSpreadsheet
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';

export const Sidebar = ({ activeTab, setActiveTab }) => {
  const { user } = useAuth();
  const userRole = user?.role || 'Admin';

  const allNavItems = [
    { id: 'dashboard', label: 'Dashboard & KPIs', icon: LayoutDashboard, roles: ['Admin', 'Sales Manager', 'Inventory Manager'] },
    { id: 'inventory', label: 'Inventory & SKUs', icon: Package, roles: ['Admin', 'Inventory Manager'] },
    { id: 'dsrs', label: 'DSRS Risk Matrix', icon: Gauge, roles: ['Admin', 'Inventory Manager'] },
    { id: 'simulator', label: 'Clearance Simulator', icon: Sliders, badge: 'What-If', roles: ['Admin', 'Sales Manager'] },
    { id: 'recommendations', label: 'Recovery Engine', icon: Lightbulb, badge: 'AI', roles: ['Admin', 'Sales Manager', 'Inventory Manager'] },
    { id: 'transactions', label: 'Purchases & Sales', icon: ArrowLeftRight, roles: ['Admin', 'Sales Manager', 'Inventory Manager'] },
    { id: 'chatbot', label: 'Inventory Chatbot', icon: BotMessageSquare, badge: 'Live', roles: ['Admin', 'Sales Manager', 'Inventory Manager'] },
  ];

  const navItems = allNavItems.filter(item => item.roles.includes(userRole));

  return (
    <aside className="w-64 flex-shrink-0 border-r border-slate-800 bg-slate-900/60 p-4 flex flex-col justify-between hidden md:flex">
      <div className="space-y-6">
        <div>
          <p className="px-3 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
            ERP Risk Modules
          </p>
          <nav className="mt-2 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-sky-400' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      isActive ? 'bg-sky-400 text-slate-950' : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Project Info Box */}
        <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3 text-xs text-slate-400">
          <p className="font-semibold text-slate-200 mb-1">StockGhost Detection</p>
          <p className="text-[11px] leading-relaxed text-slate-400">
            Automated Dead Stock Risk Score (DSRS) algorithm detecting stagnant capital before severe losses occur.
          </p>
        </div>
      </div>

      {/* Footer Info */}
      <div className="border-t border-slate-800 pt-3 text-[11px] text-slate-500 text-center">
        <p>IT Final Year Project • 2024-25</p>
        <p className="text-[10px] text-slate-600">StockGhost Core v1.0</p>
      </div>
    </aside>
  );
};

export default Sidebar;
