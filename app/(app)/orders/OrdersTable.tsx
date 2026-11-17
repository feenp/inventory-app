"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatBaht, formatDateTH } from "@/lib/utils";
import { exportAsTableImage, type TableExportCol, todayString } from "@/lib/exportImage";
import Link from "next/link";

interface Customer { id: string; name: string }
interface Product { id: string; name: string }

interface Order {
  id: string;
  order_number: string;
  order_date: string;
  is_paid: boolean;
  bill_company: boolean;
  bill_cash: boolean;
  customer: { name: string } | null;
  payment_channel: { name: string } | null;
  order_lines: { quantity: number; unit_price: number; lot: { product: { name: string } | null } | null }[];
}

export default function OrdersTable({ customers, products, initialPaid, initialSearch }: {
  customers: Customer[];
  products: Product[];
  initialPaid?: string;
  initialSearch?: string;
}) {
  const supabase = createClient();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState(initialSearch ?? "");
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterProduct, setFilterProduct] = useState("");
  const [filterPaid, setFilterPaid] = useState(initialPaid === "false" ? "false" : "");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("orders")
      .select("id, order_number, order_date, is_paid, bill_company, bill_cash, customer:customers(name), payment_channel:payment_channels(name), order_lines(quantity, unit_price, lot:lots(product:products(name)))")
      .is("deleted_at", null)
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (filterCustomer) query = query.eq("customer_id", filterCustomer);
    if (filterPaid === "true") query = query.eq("is_paid", true);
    if (filterPaid === "false") query = query.eq("is_paid", false);
    if (filterDateFrom) query = query.gte("order_date", filterDateFrom);
    if (filterDateTo) query = query.lte("order_date", filterDateTo);

    const { data } = await query;
    setOrders((data as unknown as Order[]) ?? []);
    setLoading(false);
  }, [supabase, filterCustomer, filterPaid, filterDateFrom, filterDateTo]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const filtered = orders.filter(o => {
    if (search) {
      const s = search.toLowerCase();
      const matchNum = o.order_number.toLowerCase().includes(s);
      const matchCust = o.customer?.name.toLowerCase().includes(s) ?? false;
      const matchProduct = o.order_lines.some(l => l.lot?.product?.name?.toLowerCase().includes(s) ?? false);
      if (!matchNum && !matchCust && !matchProduct) return false;
    }
    if (filterProduct) {
      const prod = products.find(p => p.id === filterProduct);
      if (prod && !o.order_lines.some(l => l.lot?.product?.name === prod.name)) return false;
    }
    return true;
  });

  // Product summary computed from currently-filtered orders
  const productSummaryData = (() => {
    const map: Record<string, { boxes: number; baht: number }> = {};
    for (const o of filtered) {
      for (const l of o.order_lines) {
        const name = l.lot?.product?.name ?? "ไม่ระบุ";
        if (!map[name]) map[name] = { boxes: 0, baht: 0 };
        map[name].boxes += l.quantity;
        map[name].baht += l.quantity * l.unit_price;
      }
    }
    return Object.entries(map).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.boxes - a.boxes);
  })();

  function buildDateRangeLabel() {
    function fmtBE(iso: string) {
      const d = new Date(iso + "T00:00:00+07:00");
      return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear() + 543}`;
    }
    if (filterDateFrom && filterDateTo && filterDateFrom === filterDateTo) return `วันที่ ${fmtBE(filterDateFrom)}`;
    if (filterDateFrom && filterDateTo) return `${fmtBE(filterDateFrom)} – ${fmtBE(filterDateTo)}`;
    if (filterDateFrom) return `ตั้งแต่ ${fmtBE(filterDateFrom)}`;
    if (filterDateTo) return `ถึง ${fmtBE(filterDateTo)}`;
    return "";
  }

  async function handleExportSummary() {
    if (productSummaryData.length === 0) return;
    const cols: TableExportCol[] = [
      { key: "name",  label: "สินค้า",        align: "left" },
      { key: "boxes", label: "จำนวน (กล่อง)",  align: "right" },
      { key: "baht",  label: "รายได้ (฿)",    align: "right" },
    ];
    const exportRows = productSummaryData.map(p => ({
      name:  p.name,
      boxes: p.boxes.toLocaleString(),
      baht:  `฿${formatBaht(p.baht)}`,
    }));
    const totalBoxes = productSummaryData.reduce((s, p) => s + p.boxes, 0);
    const totalBaht  = productSummaryData.reduce((s, p) => s + p.baht, 0);
    const dateRange = buildDateRangeLabel();
    await exportAsTableImage({
      title:        "สรุปยอดตามสินค้า",
      subtitle:     dateRange || `ส่งออกเมื่อ ${todayString()}`,
      columns:      cols,
      rows:         exportRows,
      footer:       { name: "รวมทั้งหมด", boxes: totalBoxes.toLocaleString(), baht: `฿${formatBaht(totalBaht)}` },
      summaryLines: [`${filtered.length} ออเดอร์ · รายได้รวม ฿${formatBaht(totalBaht)}`],
      filename:     `สรุปออเดอร์_${todayString()}.png`,
    });
  }

  async function handleExportOrders() {
    const cols: TableExportCol[] = [
      { key: "order_number", label: "เลขออเดอร์",   align: "left" },
      { key: "date",         label: "วันที่",         align: "left" },
      { key: "customer",     label: "ลูกค้า",         align: "left" },
      { key: "products",     label: "สินค้า",         align: "left" },
      { key: "total",        label: "ยอดรวม",         align: "right" },
      { key: "status",       label: "สถานะ",          align: "center" },
    ];
    const exportRows = filtered.map(o => {
      const total = o.order_lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
      const productQtyMap: Record<string, number> = {};
      for (const l of o.order_lines) {
        const name = l.lot?.product?.name ?? "ไม่ระบุ";
        productQtyMap[name] = (productQtyMap[name] ?? 0) + l.quantity;
      }
      const productSummary = Object.entries(productQtyMap).map(([name, qty]) => `${name} (${qty})`).join(", ");
      return {
        order_number: o.order_number,
        date:         formatDateTH(o.order_date),
        customer:     o.customer?.name ?? "",
        products:     productSummary || "-",
        total:        `฿${formatBaht(total)}`,
        status:       o.is_paid ? "ชำระแล้ว" : "ค้างชำระ",
      };
    });
    const d = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const beYear = d.getFullYear() + 543;
    const dateLabel = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${beYear}`;
    await exportAsTableImage({
      title:    "รายการออเดอร์",
      subtitle: `ส่งออกเมื่อ ${dateLabel} (${filtered.length} รายการ)`,
      columns:  cols,
      rows:     exportRows,
      filename: `ออเดอร์_${todayString()}.png`,
    });
  }

  return (
    <div>
      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <input placeholder="ค้นหา เลขออเดอร์/ลูกค้า/สินค้า" value={search} onChange={e => setSearch(e.target.value)}
            className="col-span-2 md:col-span-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <select value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option value="">ลูกค้าทั้งหมด</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filterPaid} onChange={e => setFilterPaid(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option value="">สถานะทั้งหมด</option>
            <option value="true">ชำระแล้ว</option>
            <option value="false">ค้างชำระ</option>
          </select>
          <div className="flex items-center gap-1">
            <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
              title="ตั้งแต่วันที่"
              className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <span className="text-gray-400 text-xs shrink-0">–</span>
            <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
              title="ถึงวันที่"
              className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <button onClick={fetchOrders}
            className="bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-medium rounded-lg px-3 py-2">ค้นหา</button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">กำลังโหลด...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400">ไม่พบออเดอร์</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-left px-4 py-3 font-medium">เลขออเดอร์</th>
                <th className="text-left px-4 py-3 font-medium">วันที่</th>
                <th className="text-left px-4 py-3 font-medium">ลูกค้า</th>
                <th className="text-left px-4 py-3 font-medium">สินค้า (กล่อง)</th>
                <th className="text-left px-4 py-3 font-medium">ช่องทางชำระ</th>
                <th className="text-right px-4 py-3 font-medium">ยอดรวม</th>
                <th className="text-center px-4 py-3 font-medium">สถานะ</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(o => {
                const total = o.order_lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
                // Group by product name, sum quantities
                const productQtyMap: Record<string, number> = {};
                for (const l of o.order_lines) {
                  const name = l.lot?.product?.name ?? "ไม่ระบุ";
                  productQtyMap[name] = (productQtyMap[name] ?? 0) + l.quantity;
                }
                const productSummary = Object.entries(productQtyMap).map(([name, qty]) => `${name} (${qty})`).join(", ");
                return (
                  <tr key={o.id} className={`hover:bg-gray-50 ${!o.is_paid ? "bg-red-50/30" : ""}`}>
                    <td className="px-4 py-3 font-mono text-gray-600">
                      {o.order_number}
                      <div className="flex gap-1 mt-0.5">
                        {o.bill_company && <span className="text-xs bg-blue-100 text-blue-600 px-1 rounded">บริษัท</span>}
                        {o.bill_cash && <span className="text-xs bg-gray-100 text-gray-500 px-1 rounded">เงินสด</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDateTH(o.order_date)}</td>
                    <td className="px-4 py-3 font-medium">{o.customer?.name}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs">{productSummary || "-"}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{o.payment_channel?.name ?? "-"}</td>
                    <td className="px-4 py-3 text-right font-semibold">฿{formatBaht(total)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${o.is_paid ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                        {o.is_paid ? "ชำระแล้ว" : "ค้างชำระ"}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link href={`/orders/${o.id}`} className="text-blue-600 hover:underline text-xs mr-2">ดู</Link>
                      <Link href={`/orders/${o.id}/edit`} className="text-gray-400 hover:text-blue-600 text-xs">แก้ไข</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && <div className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">{filtered.length} ออเดอร์</div>}
      </div>

      {/* Product summary section */}
      {!loading && productSummaryData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-4">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <div className="font-bold text-gray-900">สรุปยอดตามสินค้า</div>
              {buildDateRangeLabel() && (
                <div className="text-xs text-gray-400 mt-0.5">{buildDateRangeLabel()}</div>
              )}
            </div>
            <button
              onClick={handleExportSummary}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors">
              ดาวน์โหลดสรุป
            </button>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2.5 text-sm font-bold text-gray-700">สินค้า</th>
                <th className="text-right px-4 py-2.5 text-sm font-bold text-gray-700">จำนวน (กล่อง)</th>
                <th className="text-right px-4 py-2.5 text-sm font-bold text-gray-700">รายได้ (฿)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {productSummaryData.map((p, i) => (
                <tr key={p.name} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-4 py-2 text-base font-semibold text-gray-900">{p.name}</td>
                  <td className="px-4 py-2 text-right text-base font-bold text-gray-900">{p.boxes.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-base font-semibold text-gray-700">฿{formatBaht(p.baht)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-100 border-t-2 border-gray-200">
              <tr>
                <td className="px-4 py-2.5 text-sm font-bold text-gray-700">รวมทั้งหมด</td>
                <td className="px-4 py-2.5 text-right text-sm font-bold text-gray-900">
                  {productSummaryData.reduce((s, p) => s + p.boxes, 0).toLocaleString()} กล่อง
                </td>
                <td className="px-4 py-2.5 text-right text-sm font-bold text-gray-900">
                  ฿{formatBaht(productSummaryData.reduce((s, p) => s + p.baht, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
