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
  opening: number;
  receivedToday: number;
  soldToday: number;
}

function getBangkokToday(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function getBangkokMin7Days(): string {
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000);
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
}

function nextDayBangkokISO(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00+07:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function prevDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00+07:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
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
        // TODAY: use product_stock view for authoritative current remaining.
        // Opening = total_remaining - receivedToday + soldToday
        // This definition makes Opening + Received - Sold = Remaining hold exactly.
        const [{ data: productStock }, { data: todayLots }, { data: todayOrders }] = await Promise.all([
          supabase.from("product_stock").select("product_id, name, low_stock_threshold, total_remaining").order("name"),
          supabase.from("lots")
            .select("product_id, boxes_received")
            .eq("date_received", date)
            .is("deleted_at", null),
          supabase.from("orders")
            .select("order_lines(quantity, lot:lots(product_id))")
            .eq("order_date", date)
            .is("deleted_at", null),
        ]);

        const receivedMap: Record<string, number> = {};
        for (const lot of (todayLots ?? []) as { product_id: string; boxes_received: number }[]) {
          receivedMap[lot.product_id] = (receivedMap[lot.product_id] ?? 0) + lot.boxes_received;
        }

        const soldMap: Record<string, number> = {};
        for (const order of (todayOrders ?? []) as unknown as { order_lines: { quantity: number; lot: { product_id: string } | null }[] }[]) {
          for (const line of order.order_lines) {
            const pid = line.lot?.product_id;
            if (!pid) continue;
            soldMap[pid] = (soldMap[pid] ?? 0) + line.quantity;
          }
        }

        setRows(
          ((productStock ?? []) as { product_id: string; name: string; low_stock_threshold: number | null; total_remaining: number }[])
            .map(p => {
              const r = receivedMap[p.product_id] ?? 0;
              const s = soldMap[p.product_id] ?? 0;
              return {
                product_id: p.product_id,
                name: p.name,
                total_remaining: p.total_remaining,
                low_stock_threshold: p.low_stock_threshold,
                opening: p.total_remaining - r + s,
                receivedToday: r,
                soldToday: s,
              };
            })
        );
      } else {
        // HISTORICAL: manual calculation up to end of selectedDate.
        // Opening = stock at end of day before selectedDate.
        const yesterday = prevDay(date);

        const [{ data: products }, { data: lots }, { data: orders }, { data: adjustments }] = await Promise.all([
          supabase.from("products").select("id, name, low_stock_threshold").is("deleted_at", null).order("name"),
          supabase.from("lots").select("id, product_id, boxes_received, date_received").is("deleted_at", null).lte("date_received", date),
          supabase.from("orders").select("order_date, order_lines(lot_id, quantity)").is("deleted_at", null).lte("order_date", date),
          supabase.from("stock_adjustments").select("lot_id, quantity").lt("created_at", nextDayBangkokISO(date)),
        ]);

        // Yesterday's lots and orders for opening calculation
        const [{ data: prevLots }, { data: prevOrders }, { data: prevAdj }] = await Promise.all([
          supabase.from("lots").select("id, product_id, boxes_received").is("deleted_at", null).lte("date_received", yesterday),
          supabase.from("orders").select("order_lines(lot_id, quantity)").is("deleted_at", null).lte("order_date", yesterday),
          supabase.from("stock_adjustments").select("lot_id, quantity").lt("created_at", nextDayBangkokISO(yesterday)),
        ]);

        // Build lots.id → product_id map (lots PK is 'id')
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
            const pid = lotProductMap[line.lot_id];
            if (!pid) continue;
            soldUpTo[pid] = (soldUpTo[pid] ?? 0) + line.quantity;
            if (order.order_date === date) {
              soldOnDate[pid] = (soldOnDate[pid] ?? 0) + line.quantity;
            }
          }
        }

        const adjByProduct: Record<string, number> = {};
        for (const adj of (adjustments ?? []) as { lot_id: string; quantity: number }[]) {
          const pid = lotProductMap[adj.lot_id];
          if (!pid) continue;
          adjByProduct[pid] = (adjByProduct[pid] ?? 0) + adj.quantity;
        }

        // Opening stock (end of yesterday)
        const prevLotMap: Record<string, string> = {};
        const prevReceived: Record<string, number> = {};
        for (const lot of (prevLots ?? []) as { id: string; product_id: string; boxes_received: number }[]) {
          prevLotMap[lot.id] = lot.product_id;
          prevReceived[lot.product_id] = (prevReceived[lot.product_id] ?? 0) + lot.boxes_received;
        }
        const prevSold: Record<string, number> = {};
        for (const order of (prevOrders ?? []) as { order_lines: { lot_id: string; quantity: number }[] }[]) {
          for (const line of order.order_lines) {
            const pid = prevLotMap[line.lot_id];
            if (!pid) continue;
            prevSold[pid] = (prevSold[pid] ?? 0) + line.quantity;
          }
        }
        const prevAdjMap: Record<string, number> = {};
        for (const adj of (prevAdj ?? []) as { lot_id: string; quantity: number }[]) {
          const pid = prevLotMap[adj.lot_id] ?? lotProductMap[adj.lot_id];
          if (!pid) continue;
          prevAdjMap[pid] = (prevAdjMap[pid] ?? 0) + adj.quantity;
        }

        setRows(
          ((products ?? []) as { id: string; name: string; low_stock_threshold: number | null }[])
            .map(p => {
              const remaining = (receivedUpTo[p.id] ?? 0) - (soldUpTo[p.id] ?? 0) + (adjByProduct[p.id] ?? 0);
              const opening = (prevReceived[p.id] ?? 0) - (prevSold[p.id] ?? 0) + (prevAdjMap[p.id] ?? 0);
              return {
                product_id: p.id,
                name: p.name,
                total_remaining: remaining,
                low_stock_threshold: p.low_stock_threshold,
                opening,
                receivedToday: receivedOnDate[p.id] ?? 0,
                soldToday: soldOnDate[p.id] ?? 0,
              };
            })
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
  const totalOpening = rows.reduce((s, p) => s + p.opening, 0);
  const isToday = selectedDate === getBangkokToday();
  const maxDate = getBangkokToday();
  const minDate = getBangkokMin7Days();

  return (
    <div className="p-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">
          รายงานสต็อค{isToday ? "วันนี้" : ""}
        </h1>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            min={minDate}
            max={maxDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={handleExport}
            data-export-hidden="true"
            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            ดาวน์โหลด
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-10 text-center text-gray-400 font-medium">กำลังโหลด...</div>
      ) : (
        <div ref={contentRef} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Export header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <div className="text-base font-bold text-gray-900">รายงานสต็อค{isToday ? "วันนี้" : ""}</div>
              <div className="text-sm text-gray-500">{formatDateTH(selectedDate)}</div>
            </div>
            {/* Quick stats */}
            <div className="flex gap-4 text-sm">
              <div className="text-center">
                <div className="text-xs text-gray-400 font-medium">รับเข้า</div>
                <div className="font-bold text-green-600 text-base">+{totalReceived.toLocaleString()}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-400 font-medium">ขายออก</div>
                <div className="font-bold text-red-500 text-base">{totalSold.toLocaleString()}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-400 font-medium">คงเหลือรวม</div>
                <div className="font-bold text-gray-900 text-base">{totalRemaining.toLocaleString()}</div>
              </div>
            </div>
          </div>

          {/* Table — 5 columns: Product | Opening | Received | Sold | Remaining */}
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left px-4 py-2.5 text-sm font-bold text-gray-700">สินค้า</th>
                <th className="text-right px-3 py-2.5 text-sm font-bold text-gray-700">สต็อคตั้งต้น</th>
                <th className="text-right px-3 py-2.5 text-sm font-bold text-green-700">รับเข้า{isToday ? "วันนี้" : "วันนั้น"}</th>
                <th className="text-right px-3 py-2.5 text-sm font-bold text-red-600">ขายออก{isToday ? "วันนี้" : "วันนั้น"}</th>
                <th className="text-right px-4 py-2.5 text-sm font-bold text-gray-700">คงเหลือ</th>
                <th className="text-center px-3 py-2.5 text-sm font-bold text-gray-700">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => {
                const isEmpty = p.total_remaining <= 0;
                const isLow = !isEmpty && p.low_stock_threshold != null && p.total_remaining <= p.low_stock_threshold;
                return (
                  <tr key={p.product_id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-2 text-base font-semibold text-gray-900">{p.name}</td>
                    <td className="px-3 py-2 text-right text-base font-medium text-gray-600">
                      {p.opening.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-base font-semibold text-green-700">
                      {p.receivedToday > 0 ? `+${p.receivedToday.toLocaleString()}` : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-base font-semibold text-red-600">
                      {p.soldToday > 0 ? p.soldToday.toLocaleString() : <span className="text-gray-300">—</span>}
                    </td>
                    <td className={`px-4 py-2 text-right text-base font-bold ${isEmpty ? "text-red-600" : isLow ? "text-orange-600" : "text-gray-900"}`}>
                      {p.total_remaining.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {isEmpty ? (
                        <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">หมดแล้ว</span>
                      ) : isLow ? (
                        <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-semibold">ใกล้หมด</span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-100 border-t-2 border-gray-200">
              <tr>
                <td className="px-4 py-2 text-sm font-bold text-gray-700">รวมทั้งหมด</td>
                <td className="px-3 py-2 text-right text-sm font-bold text-gray-700">{totalOpening.toLocaleString()}</td>
                <td className="px-3 py-2 text-right text-sm font-bold text-green-700">
                  {totalReceived > 0 ? `+${totalReceived.toLocaleString()}` : "—"}
                </td>
                <td className="px-3 py-2 text-right text-sm font-bold text-red-600">
                  {totalSold > 0 ? totalSold.toLocaleString() : "—"}
                </td>
                <td className="px-4 py-2 text-right text-sm font-bold text-gray-900">{totalRemaining.toLocaleString()}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
