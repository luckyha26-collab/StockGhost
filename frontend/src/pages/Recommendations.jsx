import React, { useState, useEffect } from 'react';
import { recommendationAPI } from '../api';
import { 
  Lightbulb, 
  RotateCw, 
  CheckCircle2, 
  Tag, 
  Boxes, 
  Truck, 
  Gavel, 
  ArrowUpRight,
  Filter
} from 'lucide-react';

export const Recommendations = ({ onNavigateToSimulator }) => {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStatus, setFilterStatus] = useState('Pending');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadRecommendations();
  }, [filterPriority, filterStatus]);

  const loadRecommendations = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterPriority) params.priority = filterPriority;
      if (filterStatus) params.status = filterStatus;

      const res = await recommendationAPI.getAll(params);
      setRecommendations(res.data);
    } catch (err) {
      console.error('Failed to load recommendations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await recommendationAPI.refresh();
      loadRecommendations();
    } catch (err) {
      console.error('Failed to regenerate recommendations:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleMarkApplied = async (id) => {
    try {
      await recommendationAPI.updateStatus(id, 'Applied');
      loadRecommendations();
    } catch (err) {
      alert('Failed to update recommendation status.');
    }
  };

  const getActionIcon = (actionType) => {
    switch (actionType) {
      case 'Clearance Discount':
        return <Tag className="w-5 h-5 text-rose-400" />;
      case 'Bundling':
        return <Boxes className="w-5 h-5 text-amber-400" />;
      case 'Return to Supplier':
        return <Truck className="w-5 h-5 text-sky-400" />;
      case 'Liquidation':
        return <Gavel className="w-5 h-5 text-purple-400" />;
      default:
        return <Lightbulb className="w-5 h-5 text-emerald-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Lightbulb className="w-6 h-6 text-amber-400" />
            <span>Rule-Based Stock Recovery Engine</span>
          </h2>
          <p className="text-xs text-slate-400">
            Automated prescriptive actions: Clearance Discounts, Strategic Bundling, RMAs, and Liquidation
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 transition"
        >
          <RotateCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>{refreshing ? 'Scanning Catalog...' : 'Re-Evaluate Catalog'}</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-800/40 p-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-medium text-slate-400">Filter Strategies:</span>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 focus:border-sky-500 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="Pending">Pending Action</option>
            <option value="Applied">Applied / Completed</option>
          </select>

          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 focus:border-sky-500 focus:outline-none"
          >
            <option value="">All Priorities</option>
            <option value="Critical">Critical Priority</option>
            <option value="High">High Priority</option>
            <option value="Medium">Medium Priority</option>
          </select>
        </div>
      </div>

      {/* Recommendations Cards Grid */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-sky-500 border-t-transparent"></div>
        </div>
      ) : recommendations.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-12 text-center text-xs text-slate-400">
          No recommendations match your current filter. Try selecting 'All Statuses' or click 'Re-Evaluate Catalog'.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {recommendations.map((rec) => (
            <div
              key={rec.id}
              className={`rounded-xl border p-5 flex flex-col justify-between transition ${
                rec.status === 'Applied'
                  ? 'border-emerald-500/20 bg-slate-900/40 opacity-75'
                  : rec.priority === 'Critical'
                  ? 'border-rose-500/40 bg-slate-800/70 shadow-lg shadow-rose-950/20'
                  : 'border-slate-800 bg-slate-800/60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-700">
                      {getActionIcon(rec.action_type)}
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                        {rec.action_type}
                      </span>
                      <h4 className="text-sm font-bold text-white leading-tight">
                        {rec.title}
                      </h4>
                    </div>
                  </div>

                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    rec.priority === 'Critical' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' :
                    rec.priority === 'High' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                    'bg-sky-500/20 text-sky-400 border-sky-500/30'
                  }`}>
                    {rec.priority}
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed mb-4">
                  {rec.details}
                </p>

                <div className="flex items-center justify-between text-xs border-t border-slate-800 pt-3">
                  <span className="text-slate-400">Target Product:</span>
                  <span className="font-semibold text-white">{rec.product_name}</span>
                </div>

                {rec.expected_recovery > 0 && (
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-slate-400">Potential Recovery:</span>
                    <span className="font-bold text-emerald-400">
                      ₹{rec.expected_recovery.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-800">
                {rec.status === 'Applied' ? (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-4 h-4" /> Action Applied
                  </span>
                ) : (
                  <>
                    <button
                      onClick={() => onNavigateToSimulator && onNavigateToSimulator()}
                      className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 font-medium"
                    >
                      <span>Simulate Strategy</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleMarkApplied(rec.id)}
                      className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm transition"
                    >
                      Mark Executed
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Recommendations;
