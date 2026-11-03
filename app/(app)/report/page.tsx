"use client";
import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatBaht, toBEYear } from "@/lib/utils";
import { ADJUSTMENT_REASONS } from "@/lib/types";
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

    const { data: orders } = await supabase
      .from("orders")
      .select("id, order_date, is_paid, customer:customers(name), order_lines(quantity, unit_price, lot:lots(product:products(name)))")
      .gte("order_date", firstDay)
      .lte("order_date", lastDay)
      .is("deleted_at", null);

    const { data: adjustments } = await supabase
      .from("stock_adjustments")
      .select("quantity, reason")
      .gte("created_at", firstDay)
      .lte("created_at", lastDay + "T23:59:59");

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

    // Weekly breakdown: weeks 1-7, 8-14, 15-21, 22-28, 29-end
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

    // Product data
    const prodMap: Record<string, { boxes: number; baht: number }> = {};
    for (const o of typedOrders) {
      for (const l of o.order_lines) {
        const n = l.lot?.product?.name ?? "ไม่ระบุ";
        if (!prodMap[n]) prodMap[n] = { boxes: 0, baht: 0 };
        prodMap[n].boxes += l.quantity;
        prodMap[n].baht += l.quantity * l.unit_price;
      }
    }
    const productData: ProductData[] = Object.entries(prodMap).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.baht - a.baht);

    // Unpaid by customer (current status)
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

  const beYear = toBEYear(new Date(selectedYear, 0, 1));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 no-print">
        <h1 className="text-2xl font-bold text-gray-800">รายงานประจำเดือน</h1>
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
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50">
            {loading ? "กำลังโหลด..." : "ดูรายงาน"}
          </button>
        </div>
      </div>

      {report && (
        <div className="space-y-6">
          {/* Report header */}
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
            <h2 className="font-semibold text-gray-700 mb-4">ยอดขายรายสัปดาห์</h2>
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
              <h2 className="font-semibold text-gray-700 mb-4">ลูกค้าสูงสุด 5 อันดับ</h2>
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-400"><th className="text-left pb-2">ลูกค้า</th><th className="text-right pb-2">ยอด</th><th className="text-right pb-2">%</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {report.topCustomers.map(c => (
                    <tr key={c.name}><td className="py-1.5">{c.name}</td><td className="py-1.5 text-right">฿{formatBaht(c.total)}</td><td className="py-1.5 text-right text-gray-400">{c.share.toFixed(1)}%</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Unpaid by customer */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-700 mb-4">ยอดค้างชำระ (จากออเดอร์เดือนนี้)</h2>
              {report.unpaidByCustomer.length === 0 ? (
                <p className="text-sm text-gray-400">ไม่มียอดค้าง</p>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-gray-400"><th className="text-left pb-2">ลูกค้า</th><th className="text-right pb-2">ค้างชำระ</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.unpaidByCustomer.map(c => (
                      <tr key={c.name}><td className="py-1.5">{c.name}</td><td className="py-1.5 text-right text-yellow-600 font-medium">฿{formatBaht(c.total)}</td></tr>
                    ))}
                    <tr className="font-semibold"><td className="py-1.5">รวม</td><td className="py-1.5 text-right">฿{formatBaht(report.unpaidByCustomer.reduce((s,c)=>s+c.total,0))}</td></tr>
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Sales by product */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-700 mb-4">ยอดขายตามสินค้า</h2>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr><th className="text-left px-3 py-2 font-medium">สินค้า</th><th className="text-right px-3 py-2 font-medium">กล่อง</th><th className="text-right px-3 py-2 font-medium">ยอดรวม</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.productData.map(p => (
                  <tr key={p.name}><td className="px-3 py-2">{p.name}</td><td className="px-3 py-2 text-right">{p.boxes.toLocaleString()}</td><td className="px-3 py-2 text-right">฿{formatBaht(p.baht)}</td></tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td className="px-3 py-2">รวม</td>
                  <td className="px-3 py-2 text-right">{report.productData.reduce((s,p)=>s+p.boxes,0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">฿{formatBaht(report.productData.reduce((s,p)=>s+p.baht,0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Stock adjustments */}
          {report.adjByReason.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-700 mb-4">การปรับสต็อคในเดือนนี้</h2>
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-400"><th className="text-left pb-2">เหตุผล</th><th className="text-right pb-2">จำนวนสุทธิ (กล่อง)</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {report.adjByReason.map(a => (
                    <tr key={a.reason}><td className="py-1.5">{ADJUSTMENT_REASONS[a.reason] ?? a.reason}</td>
                    <td className={`py-1.5 text-right font-medium ${a.qty >= 0 ? "text-green-600" : "text-red-600"}`}>{a.qty > 0 ? "+" : ""}{a.qty}</td></tr>
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
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-xl font-bold ${green ? "text-green-700" : red ? "text-red-700" : "text-gray-800"}`}>{value}</div>
    </div>
  );
}

