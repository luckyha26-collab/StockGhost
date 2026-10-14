import React from 'react';
import { ShieldCheck, AlertTriangle, AlertOctagon, Skull } from 'lucide-react';

export const RiskBadge = ({ tier, score }) => {
  const t = tier || 'Healthy';

  if (t === 'Dead Stock') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30">
        <Skull className="w-3.5 h-3.5 text-rose-400" />
        Dead Stock {score !== undefined && `(${score})`}
      </span>
    );
  }

  if (t === 'High Risk') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/30">
        <AlertOctagon className="w-3.5 h-3.5 text-orange-400" />
        High Risk {score !== undefined && `(${score})`}
      </span>
    );
  }

  if (t === 'Slow Moving') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
        Slow Moving {score !== undefined && `(${score})`}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
      Healthy {score !== undefined && `(${score})`}
    </span>
  );
};

export default RiskBadge;
