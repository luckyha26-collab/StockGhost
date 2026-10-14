import React, { useState, useEffect } from 'react';
import { simulationAPI, inventoryAPI } from '../api';
import RiskBadge from '../components/RiskBadge';
import { 
  Sliders, 
  ArrowRight, 
  TrendingDown, 
  CheckCircle2, 
  RotateCcw, 
  DollarSign, 
  Sparkles,
  Percent,
  Layers,
  AlertCircle
} from 'lucide-react';

export const Simulator = ({ initialProduct }) => {
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [discountPercent, setDiscountPercent] = useState(25);
  const [simulationResult, setSimulationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const res = await inventoryAPI.getProducts();
      setProducts(res.data);
      
      // Auto-select initialProduct if passed, or find Gaming Keyboard (slide benchmark), or first product
      let target = null;
      if (initialProduct) {
        target = res.data.find(p => p.id === initialProduct.id);
      }
      if (!target) {
        target = res.data.find(p => p.name.includes('Gaming Keyboard') || p.sku.includes('KB'));
      }
      if (!target && res.data.length > 0) {
        target = res.data[0];
      }
      if (target) {
        setSelectedProduct(target);
        runSimulation(target.id, discountPercent);
      }
    } catch (err) {
      console.error('Failed to load products for simulator:', err);
    }
  };

  const handleProductChange = (prodId) => {
    const prod = products.find(p => p.id === parseInt(prodId));
    if (prod) {
      setSelectedProduct(prod);
      setSuccessMsg('');
      runSimulation(prod.id, discountPercent);
    }
  };

  const handleDiscountChange = (newDiscount) => {
    setDiscountPercent(newDiscount);
    if (selectedProduct) {
      runSimulation(selectedProduct.id, newDiscount);
    }
  };

  const runSimulation = async (prodId, discount) => {
    try {
      setLoading(true);
      const res = await simulationAPI.calculate(prodId, discount);
      setSimulationResult(res.data);
    } catch (err) {
      console.error('Simulation calculation failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyClearance = async () => {
    if (!selectedProduct || !simulationResult) return;
    try {
      setApplying(true);
      const res = await simulationAPI.apply(selectedProduct.id, discountPercent);
      setSuccessMsg(res.data.message);
      // Reload products to refresh database values
      const updated = await inventoryAPI.getProducts();
      setProducts(updated.data);
      const refetched = updated.data.find(p => p.id === selectedProduct.id);
      if (refetched) setSelectedProduct(refetched);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to apply clearance action.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <Sliders className="w-6 h-6 text-sky-400" />
          <span>Stock Clearance & Capital Recovery Simulator</span>
        </h2>
        <p className="text-xs text-slate-400">
          Simulate clearance strategies, predict unit sell-through, estimate cash recovery, and evaluate DSRS score drop
        </p>
      </div>

      {/* Success Notification */}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-400 backdrop-blur-sm">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Interactive Controls & Scenario Testing */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Parameter Selector */}
        <div className="rounded-xl border border-slate-800 bg-slate-800/60 p-6 space-y-6">
          <h3 className="text-sm font-semibold text-slate-200 border-b border-slate-700 pb-3">
            Simulation Parameters
          </h3>

          {/* Product Dropdown */}
          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1.5">
              Select Inventory Product to Simulate:
            </label>
            <select
              value={selectedProduct?.id || ''}
              onChange={(e) => handleProductChange(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-xs text-white focus:border-sky-500 focus:outline-none"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.current_stock} units • DSRS: {p.dsrs?.score || 0} • {p.dsrs?.tier || 'Healthy'})
                </option>
              ))}
            </select>
          </div>

          {/* Current Product Baseline Overview */}
          {selectedProduct && (
            <div className="rounded-lg border border-slate-700/80 bg-slate-900/60 p-3.5 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>SKU Code:</span>
                <span className="font-mono text-slate-200">{selectedProduct.sku}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Current Stock on Hand:</span>
                <span className="font-bold text-white">{selectedProduct.current_stock} units</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Unit Cost / Retail:</span>
                <span className="text-slate-200">₹{selectedProduct.cost_price.toLocaleString()} / ₹{selectedProduct.selling_price.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Total Blocked Capital:</span>
                <span className="font-bold text-rose-400">
                  ₹{(selectedProduct.current_stock * selectedProduct.cost_price).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400 pt-1 border-t border-slate-800">
                <span>Current DSRS Baseline:</span>
                <RiskBadge tier={selectedProduct.dsrs?.tier} score={selectedProduct.dsrs?.score} />
              </div>
            </div>
          )}

          {/* Interactive Discount Slider */}
          <div>
            <div className="flex justify-between items-center text-xs mb-2">
              <span className="font-medium text-slate-300">Proposed Clearance Discount:</span>
              <span className="font-bold text-sky-400 text-base">{discountPercent}%</span>
            </div>
            <input
              type="range"
              min="5"
              max="50"
              step="5"
              value={discountPercent}
              onChange={(e) => handleDiscountChange(parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1">
              <span>5% (Light Promo)</span>
              <span className="text-sky-400 font-semibold">25% (Recommended)</span>
              <span>50% (Liquidation)</span>
            </div>
          </div>

          {/* Quick presets */}
          <div className="grid grid-cols-3 gap-2">
            {[15, 25, 35].map(pct => (
              <button
                key={pct}
                onClick={() => handleDiscountChange(pct)}
                className={`py-1.5 rounded-lg text-xs font-medium border transition ${
                  discountPercent === pct
                    ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                }`}
              >
                {pct}% Discount
              </button>
            ))}
          </div>
        </div>

        {/* Right 2 Columns: Live Simulation Outcome Visualizer */}
        <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-800/60 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-700 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Simulated Recovery Forecast</h3>
              <p className="text-xs text-slate-400">Demand elasticity model projection</p>
            </div>
            {simulationResult && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                <Sparkles className="w-3.5 h-3.5" />
                - {simulationResult.risk_reduction_points} Points DSRS Drop
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-sky-500 border-t-transparent"></div>
            </div>
          ) : simulationResult ? (
            <div className="space-y-6">
              {/* Primary Numbers Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                  <p className="text-xs font-medium text-emerald-400">Capital Recovered (₹)</p>
                  <h4 className="text-2xl font-bold text-white mt-1">
                    ₹{simulationResult.recovered_capital.toLocaleString()}
                  </h4>
                  <p className="text-[11px] text-emerald-300/80 mt-1">
                    Injected into cash flow
                  </p>
                </div>

                <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4">
                  <p className="text-xs font-medium text-sky-400">Estimated Units Sold</p>
                  <h4 className="text-2xl font-bold text-white mt-1">
                    {simulationResult.units_sold} <span className="text-xs text-slate-400 font-normal">/ {selectedProduct?.current_stock} units</span>
                  </h4>
                  <p className="text-[11px] text-sky-300/80 mt-1">
                    At ₹{simulationResult.discounted_unit_price} / unit
                  </p>
                </div>

                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                  <p className="text-xs font-medium text-amber-400">Remaining Inventory</p>
                  <h4 className="text-2xl font-bold text-white mt-1">
                    {simulationResult.remaining_units} units
                  </h4>
                  <p className="text-[11px] text-amber-300/80 mt-1">
                    ₹{simulationResult.remaining_capital.toLocaleString()} tied up
                  </p>
                </div>
              </div>

              {/* Before vs After DSRS Transformation Card */}
              <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-5">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
                  DSRS Transformation Impact
                </h4>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                  {/* Before */}
                  <div className="text-center w-full sm:w-auto">
                    <p className="text-xs text-slate-400 mb-1">Baseline Risk</p>
                    <div className="text-4xl font-extrabold text-rose-500">
                      {simulationResult.original_dsrs}
                    </div>
                    <div className="mt-2">
                      <RiskBadge tier={simulationResult.original_tier} />
                    </div>
                  </div>

                  {/* Transition Indicator */}
                  <div className="flex flex-col items-center">
                    <span className="text-xs font-bold text-sky-400 mb-1">
                      {discountPercent}% Clearance Applied
                    </span>
                    <div className="flex items-center gap-2 text-slate-500">
                      <div className="h-0.5 w-12 bg-slate-700"></div>
                      <ArrowRight className="w-5 h-5 text-sky-400 animate-pulse" />
                      <div className="h-0.5 w-12 bg-slate-700"></div>
                    </div>
                    <span className="text-[11px] text-emerald-400 font-semibold mt-1">
                      Risk Tier De-escalated!
                    </span>
                  </div>

                  {/* After */}
                  <div className="text-center w-full sm:w-auto">
                    <p className="text-xs text-slate-400 mb-1">Projected Risk</p>
                    <div className="text-4xl font-extrabold text-amber-400">
                      {simulationResult.new_dsrs}
                    </div>
                    <div className="mt-2">
                      <RiskBadge tier={simulationResult.new_tier} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                <p className="text-xs text-slate-400">
                  Ready to deploy? Clicking below commits the clearance sales batch into ERP records.
                </p>
                <button
                  onClick={handleApplyClearance}
                  disabled={applying || simulationResult.units_sold <= 0}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 px-6 py-3 text-xs font-bold text-white shadow-lg shadow-sky-500/25 hover:from-sky-400 hover:to-indigo-500 transition disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{applying ? 'Applying Clearance...' : `Execute ${discountPercent}% Clearance Now`}</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default Simulator;
