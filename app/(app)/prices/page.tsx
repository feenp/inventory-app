"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatBaht } from "@/lib/utils";
import ColumnOrderPicker, { type ColDef } from "@/components/ColumnOrderPicker";

interface Product { id: string; name: string; standard_price: number | null; low_stock_threshold: number | null }
interface PaymentChannel { id: string; name: string }

const PRODUCTS_COLS: ColDef[] = [
  { key: "name",                label: "สินค้า" },
  { key: "standard_price",      label: "ราคามาตรฐาน (฿/กล่อง)" },
  { key: "low_stock_threshold", label: "เตือนเมื่อเหลือ ≤" },
];
const PRODUCTS_DEFAULT_ORDER = PRODUCTS_COLS.map(c => c.key);
const PRODUCTS_LS_KEY = "inv_products_cols";

export default function PricesPage() {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [loading, setLoading] = useState(true);

  // Column ordering
  const [prodsColOrder, setProdsColOrder] = useState<string[]>(PRODUCTS_DEFAULT_ORDER);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PRODUCTS_LS_KEY);
      if (saved) {
        const parsed: string[] = JSON.parse(saved);
        const valid = Array.isArray(parsed) && parsed.every(k => PRODUCTS_DEFAULT_ORDER.includes(k)) && parsed.length === PRODUCTS_DEFAULT_ORDER.length;
        if (valid) setProdsColOrder(parsed);
      }
    } catch {}
  }, []);

  function saveProdsColOrder(order: string[]) {
    setProdsColOrder(order);
    try { localStorage.setItem(PRODUCTS_LS_KEY, JSON.stringify(order)); } catch {}
  }

  function resetProdsColOrder() {
    setProdsColOrder(PRODUCTS_DEFAULT_ORDER);
    try { localStorage.removeItem(PRODUCTS_LS_KEY); } catch {}
  }

  // Add product
  const [newProductName, setNewProductName] = useState("");
  const [newProductPrice, setNewProductPrice] = useState("");
  const [addProductError, setAddProductError] = useState<string | null>(null);
  const [addingProduct, setAddingProduct] = useState(false);

  // Inline edits
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editThreshold, setEditThreshold] = useState("");
  const [editProductSaving, setEditProductSaving] = useState(false);

  // Payment channels
  const [newChannelName, setNewChannelName] = useState("");
  const [addChannelError, setAddChannelError] = useState<string | null>(null);
  const [addingChannel, setAddingChannel] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: prods }, { data: chans }] = await Promise.all([
      supabase.from("products").select("id, name, standard_price, low_stock_threshold").is("deleted_at", null).order("name"),
      supabase.from("payment_channels").select("id, name").is("deleted_at", null).order("name"),
    ]);
    setProducts((prods ?? []) as Product[]);
    setChannels((chans ?? []) as PaymentChannel[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function addProduct() {
    setAddProductError(null);
    if (!newProductName.trim()) return setAddProductError("กรุณากรอกชื่อสินค้า");
    setAddingProduct(true);
    const { data: { user } } = await supabase.auth.getUser();
    const price = newProductPrice ? parseFloat(newProductPrice) : null;
    const { data, error } = await supabase.from("products").insert({ name: newProductName.trim(), standard_price: price }).select("id").single();
    if (error) { setAddProductError(error.message); setAddingProduct(false); return; }
    await supabase.from("change_history").insert({
      user_id: user?.id, user_email: user?.email,
      action: "create", entity_type: "product",
      entity_id: data.id, entity_label: newProductName.trim(),
      after_data: { name: newProductName.trim(), standard_price: price },
    });
    setNewProductName(""); setNewProductPrice(""); setAddingProduct(false); fetchData();
  }

  function startEdit(p: Product) {
    setEditingProduct(p.id);
    setEditPrice(p.standard_price != null ? String(p.standard_price) : "");
    setEditThreshold(p.low_stock_threshold != null ? String(p.low_stock_threshold) : "");
  }

  async function deleteProduct(p: Product) {
    if (!confirm(`ซ่อนสินค้า "${p.name}" ?\nข้อมูลล็อตและออเดอร์ที่เกี่ยวข้องจะยังคงอยู่`)) return;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("products").update({ deleted_at: new Date().toISOString() }).eq("id", p.id);
    await supabase.from("change_history").insert({
      user_id: user?.id, user_email: user?.email,
      action: "delete", entity_type: "product",
      entity_id: p.id, entity_label: p.name,
      before_data: { name: p.name, standard_price: p.standard_price },
    });
    fetchData();
  }

  async function saveProduct(p: Product) {
    setEditProductSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const price = editPrice ? parseFloat(editPrice) : null;
    const threshold = editThreshold ? parseInt(editThreshold) : null;
    await supabase.from("products").update({ standard_price: price, low_stock_threshold: threshold }).eq("id", p.id);
    await supabase.from("change_history").insert({
      user_id: user?.id, user_email: user?.email,
      action: "edit", entity_type: "product",
      entity_id: p.id, entity_label: p.name,
      before_data: { standard_price: p.standard_price, low_stock_threshold: p.low_stock_threshold },
      after_data: { standard_price: price, low_stock_threshold: threshold },
    });
    setEditingProduct(null); setEditProductSaving(false); fetchData();
  }

  async function addChannel() {
    setAddChannelError(null);
    if (!newChannelName.trim()) return setAddChannelError("กรุณากรอกชื่อช่องทาง");
    setAddingChannel(true);
    const { error } = await supabase.from("payment_channels").insert({ name: newChannelName.trim() });
    if (error) { setAddChannelError(error.message); setAddingChannel(false); return; }
    setNewChannelName(""); setAddingChannel(false); fetchData();
  }

  async function deleteChannel(c: PaymentChannel) {
    if (!confirm(`ลบช่องทาง "${c.name}" ?`)) return;
    await supabase.from("payment_channels").update({ deleted_at: new Date().toISOString() }).eq("id", c.id);
    fetchData();
  }

  if (loading) return <div className="p-8 text-center text-gray-400 font-medium">กำลังโหลด...</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">ราคาและสินค้า</h1>

      {/* Products table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">รายการสินค้า</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 font-medium">{products.length} รายการ</span>
            <ColumnOrderPicker
              columns={PRODUCTS_COLS}
              order={prodsColOrder}
              onChange={saveProdsColOrder}
              onReset={resetProdsColOrder}
            />
          </div>
        </div>

        {/* Add product row */}
        <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 flex gap-2 items-end">
          <div className="flex-1">
            <div className="text-xs font-semibold text-gray-600 mb-1">ชื่อสินค้าใหม่</div>
            <input value={newProductName} onChange={e => setNewProductName(e.target.value)}
              placeholder="เช่น นิล 25-30 (M)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
          </div>
          <div className="w-32">
            <div className="text-xs font-semibold text-gray-600 mb-1">ราคามาตรฐาน</div>
            <input type="number" value={newProductPrice} onChange={e => setNewProductPrice(e.target.value)}
              placeholder="฿/กล่อง"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
          </div>
          <button onClick={addProduct} disabled={addingProduct}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
            + เพิ่ม
          </button>
          {addProductError && <span className="text-xs text-red-600">{addProductError}</span>}
        </div>

        <table className="w-full">
          <thead className="bg-gray-100">
            <tr>
              {prodsColOrder.map(key => {
                const col = PRODUCTS_COLS.find(c => c.key === key)!;
                const isRight = key !== "name";
                return (
                  <th key={key} className={`px-4 py-2.5 text-sm font-bold text-gray-700 ${isRight ? "text-right" : "text-left"}`}>
                    {col.label}
                  </th>
                );
              })}
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p, i) => (
              <tr key={p.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                {editingProduct === p.id ? (
                  <>
                    {prodsColOrder.map(key => {
                      if (key === "name") return (
                        <td key={key} className="px-4 py-3 text-base font-semibold text-gray-900">{p.name}</td>
                      );
                      if (key === "standard_price") return (
                        <td key={key} className="px-4 py-3 text-right">
                          <input type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)}
                            className="w-28 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400" />
                        </td>
                      );
                      if (key === "low_stock_threshold") return (
                        <td key={key} className="px-4 py-3 text-right">
                          <input type="number" value={editThreshold} onChange={e => setEditThreshold(e.target.value)}
                            className="w-24 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400" />
                        </td>
                      );
                      return null;
                    })}
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => saveProduct(p)} disabled={editProductSaving}
                          className="text-sm text-blue-600 hover:text-blue-800 font-semibold">บันทึก</button>
                        <button onClick={() => setEditingProduct(null)} className="text-sm text-gray-400 hover:text-gray-600">ยกเลิก</button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    {prodsColOrder.map(key => {
                      if (key === "name") return (
                        <td key={key} className="px-4 py-3 text-base font-semibold text-gray-900">{p.name}</td>
                      );
                      if (key === "standard_price") return (
                        <td key={key} className="px-4 py-3 text-right text-base font-semibold text-gray-900">
                          {p.standard_price != null ? `฿${formatBaht(p.standard_price)}` : <span className="text-gray-400">—</span>}
                        </td>
                      );
                      if (key === "low_stock_threshold") return (
                        <td key={key} className="px-4 py-3 text-right text-base font-semibold text-gray-900">
                          {p.low_stock_threshold ?? <span className="text-gray-400">—</span>}
                        </td>
                      );
                      return null;
                    })}
                    <td className="px-4 py-3">
                      <div className="flex gap-3">
                        <button onClick={() => startEdit(p)} className="text-sm text-blue-500 hover:text-blue-700 font-medium">แก้ไข</button>
                        <button onClick={() => deleteProduct(p)} className="text-sm text-red-400 hover:text-red-600">ลบ</button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Payment channels */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">ช่องทางการชำระเงิน</h2>
        </div>
        <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 flex gap-2">
          <input value={newChannelName} onChange={e => setNewChannelName(e.target.value)}
            placeholder="ชื่อช่องทางใหม่" onKeyDown={e => e.key === "Enter" && addChannel()}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
          <button onClick={addChannel} disabled={addingChannel}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
            + เพิ่ม
          </button>
          {addChannelError && <span className="text-xs text-red-600">{addChannelError}</span>}
        </div>
        <div className="divide-y divide-gray-100">
          {channels.map((c, i) => (
            <div key={c.id} className={`flex items-center justify-between px-5 py-3 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
              <span className="text-base font-medium text-gray-900">{c.name}</span>
              <button onClick={() => deleteChannel(c)} className="text-sm text-red-400 hover:text-red-600">ลบ</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
