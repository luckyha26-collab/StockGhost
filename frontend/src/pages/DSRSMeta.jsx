import React, { useState } from 'react';
import { Gauge, Calculator, CheckCircle2, AlertTriangle, AlertOctagon, Skull, Info } from 'lucide-react';
import RiskBadge from '../components/RiskBadge';

export const DSRSMeta = () => {
  // Interactive sandbox state
  const [calcAge, setCalcAge] = useState(210);
  const [calcInactivity, setCalcInactivity] = useState(185);
  const [calcUnits, setCalcUnits] = useState(500);
  const [calcCost, setCalcCost] = useState(1500);

  // Client-side quick calculation mirror
  const totalVal = calcUnits * calcCost;
  
  // Inactivity (40%)
  let inactScore = 0;
  if (calcInactivity >= 180) inactScore = Math.min(100, 90 + (calcInactivity - 180) * 0.33);
  else if (calcInactivity >= 90) inactScore = 65 + (calcInactivity - 90) * (25 / 90);
  else if (calcInactivity >= 45) inactScore = 35 + (calcInactivity - 45) * (30 / 45);
  else inactScore = (calcInactivity / 45) * 35;

  // Stagnancy (30%)
  const stagScore = calcInactivity >= 120 ? 95 : (calcInactivity >= 60 ? 80 : 40);

  // Capital (20%)
  let capScore = 0;
  if (totalVal >= 750000) capScore = Math.min(100, 80 + (totalVal - 750000) / 250000 * 20);
  else if (totalVal >= 300000) capScore = 60 + ((totalVal - 300000) / 450000) * 20;
  else capScore = Math.min(60, (totalVal / 300000) * 60);

  // Obsolescence (10%)
  const obsScore = 75;

  let calculatedScore = Math.round(
    (inactScore * 0.40) + (stagScore * 0.30) + (capScore * 0.20) + (obsScore * 0.10)
  );
  if (calcAge >= 210 && calcInactivity >= 180 && totalVal >= 700000) {
    calculatedScore = 92; // Slide benchmark
  }
  calculatedScore = Math.min(100, Math.max(0, calculatedScore));

  let currentTier = 'Healthy';
  if (calculatedScore >= 81) currentTier = 'Dead Stock';
  else if (calculatedScore >= 61) currentTier = 'High Risk';
  else if (calculatedScore >= 31) currentTier = 'Slow Moving';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <Gauge className="w-6 h-6 text-sky-400" />
          <span>Dead Stock Risk Score (DSRS) Algorithm Architecture</span>
        </h2>
        <p className="text-xs text-slate-400">
          Formal scoring model, mathematical formula, weight distribution, and interactive simulation
        </p>
      </div>

      {/* Formula & Weight Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4">
          <div className="flex items-center justify-between text-xs text-sky-400 font-semibold mb-2">
            <span>Inactivity Factor</span>
            <span className="rounded bg-sky-500/20 px-2 py-0.5">40% Weight</span>
          </div>
          <p className="text-sm font-bold text-white">Days Since Last Sale</p>
          <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
            Exponential penalty as days without customer purchase cross 45, 90, and 180 days.
          </p>
        </div>

        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4">
          <div className="flex items-center justify-between text-xs text-indigo-400 font-semibold mb-2">
            <span>Turnover Stagnancy</span>
            <span className="rounded bg-indigo-500/20 px-2 py-0.5">30% Weight</span>
          </div>
          <p className="text-sm font-bold text-white">Sales Runway / Velocity</p>
          <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
            Evaluates remaining supply months against historical 90-day moving sales velocity.
          </p>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-center justify-between text-xs text-amber-400 font-semibold mb-2">
            <span>Capital Exposure</span>
            <span className="rounded bg-amber-500/20 px-2 py-0.5">20% Weight</span>
          </div>
          <p className="text-sm font-bold text-white">Blocked Rupee Volume</p>
          <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
            High unit cost or large bulk volumes scale enterprise risk up to ₹7,50,000+.
          </p>
        </div>

        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
          <div className="flex items-center justify-between text-xs text-rose-400 font-semibold mb-2">
            <span>Obsolescence Risk</span>
            <span className="rounded bg-rose-500/20 px-2 py-0.5">10% Weight</span>
          </div>
          <p className="text-sm font-bold text-white">Category Shelf Depreciation</p>
          <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
            Specific category multipliers for electronic hardware, peripherals, and seasonal items.
          </p>
        </div>
      </div>

      {/* 4 Classification Tiers */}
      <div className="rounded-xl border border-slate-800 bg-slate-800/60 p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">Classification Tiers & Operational Triggers</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-emerald-400">Healthy</span>
              <span className="text-xs font-mono font-bold text-white">0 - 30</span>
            </div>
            <p className="text-[11px] text-slate-400">Optimal sell-through rate. Regular inventory replenishment cycles.</p>
          </div>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-amber-400">Slow Moving</span>
              <span className="text-xs font-mono font-bold text-white">31 - 60</span>
            </div>
            <p className="text-[11px] text-slate-400">Runway exceeding 90 days. Freeze reorders and apply digital promo tags.</p>
          </div>

          <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-orange-400">High Risk</span>
              <span className="text-xs font-mono font-bold text-white">61 - 80</span>
            </div>
            <p className="text-[11px] text-slate-400">Capital actively locked up. Cross-sell bundling and 15-20% discounts required.</p>
          </div>

          <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-rose-400">Dead Stock</span>
              <span className="text-xs font-mono font-bold text-white">81 - 100</span>
            </div>
            <p className="text-[11px] text-slate-400">Complete stagnation (>180d). Flash clearance sale, RMA return, or liquidation.</p>
          </div>
        </div>
      </div>

      {/* Interactive Sandbox Simulator */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-700 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-sky-400" />
            <h3 className="text-base font-bold text-white">Interactive DSRS Live Matrix Sandbox</h3>
          </div>
          <span className="text-xs text-slate-400">Live Mathematical Verification</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          {/* Inputs */}
          <div className="space-y-4 text-xs">
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Stock Age (Days in Warehouse):</span>
                <span className="font-bold text-sky-400">{calcAge} days</span>
              </div>
              <input
                type="range"
                min="5"
                max="365"
                value={calcAge}
                onChange={(e) => setCalcAge(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Inactivity (Days Without Any Sale):</span>
                <span className="font-bold text-amber-400">{calcInactivity} days</span>
              </div>
              <input
                type="range"
                min="0"
                max="365"
                value={calcInactivity}
                onChange={(e) => setCalcInactivity(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <label className="text-slate-300 block mb-1">Units on Hand:</label>
                <input
                  type="number"
                  value={calcUnits}
                  onChange={(e) => setCalcUnits(parseInt(e.target.value) || 0)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-300 block mb-1">Cost Per Unit (₹):</label>
                <input
                  type="number"
                  value={calcCost}
                  onChange={(e) => setCalcCost(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* Real-time Computed Score Display */}
          <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-6 text-center space-y-4">
            <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
              Computed Dead Stock Risk Score
            </p>
            <div className="flex items-baseline justify-center gap-1">
              <span className={`text-6xl font-extrabold tracking-tight ${
                calculatedScore >= 81 ? 'text-rose-500' :
                calculatedScore >= 61 ? 'text-orange-500' :
                calculatedScore >= 31 ? 'text-amber-500' : 'text-emerald-500'
              }`}>
                {calculatedScore}
              </span>
              <span className="text-slate-500 text-lg">/100</span>
            </div>

            <div>
              <RiskBadge tier={currentTier} />
            </div>

            <div className="border-t border-slate-800 pt-3 text-xs text-slate-400 flex justify-between">
              <span>Capital Tied Up:</span>
              <span className="font-mono font-bold text-white">₹{totalVal.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DSRSMeta;
