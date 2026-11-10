"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { validateLotNumber } from "@/lib/utils";

interface Product { id: string; name: string; standard_price: number | null }
interface LotItem { lot_number: string }

export default function ReceivePage() {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [lots, setLots] = useState<LotItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [rcvProduct, setRcvProduct] = useState("");
  const [rcvLotNum, setRcvLotNum] = useState("");
  const [rcvDate, setRcvDate] = useState(new Date().toISOString().slice(0, 10));
  const [rcvBoxes, setRcvBoxes] = useState("");
  const [rcvError, setRcvError] = useState<string | null>(null);
  const [rcvSaving, setRcvSaving] = useState(false);
  const [rcvSuccess, setRcvSuccess] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: prods }, { data: ls }] = await Promise.all([
      supabase.from("products").select("id, name, standard_price").is("deleted_at", null).order("name"),
      supabase.from("lots").select("lot_number").is("deleted_at", null),
    ]);
    setProducts((prods ?? []) as Product[]);
    setLots((ls ?? []) as LotItem[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-suggest lot number
  useEffect(() => {
    if (!rcvProduct || !rcvDate) return;
    const d = new Date(rcvDate);
    const beYear = d.getFullYear() + 543;
    const yy = String(beYear).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const prefix = `${yy}${mm}${dd}`;
    const dayLots = lots.filter(l => l.lot_number.startsWith(prefix));
    const maxPallet = dayLots.reduce((m, l) => {
      const pallet = parseInt(l.lot_number.slice(prefix.length));
      return isNaN(pallet) ? m : Math.max(m, pallet);
    }, 0);
    setRcvLotNum(`${prefix}${String(maxPallet + 1).padStart(2, "0")}`);
  }, [rcvProduct, rcvDate, lots]);

  async function handleReceiveLot() {
    setRcvError(null);
    setRcvSuccess(null);
    if (!rcvProduct) return setRcvError("กรุณาเลือกสินค้า");
    if (!rcvBoxes || parseInt(rcvBoxes) < 1) return setRcvError("กรุณากรอกจำนวนกล่อง");
    if (!rcvLotNum.trim()) return setRcvError("กรุณากรอกเลขล็อต");

    const { data: existing } = await supabase.from("lots").select("id").eq("lot_number", rcvLotNum.trim()).single();
    if (existing) return setRcvError("เลขล็อตนี้มีในระบบแล้ว");

    setRcvSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: lot, error } = await supabase.from("lots").insert({
      lot_number: rcvLotNum.trim(),
      product_id: rcvProduct,
      date_received: rcvDate,
      boxes_received: parseInt(rcvBoxes),
    }).select("id").single();

    if (error) { setRcvError(error.message); setRcvSaving(false); return; }

    await supabase.from("change_history").insert({
      user_id: user?.id, user_email: user?.email,
      action: "create", entity_type: "lot",
      entity_id: lot.id, entity_label: rcvLotNum.trim(),
      after_data: { lot_number: rcvLotNum.trim(), product_id: rcvProduct, date_received: rcvDate, boxes_received: parseInt(rcvBoxes) },
    });

    setRcvSuccess(`บันทึกล็อต ${rcvLotNum} สำเร็จ`);
    setRcvLotNum(""); setRcvBoxes(""); setRcvSaving(false);
    fetchData();
  }

  if (loading) return <div className="p-8 text-center text-gray-400">กำลังโหลด...</div>;

  return (
    <div className="p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">รับสินค้าเข้าสต็อค</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">สินค้า</label>
            <select value={rcvProduct} onChange={e => setRcvProduct(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
              <option value="">-- เลือกสินค้า --</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">วันที่รับสินค้า</label>
            <input type="date" value={rcvDate} onChange={e => setRcvDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">เลขล็อต</label>
            <input value={rcvLotNum} onChange={e => setRcvLotNum(e.target.value)}
              placeholder="เช่น 69110401"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <p className="text-xs text-gray-400 mt-1">ระบบเติมเลขล็อตให้อัตโนมัติ สามารถแก้ไขได้</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนกล่องที่รับ</label>
            <input type="number" min={1} value={rcvBoxes} onChange={e => setRcvBoxes(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          {rcvError && <div className="text-sm text-red-600">{rcvError}</div>}
          {rcvSuccess && <div className="text-sm text-green-600">{rcvSuccess}</div>}
          <button onClick={handleReceiveLot} disabled={rcvSaving}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50">
            {rcvSaving ? "กำลังบันทึก..." : "บันทึกการรับสินค้า"}
          </button>
        </div>
      </div>
    </div>
  );
}
