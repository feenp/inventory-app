import { createClient } from "@/lib/supabase/server";
import { formatBaht, formatDateTH } from "@/lib/utils";
import Link from "next/link";
import { fetchProductSortById, sortByProductId } from "@/lib/productOrder";

export default async function DashboardPage() {
  const supabase = await createClient();

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

  // Today's orders
  const { data: todayOrders } = await supabase
    .from("orders")
    .select("*, customer:customers(name), order_lines(quantity, unit_price)")
    .eq("order_date", todayStr)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  // This month's orders
  const { data: monthOrders } = await supabase
    .from("orders")
    .select("*, order_lines(quantity, unit_price)")
    .gte("order_date", firstOfMonth)
    .lte("order_date", todayStr)
    .is("deleted_at", null);

  // All unpaid orders (for balance)
  const { data: unpaidOrders } = await supabase
    .from("orders")
    .select("*, customer:customers(name), order_lines(quantity, unit_price)")
    .eq("is_paid", false)
    .is("deleted_at", null);

  // Low stock products + sort order
  const [{ data: stockData }, productSortMap] = await Promise.all([
    supabase.from("product_stock").select("*"),
    fetchProductSortById(supabase),
  ]);

  // Last 7 days sales (one entry per day)
  const last7Days: { date: string; total: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    const { data: dayOrders } = await supabase
      .from("orders")
      .select("order_lines(quantity, unit_price)")
      .eq("order_date", ds)
      .is("deleted_at", null);
    const total = dayOrders?.reduce((sum: number, o: { order_lines: { quantity: number; unit_price: number }[] }) =>
      sum + o.order_lines.reduce((s, l) => s + l.quantity * l.unit_price, 0), 0) ?? 0;
    last7Days.push({ date: ds, total });
  }

  // Compute totals
  const todaySales = todayOrders?.reduce((sum: number, o) =>
    sum + (o.order_lines as {quantity:number;unit_price:number}[]).reduce((s, l) => s + l.quantity * l.unit_price, 0), 0) ?? 0;
  const monthSales = monthOrders?.reduce((sum: number, o) =>
    sum + (o.order_lines as {quantity:number;unit_price:number}[]).reduce((s, l) => s + l.quantity * l.unit_price, 0), 0) ?? 0;
  const totalUnpaid = unpaidOrders?.reduce((sum: number, o) =>
    sum + (o.order_lines as {quantity:number;unit_price:number}[]).reduce((s, l) => s + l.quantity * l.unit_price, 0), 0) ?? 0;

  // Unpaid by customer
  const unpaidByCustomer: Record<string, { name: string; total: number }> = {};
  for (const o of unpaidOrders ?? []) {
    const cid = o.customer_id;
    const cname = (o.customer as {name:string})?.name ?? "ไม่ระบุ";
    const amount = (o.order_lines as {quantity:number;unit_price:number}[]).reduce((s, l) => s + l.quantity * l.unit_price, 0);
    if (!unpaidByCustomer[cid]) unpaidByCustomer[cid] = { name: cname, total: 0 };
    unpaidByCustomer[cid].total += amount;
  }
  const unpaidList = Object.values(unpaidByCustomer).sort((a, b) => b.total - a.total).slice(0, 10);

  // Low stock alerts — sorted by global product order
  const lowStockUnsorted = (stockData ?? []).filter(p =>
    p.low_stock_threshold !== null && p.total_remaining <= p.low_stock_threshold
  );
  const lowStock = sortByProductId(lowStockUnsorted, productSortMap, p => p.product_id, p => p.name);

  const maxBar = Math.max(...last7Days.map(d => d.total), 1);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">แดชบอร์ด</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="ยอดขายวันนี้" value={`฿${formatBaht(todaySales)}`} sub={`${todayOrders?.length ?? 0} ออเดอร์`} color="blue" />
        <StatCard title="ยอดขายเดือนนี้" value={`฿${formatBaht(monthSales)}`} sub={`${monthOrders?.length ?? 0} ออเดอร์`} color="green" />
        <StatCard title="ยอดค้างชำระรวม" value={`฿${formatBaht(totalUnpaid)}`} sub={`${unpaidOrders?.length ?? 0} ออเดอร์`} color="yellow" />
        <StatCard title="สต็อคใกล้หมด" value={String(lowStock.length)} sub="รายการ" color={lowStock.length > 0 ? "red" : "gray"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* 7-day bar chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-700 mb-4">ยอดขาย 7 วันล่าสุด</h2>
          <div className="flex items-end gap-2 h-32">
            {last7Days.map(({ date, total }) => {
              const h = maxBar > 0 ? (total / maxBar) * 100 : 0;
              const isToday = date === todayStr;
              const d = new Date(date);
              const label = `${d.getDate()}/${d.getMonth()+1}`;
              return (
                <div key={date} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col justify-end" style={{ height: "96px" }}>
                    <div
                      className={`w-full rounded-t transition-all ${isToday ? "bg-blue-500" : "bg-blue-200"}`}
                      style={{ height: `${Math.max(h, 2)}%` }}
                      title={`฿${formatBaht(total)}`}
                    />
                  </div>
                  <div className={`text-xs ${isToday ? "font-bold text-blue-600" : "text-gray-500"}`}>{label}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Low stock alerts */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-700 mb-4">⚠️ สต็อคใกล้หมด / หมด</h2>
          {lowStock.length === 0 ? (
            <p className="text-sm text-gray-400">ไม่มีสินค้าใกล้หมด</p>
          ) : (
            <div className="space-y-2">
              {lowStock.map(p => (
                <div key={p.product_id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 truncate flex-1 mr-2">{p.name}</span>
                  <span className={`font-semibold shrink-0 ${p.total_remaining === 0 ? "text-red-600" : "text-orange-500"}`}>
                    {p.total_remaining === 0 ? "หมด" : `${p.total_remaining} กล่อง`}
                  </span>
                </div>
              ))}
            </div>
          )}
          <Link href="/stock" className="text-xs text-blue-500 hover:underline mt-3 block">ดูสต็อคทั้งหมด →</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Unpaid by customer */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-700 mb-4">ยอดค้างชำระตามลูกค้า</h2>
          {unpaidList.length === 0 ? (
            <p className="text-sm text-gray-400">ไม่มียอดค้างชำระ</p>
          ) : (
            <div className="space-y-2">
              {unpaidList.map(c => (
                <div key={c.name} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 truncate flex-1 mr-2">{c.name}</span>
                  <span className="font-semibold text-yellow-600 shrink-0">฿{formatBaht(c.total)}</span>
                </div>
              ))}
            </div>
          )}
          <Link href="/orders?paid=false" className="text-xs text-blue-500 hover:underline mt-3 block">ดูออเดอร์ค้างชำระ →</Link>
        </div>

        {/* Today's orders */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-700 mb-4">ออเดอร์วันนี้</h2>
          {!todayOrders?.length ? (
            <p className="text-sm text-gray-400">ยังไม่มีออเดอร์วันนี้</p>
          ) : (
            <div className="space-y-2">
              {todayOrders.slice(0, 8).map(o => {
                const total = (o.order_lines as {quantity:number;unit_price:number}[]).reduce((s, l) => s + l.quantity * l.unit_price, 0);
                return (
                  <div key={o.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-gray-500 text-xs font-mono shrink-0">{o.order_number}</span>
                      <span className="text-gray-700 truncate">{(o.customer as {name:string})?.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="font-medium">฿{formatBaht(total)}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${o.is_paid ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                        {o.is_paid ? "ชำระแล้ว" : "ค้าง"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <Link href="/orders/new" className="text-xs text-blue-500 hover:underline mt-3 block">+ บันทึกออเดอร์ใหม่</Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, sub, color }: { title: string; value: string; sub: string; color: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    green: "bg-green-50 border-green-200 text-green-700",
    yellow: "bg-yellow-50 border-yellow-200 text-yellow-700",
    red: "bg-red-50 border-red-200 text-red-700",
    gray: "bg-gray-50 border-gray-200 text-gray-600",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="text-xs font-medium opacity-75 mb-1">{title}</div>
      <div className="text-2xl font-bold mb-0.5">{value}</div>
      <div className="text-xs opacity-60">{sub}</div>
    </div>
  );
}
