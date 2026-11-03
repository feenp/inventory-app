"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatBaht, formatDateTH } from "@/lib/utils";
import Link from "next/link";

interface Customer { id: string; name: string }
interface Product { id: string; name: string }

interface Order {
  id: string;
  order_number: string;
  order_date: string;
  is_paid: boolean;
  customer: { name: string } | null;
  order_lines: { quantity: number; unit_price: number; lot: { product: { name: string } | null } | null }[];
  total?: number;
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

  // Filters
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
      .select("id, order_number, order_date, is_paid, customer:customers(name), order_lines(quantity, unit_price, lot:lots(product:products(name)))")
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
      if (!o.order_lines.some(l => {
        const { data: products } = { data: null };
        return l.lot?.product?.name === products;
      })) {
        // check by name since we have name not id here — simplified
        const prod = products.find(p => p.id === filterProduct);
        if (prod && !o.order_lines.some(l => l.lot?.product?.name === prod.name)) return false;
      }
    }
    return true;
  });

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
          <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} placeholder="จากวันที่"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} placeholder="ถึงวันที่"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
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
                <th className="text-left px-4 py-3 font-medium">สินค้า</th>
                <th className="text-right px-4 py-3 font-medium">กล่อง</th>
                <th className="text-right px-4 py-3 font-medium">ยอดรวม</th>
                <th className="text-center px-4 py-3 font-medium">สถานะ</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(o => {
                const total = o.order_lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
                const boxes = o.order_lines.reduce((s, l) => s + l.quantity, 0);
                const productNames = [...new Set(o.order_lines.map(l => l.lot?.product?.name).filter(Boolean))].join(", ");
                return (
                  <tr key={o.id} className={`hover:bg-gray-50 ${!o.is_paid ? "bg-red-50/30" : ""}`}>
                    <td className="px-4 py-3 font-mono text-gray-600">{o.order_number}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDateTH(o.order_date)}</td>
                    <td className="px-4 py-3 font-medium">{o.customer?.name}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{productNames || "-"}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{boxes.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-semibold">฿{formatBaht(total)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${o.is_paid ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                        {o.is_paid ? "ชำระแล้ว" : "ค้างชำระ"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/orders/${o.id}`} className="text-blue-600 hover:underline text-xs">ดู</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && <div className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">{filtered.length} ออเดอร์</div>}
      </div>
    </div>
  );
}
