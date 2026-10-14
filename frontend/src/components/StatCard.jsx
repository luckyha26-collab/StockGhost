import React from 'react';

export const StatCard = ({ title, value, subtitle, icon: Icon, color = 'sky', alert = false }) => {
  const colorMap = {
    sky: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    rose: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20'
  };

  return (
    <div className={`relative overflow-hidden rounded-xl border p-5 bg-slate-800/80 backdrop-blur-sm shadow-lg transition-all hover:border-slate-600 ${alert ? 'border-rose-500/40' : 'border-slate-700/60'}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-400">{title}</p>
        {Icon && (
          <div className={`p-2.5 rounded-lg border ${colorMap[color] || colorMap.sky}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
      <div className="mt-3">
        <h3 className="text-2xl font-bold tracking-tight text-white">{value}</h3>
        {subtitle && (
          <p className="mt-1 text-xs text-slate-400 flex items-center gap-1">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
};

export default StatCard;
