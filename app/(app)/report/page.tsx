"use client";
import { useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatBaht, toBEYear } from "@/lib/utils";
import { ADJUSTMENT_REASONS } from "@/lib/types";
import { exportAsA4Png } from "@/lib/exportImage";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const THAI_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

interface WeekData { label: string; total: number }
interface CustomerData { name: string; total: number; share: number }
interface ProductData { name: string; boxes: number; baht: number }
interface AdjReason { reason: string; qty: number }

interface ReportData {
  month: number; year: number;
  totalSales: number; orderCount: number; boxesSold: number;
  avgPerOrder: number; collected: number; unpaid: number;
  weeklyData: WeekData[];
  topCustomers: CustomerData[];
  productData: ProductData[];
  unpaidByCustomer: { name: string; total: number }[];
  adjByReason: AdjReason[];
}

export default function ReportPage() {
  const supabase = createClient();
  const now = new Date();
  const salesByProductRef = useRef<HTMLDivElement>(null);

  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  const generateReport = useCallback(async () => {
    setLoading(true);
    const year = selectedYear;
    const month = selectedMonth;
    const firstDay = new Date(year, month, 1).toISOString().slice(0, 10);
    const lastDay = new Date(year, month + 1, 0).toISOString().slice(0, 10);

    const [{ data: orders }, { data: adjustments }, { data: productMeta }] = await Promise.all([
      supabase
        .from("orders")
        .select("id, order_date, is_paid, customer:customers(name), order_lines(quantity, unit_price, lot:lots(product:products(name)))")
        .gte("order_date", firstDay)
        .lte("order_date", lastDay)
        .is("deleted_at", null),
      supabase
        .from("stock_adjustments")
        .select("quantity, reason")
        .gte("created_at", firstDay)
        .lte("created_at", lastDay + "T23:59:59"),
      supabase
        .from("products")
        .select("name, sort_order")
        .is("deleted_at", null)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name"),
    ]);

    // Build product sort index (name → rank)
    const productSortRank: Record<string, number> = {};
    for (let i = 0; i < (productMeta ?? []).length; i++) {
      productSortRank[(productMeta![i] as { name: string }).name] = i;
    }

    const typedOrders = (orders ?? []) as unknown as {
      id: string; order_date: string; is_paid: boolean;
      customer: { name: string } | null;
      order_lines: { quantity: number; unit_price: number; lot: { product: { name: string } | null } | null }[];
    }[];

    const totalSales = typedOrders.reduce((s, o) => s + o.order_lines.reduce((ss, l) => ss + l.quantity * l.unit_price, 0), 0);
    const collected = typedOrders.filter(o => o.is_paid).reduce((s, o) => s + o.order_lines.reduce((ss, l) => ss + l.quantity * l.unit_price, 0), 0);
    const unpaid = typedOrders.filter(o => !o.is_paid).reduce((s, o) => s + o.order_lines.reduce((ss, l) => ss + l.quantity * l.unit_price, 0), 0);
    const boxesSold = typedOrders.reduce((s, o) => s + o.order_lines.reduce((ss, l) => ss + l.quantity, 0), 0);
    const orderCount = typedOrders.length;
    const avgPerOrder = orderCount > 0 ? totalSales / orderCount : 0;

    // Weekly breakdown
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const weekRanges = [[1,7],[8,14],[15,21],[22,28],[29,daysInMonth]].filter(([s]) => s <= daysInMonth);
    const weeklyData: WeekData[] = weekRanges.map(([start, end]) => {
      const total = typedOrders.filter(o => {
        const d = new Date(o.order_date).getDate();
        return d >= start && d <= end;
      }).reduce((s, o) => s + o.order_lines.reduce((ss, l) => ss + l.quantity * l.unit_price, 0), 0);
      return { label: `${start}–${end}`, total };
    });

    // Top customers
    const custMap: Record<string, number> = {};
    for (const o of typedOrders) {
      const n = o.customer?.name ?? "ไม่ระบุ";
      const t = o.order_lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
      custMap[n] = (custMap[n] ?? 0) + t;
    }
    const sortedCusts = Object.entries(custMap).sort(([,a],[,b]) => b - a);
    const top5 = sortedCusts.slice(0, 5).map(([name, total]) => ({ name, total, share: totalSales > 0 ? total / totalSales * 100 : 0 }));
    const othersTotal = sortedCusts.slice(5).reduce((s, [,t]) => s + t, 0);
    const topCustomers = othersTotal > 0 ? [...top5, { name: "อื่นๆ", total: othersTotal, share: totalSales > 0 ? othersTotal / totalSales * 100 : 0 }] : top5;

    // Product data — sorted by product sort_order
    const prodMap: Record<string, { boxes: number; baht: number }> = {};
    for (const o of typedOrders) {
      for (const l of o.order_lines) {
        const n = l.lot?.product?.name ?? "ไม่ระบุ";
        if (!prodMap[n]) prodMap[n] = { boxes: 0, baht: 0 };
        prodMap[n].boxes += l.quantity;
        prodMap[n].baht += l.quantity * l.unit_price;
      }
    }
    const productData: ProductData[] = Object.entries(prodMap)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => {
        const ra = productSortRank[a.name] ?? 999999;
        const rb = productSortRank[b.name] ?? 999999;
        return ra !== rb ? ra - rb : a.name.localeCompare(b.name, "th");
      });

    // Unpaid by customer
    const unpaidByCust: Record<string, number> = {};
    for (const o of typedOrders.filter(o => !o.is_paid)) {
      const n = o.customer?.name ?? "ไม่ระบุ";
      const t = o.order_lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
      unpaidByCust[n] = (unpaidByCust[n] ?? 0) + t;
    }
    const unpaidByCustomer = Object.entries(unpaidByCust).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);

    // Adjustments by reason
    const adjMap: Record<string, number> = {};
    for (const a of adjustments ?? []) {
      adjMap[a.reason] = (adjMap[a.reason] ?? 0) + a.quantity;
    }
    const adjByReason: AdjReason[] = Object.entries(adjMap).map(([reason, qty]) => ({ reason, qty }));

    setReport({ month, year, totalSales, orderCount, boxesSold, avgPerOrder, collected, unpaid, weeklyData, topCustomers, productData, unpaidByCustomer, adjByReason });
    setLoading(false);
  }, [supabase, selectedYear, selectedMonth]);

  async function handleExportSalesByProduct() {
    if (!salesByProductRef.current || !report) return;
    const monthStr = String(report.month + 1).padStart(2, "0");
    await exportAsA4Png(salesByProductRef.current, `ยอดขายตามสินค้า_${report.year}-${monthStr}.png`);
  }

  const beYear = toBEYear(new Date(selectedYear, 0, 1));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 no-print">
        <h1 className="text-2xl font-bold text-gray-900">รายงานประจำเดือน</h1>
        {report && (
          <button onClick={() => window.print()}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium rounded-lg">
            🖨️ พิมพ์ / บันทึก PDF
          </button>
        )}
      </div>

      {/* Month selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 no-print">
        <div className="flex gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">เดือน</label>
            <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
              {THAI_MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">ปี (ค.ศ.)</label>
            <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
              {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y => (
                <option key={y} value={y}>{y + 543} ({y})</option>
              ))}
            </select>
          </div>
          <button onClick={generateReport} disabled={loading}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg disabled:opacity-50">
            {loading ? "กำลังโหลด..." : "ดูรายงาน"}
          </button>
        </div>
      </div>

      {report && (
        <div className="space-y-6">
          {/* Report header (print only) */}
          <div className="text-center print-only mb-4">
            <h2 className="text-xl font-bold">รายงานประจำเดือน {THAI_MONTHS[report.month]} พ.ศ. {toBEYear(new Date(report.year, 0, 1))}</h2>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ReportCard label="ยอดขายรวม" value={`฿${formatBaht(report.totalSales)}`} />
            <ReportCard label="จำนวนออเดอร์" value={String(report.orderCount)} />
            <ReportCard label="กล่องที่ขาย" value={report.boxesSold.toLocaleString()} />
            <ReportCard label="เฉลี่ย/ออเดอร์" value={`฿${formatBaht(report.avgPerOrder)}`} />
            <ReportCard label="รับเงินแล้ว" value={`฿${formatBaht(report.collected)}`} green />
            <ReportCard label="ค้างชำระ" value={`฿${formatBaht(report.unpaid)}`} red />
          </div>

          {/* Weekly chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-gray-900 mb-4">ยอดขายรายสัปดาห์</h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={report.weeklyData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => [`฿${formatBaht(Number(v))}`, "ยอดขาย"]} />
                <Bar dataKey="total" fill="#3b82f6" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top customers */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-bold text-gray-900 mb-4">ลูกค้าสูงสุด 5 อันดับ</h2>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left pb-2 text-sm font-bold text-gray-700">ลูกค้า</th>
                    <th className="text-right pb-2 text-sm font-bold text-gray-700">ยอด</th>
                    <th className="text-right pb-2 text-sm font-bold text-gray-700">%</th>
                  </tr>
                </thead>
                <tbody>
                  {report.topCustomers.map((c, i) => (
                    <tr key={c.name} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="py-1.5 text-base font-medium text-gray-900">{c.name}</td>
                      <td className="py-1.5 text-right text-base font-semibold text-gray-900">฿{formatBaht(c.total)}</td>
                      <td className="py-1.5 text-right text-sm text-gray-500">{c.share.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Unpaid by customer */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-bold text-gray-900 mb-4">ยอดค้างชำระ (จากออเดอร์เดือนนี้)</h2>
              {report.unpaidByCustomer.length === 0 ? (
                <p className="text-sm text-gray-400">ไม่มียอดค้าง</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left pb-2 text-sm font-bold text-gray-700">ลูกค้า</th>
                      <th className="text-right pb-2 text-sm font-bold text-gray-700">ค้างชำระ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.unpaidByCustomer.map((c, i) => (
                      <tr key={c.name} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="py-1.5 text-base font-medium text-gray-900">{c.name}</td>
                        <td className="py-1.5 text-right text-base font-semibold text-orange-600">฿{formatBaht(c.total)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td className="py-1.5 text-sm font-bold text-gray-700">รวม</td>
                      <td className="py-1.5 text-right text-sm font-bold text-gray-900">฿{formatBaht(report.unpaidByCustomer.reduce((s,c)=>s+c.total,0))}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Sales by product */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">ยอดขายตามสินค้า</h2>
              <button
                onClick={handleExportSalesByProduct}
                data-export-hidden="true"
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                ดาวน์โหลดรูปภาพ
              </button>
            </div>

            <div ref={salesByProductRef} className="bg-white">
              {/* Export header (shown in image, hidden on screen via print only but always rendered) */}
              <div className="px-5 pt-4 pb-2">
                <div className="text-base font-bold text-gray-900">ยอดขายตามสินค้า</div>
                <div className="text-sm text-gray-500">
                  {THAI_MONTHS[report.month]} พ.ศ. {toBEYear(new Date(report.year, 0, 1))}
                </div>
              </div>

              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="text-left px-5 py-2.5 text-sm font-bold text-gray-700">สินค้า</th>
                    <th className="text-right px-4 py-2.5 text-sm font-bold text-gray-700">กล่อง</th>
                    <th className="text-right px-5 py-2.5 text-sm font-bold text-gray-700">ยอดรวม (฿)</th>
                  </tr>
                </thead>
                <tbody>
                  {report.productData.map((p, i) => (
                    <tr key={p.name} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-5 py-2 text-base font-semibold text-gray-900">{p.name}</td>
                      <td className="px-4 py-2 text-right text-base font-semibold text-gray-900">{p.boxes.toLocaleString()}</td>
                      <td className="px-5 py-2 text-right text-base font-bold text-gray-900">฿{formatBaht(p.baht)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100 border-t-2 border-gray-200">
                  <tr>
                    <td className="px-5 py-2 text-sm font-bold text-gray-700">รวมทั้งหมด</td>
                    <td className="px-4 py-2 text-right text-sm font-bold text-gray-900">{report.productData.reduce((s,p)=>s+p.boxes,0).toLocaleString()}</td>
                    <td className="px-5 py-2 text-right text-sm font-bold text-gray-900">฿{formatBaht(report.productData.reduce((s,p)=>s+p.baht,0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Stock adjustments */}
          {report.adjByReason.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-bold text-gray-900 mb-4">การปรับสต็อคในเดือนนี้</h2>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left pb-2 text-sm font-bold text-gray-700">เหตุผล</th>
                    <th className="text-right pb-2 text-sm font-bold text-gray-700">จำนวนสุทธิ (กล่อง)</th>
                  </tr>
                </thead>
                <tbody>
                  {report.adjByReason.map((a, i) => (
                    <tr key={a.reason} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="py-1.5 text-base font-medium text-gray-900">{ADJUSTMENT_REASONS[a.reason] ?? a.reason}</td>
                      <td className={`py-1.5 text-right text-base font-bold ${a.qty >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {a.qty > 0 ? "+" : ""}{a.qty}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReportCard({ label, value, green, red }: { label: string; value: string; green?: boolean; red?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${green ? "bg-green-50 border-green-200" : red ? "bg-red-50 border-red-200" : "bg-white border-gray-200"}`}>
      <div className="text-xs font-semibold text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${green ? "text-green-700" : red ? "text-red-700" : "text-gray-900"}`}>{value}</div>
    </div>
  );
}
