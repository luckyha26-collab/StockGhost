import React, { useState } from 'react';
import { X, Plus, AlertCircle } from 'lucide-react';
import { inventoryAPI } from '../api';

export const AddProductModal = ({ isOpen, onClose, onProductAdded, categories, suppliers }) => {
  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    description: '',
    category_id: categories[0]?.id || 1,
    supplier_id: suppliers[0]?.id || 1,
    cost_price: '',
    selling_price: '',
    current_stock: '',
    min_stock: '10',
    warehouse_location: 'Bay A-01',
    first_received_date: new Date().toISOString().split('T')[0]
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.sku || !formData.name || !formData.cost_price || !formData.selling_price) {
      setError('Please fill in all required fields.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await inventoryAPI.createProduct({
        ...formData,
        cost_price: parseFloat(formData.cost_price),
        selling_price: parseFloat(formData.selling_price),
        current_stock: parseInt(formData.current_stock || '0'),
        min_stock: parseInt(formData.min_stock || '10'),
      });
      onProductAdded();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add product.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-lg font-bold text-white">Add New Inventory Product</h3>
            <p className="text-xs text-slate-400">StockGhost DSRS algorithm will score this item upon entry</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-rose-500/10 p-3 text-xs text-rose-400 border border-rose-500/20">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-300">SKU Code *</label>
              <input
                type="text"
                placeholder="e.g. KB-RGB-99"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300">Product Name *</label>
              <input
                type="text"
                placeholder="e.g. Wireless Pro Headset"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-300">Category</label>
              <select
                value={formData.category_id}
                onChange={(e) => setFormData({ ...formData, category_id: parseInt(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300">Supplier</label>
              <select
                value={formData.supplier_id}
                onChange={(e) => setFormData({ ...formData, supplier_id: parseInt(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-300">Cost Price (₹) *</label>
              <input
                type="number"
                step="0.01"
                placeholder="1500"
                value={formData.cost_price}
                onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300">Selling Price (₹) *</label>
              <input
                type="number"
                step="0.01"
                placeholder="2000"
                value={formData.selling_price}
                onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300">Stock Qty *</label>
              <input
                type="number"
                placeholder="50"
                value={formData.current_stock}
                onChange={(e) => setFormData({ ...formData, current_stock: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-300">Warehouse Location</label>
              <input
                type="text"
                placeholder="Rack B-02"
                value={formData.warehouse_location}
                onChange={(e) => setFormData({ ...formData, warehouse_location: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300">Received Date</label>
              <input
                type="date"
                value={formData.first_received_date}
                onChange={(e) => setFormData({ ...formData, first_received_date: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-sky-500 focus:outline-none disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddProductModal;
