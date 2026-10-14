import React, { useState, useEffect } from 'react';
import { inventoryAPI } from '../api';
import { ArrowLeftRight, ShoppingCart, Truck, Plus, Calendar, DollarSign, CheckCircle2, X } from 'lucide-react';

export const Transactions = () => {
  const [tab, setTab] = useState('sales'); // 'sales' or 'purchases'
  const [sales, setSales] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);

  // New Sale modal state
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [saleForm, setSaleForm] = useState({
    product_id: '',
    quantity: 1,
    unit_price: '',
    discount_percent: 0,
    channel: 'Retail POS'
  });

  // New Purchase modal state
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState({
    product_id: '',
    supplier_id: '',
    quantity: 50,
    unit_cost: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [sRes, pRes, prRes, supRes] = await Promise.all([
        inventoryAPI.getSales(),
        inventoryAPI.getPurchases(),
        inventoryAPI.getProducts(),
        inventoryAPI.getSuppliers()
      ]);

      const salesList = sRes.data || [];
      const purchasesList = pRes.data || [];
      const productsList = prRes.data || [];
      const suppliersList = supRes.data || [];

      setSales(salesList);
      setPurchases(purchasesList);
      setProducts(productsList);
      setSuppliers(suppliersList);

      if (productsList.length > 0) {
        setSaleForm(f => ({
          ...f,
          product_id: productsList[0].id,
          unit_price: productsList[0].selling_price
        }));
        setPurchaseForm(f => ({
          ...f,
          product_id: productsList[0].id,
          unit_cost: productsList[0].cost_price
        }));
      }
      if (suppliersList.length > 0) {
        setPurchaseForm(f => ({ ...f, supplier_id: suppliersList[0].id }));
      }
    } catch (err) {
      console.error('Failed to load transaction data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSaleModal = () => {
    if (products.length > 0) {
      const p = products[0];
      setSaleForm({
        product_id: p.id,
        quantity: 1,
        unit_price: p.selling_price,
        discount_percent: 0,
        channel: 'Retail POS'
      });
    }
    setShowSaleModal(true);
  };

  const handleOpenPurchaseModal = () => {
    if (products.length > 0 && suppliers.length > 0) {
      const p = products[0];
      const s = suppliers[0];
      setPurchaseForm({
        product_id: p.id,
        supplier_id: s.id,
        quantity: 50,
        unit_cost: p.cost_price
      });
    }
    setShowPurchaseModal(true);
  };

  const handleSaleProductChange = (prodId) => {
    const p = products.find(prod => prod.id === parseInt(prodId));
    setSaleForm(f => ({
      ...f,
      product_id: parseInt(prodId),
      unit_price: p ? p.selling_price : f.unit_price
    }));
  };

  const handlePurchaseProductChange = (prodId) => {
    const p = products.find(prod => prod.id === parseInt(prodId));
    setPurchaseForm(f => ({
      ...f,
      product_id: parseInt(prodId),
      unit_cost: p ? p.cost_price : f.unit_cost
    }));
  };

  const submitSale = async (e) => {
    e.preventDefault();
    try {
      await inventoryAPI.createSale({
        ...saleForm,
        product_id: parseInt(saleForm.product_id),
        quantity: parseInt(saleForm.quantity),
        unit_price: parseFloat(saleForm.unit_price),
        discount_percent: parseFloat(saleForm.discount_percent || 0)
      });
      setShowSaleModal(false);
      await loadData();
    } catch (err) {
      alert(err.message || 'Failed to record sale');
    }
  };

  const submitPurchase = async (e) => {
    e.preventDefault();
    try {
      await inventoryAPI.createPurchase({
        ...purchaseForm,
        product_id: parseInt(purchaseForm.product_id),
        supplier_id: parseInt(purchaseForm.supplier_id),
        quantity: parseInt(purchaseForm.quantity),
        unit_cost: parseFloat(purchaseForm.unit_cost)
      });
      setShowPurchaseModal(false);
      await loadData();
    } catch (err) {
      alert(err.message || 'Failed to record purchase');
    }
  };

  const selectedSaleProduct = products.find(p => p.id === parseInt(saleForm.product_id));
  const estimatedSaleTotal = (parseInt(saleForm.quantity) || 0) * (parseFloat(saleForm.unit_price) || 0) * (1 - (parseFloat(saleForm.discount_percent) || 0) / 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-sky-400" />
            <span>ERP Purchase & Sales Ledger</span>
          </h2>
          <p className="text-xs text-slate-400">
            Real-time inward PO receipts and outward POS sales transactions updating stock velocity
          </p>
        </div>

        <div className="flex items-center gap-2">
          {tab === 'sales' ? (
            <button
              onClick={handleOpenSaleModal}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record Outward Sale</span>
            </button>
          ) : (
            <button
              onClick={handleOpenPurchaseModal}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-md transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Inward Purchase Order</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 text-xs font-semibold">
        <button
          onClick={() => setTab('sales')}
          className={`flex items-center gap-2 pb-3 px-4 border-b-2 transition ${
            tab === 'sales'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          <span>Outward Sales ({sales.length})</span>
        </button>
        <button
          onClick={() => setTab('purchases')}
          className={`flex items-center gap-2 pb-3 px-4 border-b-2 transition ${
            tab === 'purchases'
              ? 'border-sky-500 text-sky-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>Inward Purchase Orders ({purchases.length})</span>
        </button>
      </div>

      {/* Content Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-800/60 overflow-hidden shadow-lg">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-sky-500 border-t-transparent"></div>
          </div>
        ) : tab === 'sales' ? (
          sales.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">No sales recorded yet. Click "Record Outward Sale" above.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-700 bg-slate-900/70 text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Invoice No</th>
                    <th className="px-4 py-3">Product Name</th>
                    <th className="px-4 py-3">Quantity</th>
                    <th className="px-4 py-3">Unit Price (₹)</th>
                    <th className="px-4 py-3">Discount</th>
                    <th className="px-4 py-3">Total Amount</th>
                    <th className="px-4 py-3">Channel</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {sales.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-700/20 transition">
                      <td className="px-4 py-3 font-mono font-medium text-white">{s.invoice_number}</td>
                      <td className="px-4 py-3 font-medium text-slate-200">{s.product_name}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-400">{s.quantity} units</td>
                      <td className="px-4 py-3">₹{s.unit_price.toLocaleString()}</td>
                      <td className="px-4 py-3">{s.discount_percent > 0 ? `${s.discount_percent}%` : '—'}</td>
                      <td className="px-4 py-3 font-bold text-white">₹{s.total_amount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-400">{s.channel}</td>
                      <td className="px-4 py-3 text-slate-400">{s.sale_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          purchases.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">No purchase orders recorded yet. Click "New Inward Purchase Order" above.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-700 bg-slate-900/70 text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">PO Number</th>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3">Quantity</th>
                    <th className="px-4 py-3">Unit Cost (₹)</th>
                    <th className="px-4 py-3">Total Cost</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {purchases.map((po) => (
                    <tr key={po.id} className="hover:bg-slate-700/20 transition">
                      <td className="px-4 py-3 font-mono font-medium text-white">{po.order_number}</td>
                      <td className="px-4 py-3 font-medium text-slate-200">{po.product_name}</td>
                      <td className="px-4 py-3 text-slate-400">{po.supplier_name}</td>
                      <td className="px-4 py-3 font-semibold text-sky-400">{po.quantity} units</td>
                      <td className="px-4 py-3">₹{po.unit_cost.toLocaleString()}</td>
                      <td className="px-4 py-3 font-bold text-white">₹{po.total_cost.toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-400">{po.purchase_date}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                          {po.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Sale Modal */}
      {showSaleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-emerald-400" />
                <span>Record Outward Sale</span>
              </h3>
              <button onClick={() => setShowSaleModal(false)} className="rounded-lg p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={submitSale} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-medium block mb-1">Product:</label>
                <select
                  value={saleForm.product_id}
                  onChange={(e) => handleSaleProductChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                  required
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Stock: {p.current_stock} units • ₹{p.selling_price})
                    </option>
                  ))}
                </select>
                {selectedSaleProduct && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    Available Stock: <span className="font-semibold text-white">{selectedSaleProduct.current_stock} units</span>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Quantity:</label>
                  <input
                    type="number"
                    min="1"
                    max={selectedSaleProduct ? selectedSaleProduct.current_stock : 9999}
                    value={saleForm.quantity}
                    onChange={(e) => setSaleForm({ ...saleForm, quantity: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Unit Price (₹):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={saleForm.unit_price}
                    onChange={(e) => setSaleForm({ ...saleForm, unit_price: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Discount (%):</label>
                  <input
                    type="number"
                    min="0"
                    max="90"
                    value={saleForm.discount_percent}
                    onChange={(e) => setSaleForm({ ...saleForm, discount_percent: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Sales Channel:</label>
                  <select
                    value={saleForm.channel}
                    onChange={(e) => setSaleForm({ ...saleForm, channel: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="Retail POS">Retail POS</option>
                    <option value="Online Webstore">Online Webstore</option>
                    <option value="B2B Wholesale">B2B Wholesale</option>
                    <option value="Clearance Campaign">Clearance Campaign</option>
                  </select>
                </div>
              </div>

              {/* Total calculation preview */}
              <div className="rounded-lg bg-slate-800/80 p-3 flex justify-between items-center text-xs">
                <span className="text-slate-400">Total Transaction Amount:</span>
                <span className="font-bold text-base text-emerald-400">
                  ₹{estimatedSaleTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSaleModal(false)}
                  className="rounded-lg px-4 py-2 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-5 py-2 font-semibold text-white shadow-md hover:bg-emerald-500 transition"
                >
                  Save Sale
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Purchase Modal */}
      {showPurchaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Truck className="w-5 h-5 text-sky-400" />
                <span>New Inward Purchase Order</span>
              </h3>
              <button onClick={() => setShowPurchaseModal(false)} className="rounded-lg p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={submitPurchase} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-medium block mb-1">Product:</label>
                <select
                  value={purchaseForm.product_id}
                  onChange={(e) => handlePurchaseProductChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-sky-500 focus:outline-none"
                  required
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Current: {p.current_stock} units • Cost: ₹{p.cost_price})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Supplier:</label>
                <select
                  value={purchaseForm.supplier_id}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, supplier_id: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-sky-500 focus:outline-none"
                  required
                >
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Quantity to Inward:</label>
                  <input
                    type="number"
                    min="1"
                    value={purchaseForm.quantity}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, quantity: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-sky-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Unit Cost (₹):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={purchaseForm.unit_cost}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, unit_cost: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-sky-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="rounded-lg bg-slate-800/80 p-3 flex justify-between items-center text-xs">
                <span className="text-slate-400">Total Purchase Cost:</span>
                <span className="font-bold text-base text-sky-400">
                  ₹{((parseInt(purchaseForm.quantity) || 0) * (parseFloat(purchaseForm.unit_cost) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowPurchaseModal(false)}
                  className="rounded-lg px-4 py-2 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-sky-600 px-5 py-2 font-semibold text-white shadow-md hover:bg-sky-500 transition"
                >
                  Place Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Transactions;
