import React, { useEffect, useState } from 'react';
import { 
  Chart as ChartJS, 
  ArcElement, 
  Tooltip, 
  Legend, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title 
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { analyticsAPI } from '../api';
import StatCard from '../components/StatCard';
import RiskBadge from '../components/RiskBadge';
import { 
  DollarSign, 
  AlertTriangle, 
  Package, 
  Gauge, 
  Skull, 
  ArrowRight, 
  TrendingDown, 
  ShieldAlert 
} from 'lucide-react';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

export const Dashboard = ({ onNavigateToSimulator }) => {
  const [metrics, setMetrics] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [mRes, cRes] = await Promise.all([
        analyticsAPI.getDashboardMetrics(),
        analyticsAPI.getCategoryBreakdown()
      ]);
      setMetrics(mRes.data);
      setCategories(cRes.data);
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !metrics) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent"></div>
      </div>
    );
  }

  // Doughnut Chart Data (Risk Tiers)
  const tierCounts = metrics.tier_counts || {};
  const doughnutData = {
    labels: ['Healthy', 'Slow Moving', 'High Risk', 'Dead Stock'],
    datasets: [
      {
        data: [
          tierCounts['Healthy'] || 0,
          tierCounts['Slow Moving'] || 0,
          tierCounts['High Risk'] || 0,
          tierCounts['Dead Stock'] || 0
        ],
        backgroundColor: [
          '#10b981', // green
          '#f59e0b', // amber
          '#f97316', // orange
          '#ef4444', // red
        ],
        borderColor: '#0f172a',
        borderWidth: 2,
      },
    ],
  };

  // Bar Chart Data (Blocked Capital by Category)
  const barData = {
    labels: categories.map(c => c.category_name),
    datasets: [
      {
        label: 'Blocked Capital (₹)',
        data: categories.map(c => c.blocked_capital),
        backgroundColor: 'rgba(239, 68, 68, 0.85)',
        borderRadius: 6,
      },
      {
        label: 'Total Value (₹)',
        data: categories.map(c => c.total_value),
        backgroundColor: 'rgba(2, 132, 199, 0.6)',
        borderRadius: 6,
      }
    ],
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Alert for High Blocked Capital */}
      {metrics.total_blocked_capital > 0 && (
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-rose-500/20 p-2.5 text-rose-400">
              <ShieldAlert className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-rose-300">
                Blocked Capital Alert: ₹{metrics.total_blocked_capital.toLocaleString()} Locked in High Risk & Dead Stock
              </h4>
              <p className="text-xs text-rose-300/80">
                {metrics.blocked_capital_percent}% of current inventory value is non-performing. Immediate clearance simulation advised.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigateToSimulator && onNavigateToSimulator()}
            className="flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-rose-500 transition"
          >
            <span>Launch Simulator</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Inventory Value"
          value={`₹${metrics.total_inventory_value.toLocaleString()}`}
          subtitle={`${metrics.total_skus} Active Catalog SKUs`}
          icon={Package}
          color="sky"
        />
        <StatCard
          title="Total Blocked Capital"
          value={`₹${metrics.total_blocked_capital.toLocaleString()}`}
          subtitle={`${metrics.blocked_capital_percent}% Capital Exposure`}
          icon={DollarSign}
          color="rose"
          alert={true}
        />
        <StatCard
          title="Dead Stock SKUs"
          value={`${tierCounts['Dead Stock'] || 0} Products`}
          subtitle={`${tierCounts['High Risk'] || 0} Additional in High Risk`}
          icon={Skull}
          color="amber"
        />
        <StatCard
          title="Average DSRS Score"
          value={`${metrics.average_dsrs} / 100`}
          subtitle="Catalog Health Index"
          icon={Gauge}
          color={metrics.average_dsrs > 50 ? 'rose' : 'emerald'}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Doughnut Chart: Risk Tiers */}
        <div className="rounded-xl border border-slate-800 bg-slate-800/60 p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-1">DSRS Risk Tier Distribution</h3>
          <p className="text-xs text-slate-400 mb-4">Breakdown of catalog items by health score</p>
          <div className="h-64 flex items-center justify-center">
            <Doughnut 
              data={doughnutData} 
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 } } },
                }
              }} 
            />
          </div>
        </div>

        {/* Bar Chart: Blocked Capital by Category */}
        <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-800/60 p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-1">Blocked Capital vs Inventory Value by Category</h3>
          <p className="text-xs text-slate-400 mb-4">Red bars indicate non-performing capital tied up in slow/dead items</p>
          <div className="h-64">
            <Bar 
              data={barData} 
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } },
                },
                scales: {
                  x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#1e293b' } },
                  y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#1e293b' } },
                }
              }} 
            />
          </div>
        </div>
      </div>

      {/* Top Risky Products Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-800/60 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Critical Non-Performing Assets (Top Risky SKUs)</h3>
            <p className="text-xs text-slate-400">Ranked by Dead Stock Risk Score and tied-up capital volume</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-700 bg-slate-900/50 text-slate-400 uppercase">
              <tr>
                <th className="px-4 py-3">Product Name & SKU</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Stock Units</th>
                <th className="px-4 py-3">Blocked Capital (₹)</th>
                <th className="px-4 py-3">Inactivity (Days)</th>
                <th className="px-4 py-3">DSRS Score</th>
                <th className="px-4 py-3">Classification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {metrics.top_risky_products.map((item) => (
                <tr key={item.id} className="hover:bg-slate-700/30 transition">
                  <td className="px-4 py-3 font-medium text-white">
                    <div>{item.name}</div>
                    <span className="text-[10px] text-slate-500 font-mono">{item.sku}</span>
                  </td>
                  <td className="px-4 py-3">{item.category}</td>
                  <td className="px-4 py-3 font-semibold">{item.current_stock} units</td>
                  <td className="px-4 py-3 font-semibold text-rose-400">
                    ₹{item.inventory_value.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={item.days_since_last_sale > 100 ? 'text-amber-400' : 'text-slate-400'}>
                      {item.days_since_last_sale} days
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-bold text-slate-200">{item.dsrs_score}</span>
                    <span className="text-slate-500 text-[10px]"> /100</span>
                  </td>
                  <td className="px-4 py-3">
                    <RiskBadge tier={item.tier} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
