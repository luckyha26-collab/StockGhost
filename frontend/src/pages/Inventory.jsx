import React, { useState, useEffect } from 'react';
import { inventoryAPI } from '../api';
import RiskBadge from '../components/RiskBadge';
import AddProductModal from '../components/AddProductModal';
import { 
  Search, 
  Filter, 
  Plus, 
  Download, 
  Sliders, 
  Lightbulb, 
  Trash2,
  Clock,
  Layers
} from 'lucide-react';

export const Inventory = ({ onSelectProductForSimulation, onSelectProductForRecs }) => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [search, setSearch] = useState('');
  const [selectedTier, setSelectedTier] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    loadProducts();
    loadMeta();
  }, [selectedTier, selectedCategory]);

  const loadMeta = async () => {
    try {
      const [cRes, sRes] = await Promise.all([
        inventoryAPI.getCategories(),
        inventoryAPI.getSuppliers()
      ]);
      setCategories(cRes.data);
      setSuppliers(sRes.data);
    } catch (err) {
      console.error('Failed to load categories/suppliers:', err);
    }
  };

  const loadProducts = async () => {
    try {
      setLoading(true);
      const params = {};
      if (selectedTier) params.tier = selectedTier;
      if (selectedCategory) params.category_id = selectedCategory;
      if (search) params.search = search;

      const res = await inventoryAPI.getProducts(params);
      setProducts(res.data);
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadProducts();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    try {
      await inventoryAPI.deleteProduct(id);
      loadProducts();
    } catch (err) {
      alert('Failed to delete product.');
    }
  };

  const exportCSV = () => {
    if (!products.length) return;
    const headers = ['SKU', 'Name', 'Category', 'Stock Qty', 'Cost Price (INR)', 'Selling Price (INR)', 'Inventory Value (INR)', 'Stock Age Days', 'Inactivity Days', 'DSRS Score', 'Tier'];
    const rows = products.map(p => [
      p.sku,
      `"${p.name.replace(/"/g, '""')}"`,
      p.category_name,
      p.current_stock,
      p.cost_price,
      p.selling_price,
      p.total_inventory_value,
      p.dsrs?.stock_age_days || 0,
      p.dsrs?.days_since_last_sale || 0,
      p.dsrs?.score || 0,
      p.dsrs?.tier || 'Healthy'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `StockGhost_Inventory_Risk_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">Inventory Catalog & Risk Scoring</h2>
          <p className="text-xs text-slate-400">
            Real-time tracking of unit counts, stock age, capital lockup, and DSRS tiers
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-md shadow-sky-600/20 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-800/40 p-4">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by name, SKU code, or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900/80 pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
          />
        </form>

        <div className="flex flex-wrap items-center gap-3">
          {/* Tier Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedTier}
              onChange={(e) => setSelectedTier(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900/80 px-2.5 py-2 text-xs text-slate-300 focus:border-sky-500 focus:outline-none"
            >
              <option value="">All Risk Tiers</option>
              <option value="Dead Stock">Dead Stock (81 - 100)</option>
              <option value="High Risk">High Risk (61 - 80)</option>
              <option value="Slow Moving">Slow Moving (31 - 60)</option>
              <option value="Healthy">Healthy (0 - 30)</option>
            </select>
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900/80 px-2.5 py-2 text-xs text-slate-300 focus:border-sky-500 focus:outline-none"
          >
            <option value="">All Categories</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Products Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-800/60 overflow-hidden shadow-lg">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-sky-500 border-t-transparent"></div>
          </div>
        ) : products.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            No products matched your search or filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-700 bg-slate-900/70 text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Product / SKU</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Current Stock</th>
                  <th className="px-4 py-3">Cost / Sell (₹)</th>
                  <th className="px-4 py-3">Inventory Value</th>
                  <th className="px-4 py-3">Stock Age</th>
                  <th className="px-4 py-3">Inactivity</th>
                  <th className="px-4 py-3">DSRS Score</th>
                  <th className="px-4 py-3">Tier</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {products.map((p) => {
                  const dsrs = p.dsrs || {};
                  return (
                    <tr key={p.id} className="hover:bg-slate-700/25 transition">
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-white">{p.name}</div>
                        <div className="font-mono text-[10px] text-slate-500">{p.sku}</div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-400">{p.category_name}</td>
                      <td className="px-4 py-3.5">
                        <span className="font-semibold text-white">{p.current_stock}</span>
                        <span className="text-slate-500"> / min {p.min_stock}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div>₹{p.cost_price.toLocaleString()}</div>
                        <div className="text-[10px] text-slate-500">₹{p.selling_price.toLocaleString()} (retail)</div>
                      </td>
                      <td className="px-4 py-3.5 font-bold">
                        <span className={dsrs.is_blocked ? 'text-rose-400' : 'text-slate-200'}>
                          ₹{p.total_inventory_value.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1 text-slate-300">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>{dsrs.stock_age_days}d</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={dsrs.days_since_last_sale > 90 ? 'text-amber-400 font-medium' : 'text-slate-400'}>
                          {dsrs.days_since_last_sale}d ago
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-bold">
                        <span className="text-white text-sm">{dsrs.score}</span>
                        <span className="text-slate-500 text-[10px]">/100</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <RiskBadge tier={dsrs.tier} />
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onSelectProductForSimulation && onSelectProductForSimulation(p)}
                            title="Simulate Clearance"
                            className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border border-sky-500/20 transition"
                          >
                            <Sliders className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onSelectProductForRecs && onSelectProductForRecs(p)}
                            title="View AI Recommendations"
                            className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 transition"
                          >
                            <Lightbulb className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(p.id)}
                            title="Delete SKU"
                            className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Product Modal */}
      <AddProductModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onProductAdded={loadProducts}
        categories={categories}
        suppliers={suppliers}
      />
    </div>
  );
};

export default Inventory;
