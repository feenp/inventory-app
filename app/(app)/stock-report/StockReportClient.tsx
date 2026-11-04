"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTH } from "@/lib/utils";
import { exportAsA4Png } from "@/lib/exportImage";

interface ProductRow {
  product_id: string;
  name: string;
  total_remaining: number;
  low_stock_threshold: number | null;
  receivedToday: number;
  soldToday: number;
}

// Thailand is UTC+7. Use Bangkok date so "today" matches what users see on-screen.
function getBangkokToday(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Returns the UTC ISO timestamp for the start of the day AFTER dateStr in Bangkok time.
// Used to filter adjustments: include everything created before midnight Bangkok on the next day.
function nextDayBangkokISO(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00+07:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

export default function StockReportClient() {
  const supabase = createClient();
  const contentRef = useRef<HTMLDivElement>(null);

  const bangkokToday = getBangkokToday();
  const [selectedDate, setSelectedDate] = useState(bangkokToday);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const isToday = date === getBangkokToday();

      if (isToday) {
        // For today use product_stock view — it is the authoritative live calculation
        // (it incorporates lot_remaining which already handles adjustments and soft deletes).
        const [{ data: productStock }, { data: todayLots }, { data: todayOrders }] = await Promise.all([
          supabase.from("product_stock").select("product_id, name, low_stock_threshold, total_remaining").order("name"),
          supabase.from("lots")
            .select("product_id, boxes_received")
            .eq("date_received", date)
            .is("deleted_at", null),
          supabase.from("orders")
            // join order_lines → lots to get product_id directly, avoiding an extra round-trip
            .select("order_lines(quantity, lot:lots(product_id))")
            .eq("order_date", date)
            .is("deleted_at", null),
        ]);

        const receivedToday: Record<string, number> = {};
        for (const lot of (todayLots ?? []) as { product_id: string; boxes_received: number }[]) {
          receivedToday[lot.product_id] = (receivedToday[lot.product_id] ?? 0) + lot.boxes_received;
        }

        const soldToday: Record<string, number> = {};
        for (const order of (todayOrders ?? []) as unknown as { order_lines: { quantity: number; lot: { product_id: string } | null }[] }[]) {
          for (const line of order.order_lines) {
            const pid = line.lot?.product_id;
            if (!pid) continue;
            soldToday[pid] = (soldToday[pid] ?? 0) + line.quantity;
          }
        }

        setRows(
          ((productStock ?? []) as { product_id: string; name: string; low_stock_threshold: number | null; total_remaining: number }[])
            .map(p => ({
              product_id: p.product_id,
              name: p.name,
              total_remaining: p.total_remaining,
              low_stock_threshold: p.low_stock_threshold,
              receivedToday: receivedToday[p.product_id] ?? 0,
              soldToday: soldToday[p.product_id] ?? 0,
            }))
        );
      } else {
        // Historical: reconstruct stock as it stood at the END of selectedDate.
        // KEY FIX: lots table PK is `id` — the `lot_id` alias only exists on the lot_remaining VIEW.
        // We also include stock_adjustments (which the product_stock view counts via lot_remaining).
        const [{ data: products }, { data: lots }, { data: orders }, { data: adjustments }] = await Promise.all([
          supabase.from("products").select("id, name, low_stock_threshold").is("deleted_at", null).order("name"),
          supabase.from("lots")
            .select("id, product_id, boxes_received, date_received")
            .is("deleted_at", null)
            .lte("date_received", date),
          supabase.from("orders")
            .select("order_date, order_lines(lot_id, quantity)")
            .is("deleted_at", null)
            .lte("order_date", date),
          // Include adjustments created up to end-of-day in Bangkok time
          supabase.from("stock_adjustments")
            .select("lot_id, quantity")
            .lt("created_at", nextDayBangkokISO(date)),
        ]);

        // Build lots.id → product_id map (lots.id is the PK, referenced by order_lines.lot_id)
        const lotProductMap: Record<string, string> = {};
        const receivedUpTo: Record<string, number> = {};
        const receivedOnDate: Record<string, number> = {};
        for (const lot of (lots ?? []) as { id: string; product_id: string; boxes_received: number; date_received: string }[]) {
          lotProductMap[lot.id] = lot.product_id;
          receivedUpTo[lot.product_id] = (receivedUpTo[lot.product_id] ?? 0) + lot.boxes_received;
          if (lot.date_received === date) {
            receivedOnDate[lot.product_id] = (receivedOnDate[lot.product_id] ?? 0) + lot.boxes_received;
          }
        }

        const soldUpTo: Record<string, number> = {};
        const soldOnDate: Record<string, number> = {};
        for (const order of (orders ?? []) as { order_date: string; order_lines: { lot_id: string; quantity: number }[] }[]) {
          for (const line of order.order_lines) {
            // line.lot_id references lots.id — now correctly maps using lots.id as key
            const pid = lotProductMap[line.lot_id];
            if (!pid) continue;
            soldUpTo[pid] = (soldUpTo[pid] ?? 0) + line.quantity;
            if (order.order_date === date) {
              soldOnDate[pid] = (soldOnDate[pid] ?? 0) + line.quantity;
            }
          }
        }

        // Stock adjustments: positive = stock added, negative = stock reduced
        const adjByProduct: Record<string, number> = {};
        for (const adj of (adjustments ?? []) as { lot_id: string; quantity: number }[]) {
          const pid = lotProductMap[adj.lot_id];
          if (!pid) continue;
          adjByProduct[pid] = (adjByProduct[pid] ?? 0) + adj.quantity;
        }

        setRows(
          ((products ?? []) as { id: string; name: string; low_stock_threshold: number | null }[])
            .map(p => ({
              product_id: p.id,
              name: p.name,
              total_remaining: (receivedUpTo[p.id] ?? 0) - (soldUpTo[p.id] ?? 0) + (adjByProduct[p.id] ?? 0),
              low_stock_threshold: p.low_stock_threshold,
              receivedToday: receivedOnDate[p.id] ?? 0,
              soldToday: soldOnDate[p.id] ?? 0,
            }))
        );
      }
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { fetchData(selectedDate); }, [fetchData, selectedDate]);

  async function handleExport() {
    if (!contentRef.current) return;
    await exportAsA4Png(contentRef.current, `รายงานสต็อค_${selectedDate}.png`);
  }

  const totalRemaining = rows.reduce((s, p) => s + p.total_remaining, 0);
  const totalReceived = rows.reduce((s, p) => s + p.receivedToday, 0);
  const totalSold = rows.reduce((s, p) => s + p.soldToday, 0);
  const isToday = selectedDate === getBangkokToday();
  const maxDate = getBangkokToday();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          รายงานสต็อค{isToday ? "วันนี้" : ""}
        </h1>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            max={maxDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={handleExport}
            data-export-hidden="true"
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            ดาวน์โหลดรูปภาพ
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-gray-400">กำลังโหลด...</div>
      ) : (
        <div ref={contentRef} className="bg-white p-6 rounded-xl">
          {/* Header for export */}
          <div className="mb-5">
            <div className="text-xl font-bold text-gray-800">รายงานสต็อค{isToday ? "วันนี้" : ""}</div>
            <div className="text-sm text-gray-500">{formatDateTH(selectedDate)}</div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-400 mb-1">รับเข้า{isToday ? "วันนี้" : "วันนั้น"}</div>
              <div className="text-2xl font-bold text-green-600">{totalReceived.toLocaleString()}</div>
              <div className="text-xs text-gray-400">กล่อง</div>
            </div>
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-400 mb-1">ขายออก{isToday ? "วันนี้" : "วันนั้น"}</div>
              <div className="text-2xl font-bold text-red-500">{totalSold.toLocaleString()}</div>
              <div className="text-xs text-gray-400">กล่อง</div>
            </div>
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-400 mb-1">จำนวนสินค้า</div>
              <div className="text-2xl font-bold text-gray-700">{rows.length}</div>
              <div className="text-xs text-gray-400">รายการ</div>
            </div>
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-400 mb-1">สินค้าหมด</div>
              <div className="text-2xl font-bold text-orange-500">{rows.filter(p => p.total_remaining <= 0).length}</div>
              <div className="text-xs text-gray-400">รายการ</div>
            </div>
          </div>

          {/* Detail table */}
          <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">สินค้า</th>
                <th className="text-right px-4 py-3 font-medium">
                  {isToday ? "สต็อคคงเหลือ" : "สต็อคคงเหลือ ณ วันนั้น"}
                </th>
                <th className="text-right px-4 py-3 font-medium">รับเข้า{isToday ? "วันนี้" : "วันนั้น"}</th>
                <th className="text-right px-4 py-3 font-medium">ขายออก{isToday ? "วันนี้" : "วันนั้น"}</th>
                <th className="text-center px-4 py-3 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(p => {
                const isEmpty = p.total_remaining <= 0;
                const isLow = !isEmpty && p.low_stock_threshold != null && p.total_remaining <= p.low_stock_threshold;
                return (
                  <tr key={p.product_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-right font-semibold">{p.total_remaining.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-green-600">{p.receivedToday > 0 ? `+${p.receivedToday}` : "-"}</td>
                    <td className="px-4 py-3 text-right text-red-500">{p.soldToday > 0 ? p.soldToday.toLocaleString() : "-"}</td>
                    <td className="px-4 py-3 text-center">
                      {isEmpty ? (
                        <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">หมดแล้ว</span>
                      ) : isLow ? (
                        <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">ใกล้หมด</span>
                      ) : (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">ปกติ</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50 font-semibold">
              <tr>
                <td className="px-4 py-3 text-gray-600">รวม</td>
                <td className="px-4 py-3 text-right">{totalRemaining.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-green-600">{totalReceived > 0 ? `+${totalReceived}` : "-"}</td>
                <td className="px-4 py-3 text-right text-red-500">{totalSold > 0 ? totalSold.toLocaleString() : "-"}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
