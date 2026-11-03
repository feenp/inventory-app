"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatBaht } from "@/lib/utils";

interface Product { id: string; name: string; standard_price: number | null; low_stock_threshold: number | null }
interface PaymentChannel { id: string; name: string }

export default function PricesPage() {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <div className="p-8 text-center text-gray-400">กำลังโหลด...</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">ราคาและสินค้า</h1>

      {/* Products table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-700">รายการสินค้า</h2>
          <span className="text-xs text-gray-400">{products.length} รายการ</span>
        </div>

        {/* Add product row */}
        <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 flex gap-2 items-end">
          <div className="flex-1">
            <div className="text-xs text-gray-500 mb-1">ชื่อสินค้าใหม่</div>
            <input value={newProductName} onChange={e => setNewProductName(e.target.value)}
              placeholder="เช่น นิล 25-30 (M)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
          </div>
          <div className="w-32">
            <div className="text-xs text-gray-500 mb-1">ราคามาตรฐาน</div>
            <input type="number" value={newProductPrice} onChange={e => setNewProductPrice(e.target.value)}
              placeholder="฿/กล่อง"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
          </div>
          <button onClick={addProduct} disabled={addingProduct}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
            + เพิ่ม
          </button>
          {addProductError && <span className="text-xs text-red-600">{addProductError}</span>}
        </div>

        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="text-left px-4 py-3 font-medium">สินค้า</th>
              <th className="text-right px-4 py-3 font-medium">ราคามาตรฐาน (฿/กล่อง)</th>
              <th className="text-right px-4 py-3 font-medium">เตือนเมื่อเหลือ ≤ (กล่อง)</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {products.map(p => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                {editingProduct === p.id ? (
                  <>
                    <td className="px-4 py-3">
                      <input type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)}
                        className="w-28 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    </td>
                    <td className="px-4 py-3">
                      <input type="number" value={editThreshold} onChange={e => setEditThreshold(e.target.value)}
                        className="w-24 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    </td>
                    <td className="px-4 py-3 flex gap-2">
                      <button onClick={() => saveProduct(p)} disabled={editProductSaving}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium">บันทึก</button>
                      <button onClick={() => setEditingProduct(null)} className="text-xs text-gray-400 hover:text-gray-600">ยกเลิก</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 text-right">{p.standard_price != null ? `฿${formatBaht(p.standard_price)}` : <span className="text-gray-400">-</span>}</td>
                    <td className="px-4 py-3 text-right">{p.low_stock_threshold ?? <span className="text-gray-400">-</span>}</td>
                    <td className="px-4 py-3 flex gap-3">
                      <button onClick={() => startEdit(p)} className="text-xs text-blue-500 hover:text-blue-700">แก้ไข</button>
                      <button onClick={() => deleteProduct(p)} className="text-xs text-red-400 hover:text-red-600">ลบ</button>
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
          <h2 className="font-semibold text-gray-700">ช่องทางการชำระเงิน</h2>
        </div>
        <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 flex gap-2">
          <input value={newChannelName} onChange={e => setNewChannelName(e.target.value)}
            placeholder="ชื่อช่องทางใหม่" onKeyDown={e => e.key === "Enter" && addChannel()}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
          <button onClick={addChannel} disabled={addingChannel}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
            + เพิ่ม
          </button>
          {addChannelError && <span className="text-xs text-red-600">{addChannelError}</span>}
        </div>
        <div className="divide-y divide-gray-100">
          {channels.map(c => (
            <div key={c.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
              <span className="text-sm">{c.name}</span>
              <button onClick={() => deleteChannel(c)} className="text-xs text-red-400 hover:text-red-600">ลบ</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
