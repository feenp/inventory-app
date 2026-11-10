"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTH } from "@/lib/utils";
import type { LotRemaining, ProductStock, StockAdjustment } from "@/lib/types";
import { ADJUSTMENT_REASONS } from "@/lib/types";
import { exportAsA4Png, todayString } from "@/lib/exportImage";
import ColumnOrderPicker, { type ColDef } from "@/components/ColumnOrderPicker";
import { fetchProductSortById, sortByProductId } from "@/lib/productOrder";

interface Product { id: string; name: string; standard_price: number | null }

const LOTS_COLS: ColDef[] = [
  { key: "lot_number",      label: "เลขล็อต" },
  { key: "product",         label: "สินค้า" },
  { key: "date_received",   label: "วันรับ" },
  { key: "boxes_received",  label: "รับเข้า" },
  { key: "boxes_sold",      label: "ขายออก" },
  { key: "adjustment_total",label: "ปรับสต็อค" },
  { key: "remaining_boxes", label: "คงเหลือ" },
  { key: "status",          label: "สถานะ" },
];
const LOTS_DEFAULT_ORDER = LOTS_COLS.map(c => c.key);
const LOTS_LS_KEY = "inv_lots_cols";

export default function StockClient({ products }: { products: Product[] }) {
  const supabase = createClient();
  const summaryRef = useRef<HTMLDivElement>(null);
  const [productStock, setProductStock] = useState<ProductStock[]>([]);
  const [lots, setLots] = useState<LotRemaining[]>([]);
  const [recentAdjustments, setRecentAdjustments] = useState<StockAdjustment[]>([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<"summary" | "lots" | "adjust">("summary");
  const [hideEmptyLots, setHideEmptyLots] = useState(true);

  // Column ordering (lots tab)
  const [lotsColOrder, setLotsColOrder] = useState<string[]>(LOTS_DEFAULT_ORDER);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOTS_LS_KEY);
      if (saved) {
        const parsed: string[] = JSON.parse(saved);
        const valid = Array.isArray(parsed) && parsed.every(k => LOTS_DEFAULT_ORDER.includes(k)) && parsed.length === LOTS_DEFAULT_ORDER.length;
        if (valid) setLotsColOrder(parsed);
      }
    } catch {}
  }, []);

  function saveLotsColOrder(order: string[]) {
    setLotsColOrder(order);
    try { localStorage.setItem(LOTS_LS_KEY, JSON.stringify(order)); } catch {}
  }

  function resetLotsColOrder() {
    setLotsColOrder(LOTS_DEFAULT_ORDER);
    try { localStorage.removeItem(LOTS_LS_KEY); } catch {}
  }

  // Lots search/filter
  const [lotSearch, setLotSearch] = useState("");
  const [lotProductFilter, setLotProductFilter] = useState("");

  // Adjust form
  const [adjLotNum, setAdjLotNum] = useState("");
  const [adjLotId, setAdjLotId] = useState("");
  const [adjLotInfo, setAdjLotInfo] = useState<{ product_name: string; remaining: number } | null>(null);
  const [adjLotError, setAdjLotError] = useState<string | null>(null);
  const [adjMode, setAdjMode] = useState<"add" | "subtract">("add");
  const [adjQty, setAdjQty] = useState("");
  const [adjReason, setAdjReason] = useState("correction");
  const [adjNote, setAdjNote] = useState("");
  const [adjSaving, setAdjSaving] = useState(false);
  const [adjError, setAdjError] = useState<string | null>(null);
  const [adjSuccess, setAdjSuccess] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: ps }, { data: ls }, { data: adj }, sortMap] = await Promise.all([
      supabase.from("product_stock").select("*").order("name"),
      supabase.from("lot_remaining").select("*, product:products(name, standard_price)").is("deleted_at", null).order("date_received", { ascending: false }),
      supabase.from("stock_adjustments").select("*, lot:lots(lot_number, product:products(name))").order("created_at", { ascending: false }).limit(30),
      fetchProductSortById(supabase),
    ]);
    const rawStock = (ps as unknown as ProductStock[]) ?? [];
    setProductStock(sortByProductId(rawStock, sortMap, p => p.product_id, p => p.name));
    setLots((ls as unknown as LotRemaining[]) ?? []);
    setRecentAdjustments((adj as unknown as StockAdjustment[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function deleteLot(lot: LotRemaining) {
    if (!confirm(`ซ่อนล็อต "${lot.lot_number}" ?\nประวัติการขายและการปรับสต็อคจะยังคงอยู่`)) return;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("lots").update({ deleted_at: new Date().toISOString() }).eq("id", lot.lot_id);
    await supabase.from("change_history").insert({
      user_id: user?.id, user_email: user?.email,
      action: "delete", entity_type: "lot",
      entity_id: lot.lot_id, entity_label: lot.lot_number,
      before_data: { lot_number: lot.lot_number, remaining_boxes: lot.remaining_boxes },
    });
    fetchData();
  }

  async function lookupAdjustLot() {
    if (!adjLotNum.trim()) return;
    const { data } = await supabase.from("lot_remaining").select("lot_id, remaining_boxes, product_id").eq("lot_number", adjLotNum.trim()).single();
    if (!data) { setAdjLotError("ไม่พบล็อตนี้"); setAdjLotId(""); setAdjLotInfo(null); return; }
    const { data: prod } = await supabase.from("products").select("name").eq("id", data.product_id).single();
    setAdjLotId(data.lot_id);
    setAdjLotInfo({ product_name: prod?.name ?? "ไม่ระบุ", remaining: data.remaining_boxes });
    setAdjLotError(null);
  }

  async function handleAdjust() {
    setAdjError(null); setAdjSuccess(null);
    if (!adjLotId) return setAdjError("กรุณาค้นหาล็อตก่อน");
    const amount = parseInt(adjQty);
    if (!adjQty || isNaN(amount) || amount <= 0) return setAdjError("กรุณากรอกจำนวนที่ต้องการ");
    const qty = adjMode === "subtract" ? -amount : amount;
    if (adjLotInfo && adjLotInfo.remaining + qty < 0) return setAdjError(`ไม่สามารถลดได้ เหลือเพียง ${adjLotInfo.remaining} กล่อง`);
    setAdjSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("stock_adjustments").insert({
      lot_id: adjLotId, quantity: qty, reason: adjReason,
      note: adjNote.trim() || null, created_by: user?.id,
    });
    if (error) { setAdjError(error.message); setAdjSaving(false); return; }
    await supabase.from("change_history").insert({
      user_id: user?.id, user_email: user?.email,
      action: "create", entity_type: "stock_adjustment",
      entity_id: adjLotId, entity_label: adjLotNum,
      after_data: { lot_number: adjLotNum, quantity: qty, reason: adjReason, note: adjNote },
    });
    setAdjSuccess(`ปรับสต็อค ${adjMode === "add" ? "+" : "-"}${amount} กล่อง สำเร็จ`);
    setAdjQty(""); setAdjNote(""); setAdjLotNum(""); setAdjLotId(""); setAdjLotInfo(null);
    setAdjSaving(false);
    fetchData();
  }

  const filteredLots = lots.filter(l => {
    if (hideEmptyLots && l.remaining_boxes <= 0) return false;
    if (lotSearch && !l.lot_number.includes(lotSearch)) return false;
    if (lotProductFilter) {
      const prod = (l as unknown as { product: { name: string } | null })?.product;
      if (!prod || !prod.name.toLowerCase().includes(lotProductFilter.toLowerCase())) return false;
    }
    return true;
  });

  if (loading) return <div className="p-8 text-center text-gray-400 font-medium">กำลังโหลด...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">สต็อคและล็อต</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {(["summary", "lots", "adjust"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm rounded-lg transition-colors font-semibold ${tab === t ? "bg-white shadow-sm text-blue-700" : "text-gray-500 hover:text-gray-700"}`}>
            {{ summary: "ภาพรวมสต็อค", lots: "รายการล็อต", adjust: "ปรับสต็อค" }[t]}
          </button>
        ))}
      </div>

      {/* Summary */}
      {tab === "summary" && (
        <div>
          <div className="flex justify-end mb-3" data-export-hidden="true">
            <button
              onClick={() => summaryRef.current && exportAsA4Png(summaryRef.current, `ภาพรวมสต็อค_${todayString()}.png`)}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors">
              ดาวน์โหลดรูปภาพ
            </button>
          </div>
          <div ref={summaryRef} className="bg-white p-4 rounded-xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 font-bold text-gray-900">สต็อคตามสินค้า</div>
                <table className="w-full">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-sm font-bold text-gray-700">สินค้า</th>
                      <th className="text-right px-4 py-2.5 text-sm font-bold text-gray-700">คงเหลือ (กล่อง)</th>
                      <th className="text-center px-4 py-2.5 text-sm font-bold text-gray-700">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productStock.map((p, i) => {
                      const isEmpty = p.total_remaining <= 0;
                      const isLow = !isEmpty && p.low_stock_threshold != null && p.total_remaining <= p.low_stock_threshold;
                      return (
                        <tr key={p.product_id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                          <td className="px-4 py-2 text-base font-semibold text-gray-900">{p.name}</td>
                          <td className={`px-4 py-2 text-right text-base font-bold ${isEmpty ? "text-red-600" : isLow ? "text-orange-600" : "text-gray-900"}`}>
                            {p.total_remaining.toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-center">
                            {isEmpty ? (
                              <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">หมดแล้ว</span>
                            ) : isLow ? (
                              <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-semibold">ใกล้หมด</span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="font-bold text-gray-900 mb-3">การปรับสต็อคล่าสุด</div>
                {recentAdjustments.length === 0 ? <p className="text-sm text-gray-400">ยังไม่มีการปรับ</p> : (
                  <div className="space-y-2">
                    {recentAdjustments.slice(0, 10).map(a => (
                      <div key={a.id} className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono text-gray-500 text-sm">{(a.lot as unknown as { lot_number: string })?.lot_number}</span>
                          <span className="ml-2 text-sm font-medium text-gray-700">{(a.lot as unknown as { product: { name: string } | null })?.product?.name}</span>
                          <div className="text-xs text-gray-400">{ADJUSTMENT_REASONS[a.reason] ?? a.reason}{a.note ? ` — ${a.note}` : ""}</div>
                        </div>
                        <span className={`font-bold shrink-0 text-sm ${a.quantity > 0 ? "text-green-600" : "text-red-600"}`}>
                          {a.quantity > 0 ? "+" : ""}{a.quantity}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lots */}
      {tab === "lots" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
            <input placeholder="ค้นหาเลขล็อต..." value={lotSearch} onChange={e => setLotSearch(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-40" />
            <input placeholder="ค้นหาสินค้า..." value={lotProductFilter} onChange={e => setLotProductFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-40" />
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer ml-auto">
              <input type="checkbox" checked={hideEmptyLots} onChange={e => setHideEmptyLots(e.target.checked)} className="w-4 h-4" />
              ซ่อนล็อตหมด
            </label>
            <span className="text-sm text-gray-500 font-medium">{filteredLots.length} ล็อต</span>
            <ColumnOrderPicker
              columns={LOTS_COLS}
              order={lotsColOrder}
              onChange={saveLotsColOrder}
              onReset={resetLotsColOrder}
            />
          </div>
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                {lotsColOrder.map(key => {
                  const col = LOTS_COLS.find(c => c.key === key)!;
                  const isRight = ["boxes_received","boxes_sold","adjustment_total","remaining_boxes"].includes(key);
                  const isCenter = key === "status";
                  return (
                    <th key={key} className={`px-4 py-2.5 text-sm font-bold text-gray-700 ${isRight ? "text-right" : isCenter ? "text-center" : "text-left"}`}>
                      {col.label}
                    </th>
                  );
                })}
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {filteredLots.map((l, i) => {
                const isEmpty = l.remaining_boxes <= 0;
                const prodName = (l as unknown as { product: { name: string } | null })?.product?.name;
                return (
                  <tr key={l.lot_id} className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50"} ${isEmpty ? "opacity-60" : ""}`}>
                    {lotsColOrder.map(key => {
                      if (key === "lot_number") return (
                        <td key={key} className="px-4 py-2 font-mono text-sm font-semibold text-gray-700">{l.lot_number}</td>
                      );
                      if (key === "product") return (
                        <td key={key} className="px-4 py-2 text-base font-semibold text-gray-900">{prodName}</td>
                      );
                      if (key === "date_received") return (
                        <td key={key} className="px-4 py-2 text-sm text-gray-600">{formatDateTH(l.date_received)}</td>
                      );
                      if (key === "boxes_received") return (
                        <td key={key} className="px-4 py-2 text-right text-base font-semibold text-gray-900">{l.boxes_received.toLocaleString()}</td>
                      );
                      if (key === "boxes_sold") return (
                        <td key={key} className="px-4 py-2 text-right text-base font-semibold text-red-600">{l.boxes_sold > 0 ? `-${l.boxes_sold}` : <span className="text-gray-400">0</span>}</td>
                      );
                      if (key === "adjustment_total") return (
                        <td key={key} className={`px-4 py-2 text-right text-base font-semibold ${l.adjustment_total > 0 ? "text-green-600" : l.adjustment_total < 0 ? "text-orange-600" : "text-gray-400"}`}>
                          {l.adjustment_total !== 0 ? (l.adjustment_total > 0 ? `+${l.adjustment_total}` : l.adjustment_total) : "0"}
                        </td>
                      );
                      if (key === "remaining_boxes") return (
                        <td key={key} className={`px-4 py-2 text-right text-base font-bold ${isEmpty ? "text-red-600" : "text-gray-900"}`}>{l.remaining_boxes.toLocaleString()}</td>
                      );
                      if (key === "status") return (
                        <td key={key} className="px-4 py-2 text-center">
                          {isEmpty ? <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">หมดแล้ว</span> : null}
                        </td>
                      );
                      return null;
                    })}
                    <td className="px-4 py-2">
                      <button onClick={() => deleteLot(l)} className="text-xs text-red-400 hover:text-red-600">ลบ</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Adjust stock */}
      {tab === "adjust" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-bold text-gray-900 mb-4">ปรับสต็อค</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">เลขล็อต</label>
                <div className="flex gap-2">
                  <input value={adjLotNum} onChange={e => { setAdjLotNum(e.target.value); setAdjLotId(""); setAdjLotInfo(null); setAdjLotError(null); }}
                    onBlur={lookupAdjustLot} placeholder="กรอกเลขล็อต"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  <button onClick={lookupAdjustLot} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-sm font-medium rounded-lg">ค้นหา</button>
                </div>
                {adjLotError && <p className="text-xs text-red-600 mt-1">{adjLotError}</p>}
                {adjLotInfo && (
                  <p className="text-sm text-green-700 mt-1 font-medium">{adjLotInfo.product_name} — เหลือ {adjLotInfo.remaining} กล่อง</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">ประเภทการปรับ</label>
                <div className="flex rounded-lg border border-gray-300 overflow-hidden w-fit">
                  <button onClick={() => setAdjMode("add")}
                    className={`px-5 py-2 text-sm font-semibold transition-colors ${adjMode === "add" ? "bg-green-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                    + เพิ่ม
                  </button>
                  <button onClick={() => setAdjMode("subtract")}
                    className={`px-5 py-2 text-sm font-semibold transition-colors border-l border-gray-300 ${adjMode === "subtract" ? "bg-red-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                    − ลด
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">จำนวนกล่อง</label>
                <input type="number" min={1} value={adjQty} onChange={e => setAdjQty(e.target.value)} placeholder="กรอกจำนวน"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                {adjQty && parseInt(adjQty) > 0 && adjLotInfo && (
                  <p className="text-sm text-gray-500 mt-1">สต็อคหลังปรับ: {adjLotInfo.remaining + (adjMode === "add" ? parseInt(adjQty) : -parseInt(adjQty))} กล่อง</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">เหตุผล</label>
                <select value={adjReason} onChange={e => setAdjReason(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                  {Object.entries(ADJUSTMENT_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">หมายเหตุ (ไม่บังคับ)</label>
                <textarea value={adjNote} onChange={e => setAdjNote(e.target.value)} rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              {adjError && <div className="text-sm text-red-600 font-medium">{adjError}</div>}
              {adjSuccess && <div className="text-sm text-green-600 font-medium">{adjSuccess}</div>}
              <button onClick={handleAdjust} disabled={adjSaving}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50">
                {adjSaving ? "กำลังบันทึก..." : "บันทึกการปรับสต็อค"}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 font-bold text-gray-900">ประวัติการปรับสต็อค</div>
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-4 py-2.5 text-sm font-bold text-gray-700">ล็อต / สินค้า</th>
                  <th className="text-left px-4 py-2.5 text-sm font-bold text-gray-700">เหตุผล</th>
                  <th className="text-left px-4 py-2.5 text-sm font-bold text-gray-700">หมายเหตุ</th>
                  <th className="text-right px-4 py-2.5 text-sm font-bold text-gray-700">จำนวน</th>
                </tr>
              </thead>
              <tbody>
                {recentAdjustments.map((a, i) => (
                  <tr key={a.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-2">
                      <div className="font-mono text-xs text-gray-500">{(a.lot as unknown as { lot_number: string })?.lot_number}</div>
                      <div className="text-sm font-semibold text-gray-800">{(a.lot as unknown as { product: { name: string } | null })?.product?.name}</div>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">{ADJUSTMENT_REASONS[a.reason] ?? a.reason}</td>
                    <td className="px-4 py-2 text-sm text-gray-500 max-w-[120px] truncate">{a.note ?? "—"}</td>
                    <td className={`px-4 py-2 text-right text-base font-bold ${a.quantity > 0 ? "text-green-600" : "text-red-600"}`}>
                      {a.quantity > 0 ? "+" : ""}{a.quantity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
