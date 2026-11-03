"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatBaht, formatDateTH } from "@/lib/utils";

interface Customer { id: string; name: string; created_at: string }
interface Order { id: string; order_number: string; order_date: string; is_paid: boolean; total: number }

export default function CustomersPage() {
  const supabase = createClient();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const fetchCustomers = useCallback(async () => {
    const { data } = await supabase.from("customers").select("id, name, created_at").is("deleted_at", null).order("name");
    const customers = (data ?? []) as Customer[];
    setCustomers(customers);

    // Get unpaid totals per customer
    const { data: orders } = await supabase
      .from("orders")
      .select("customer_id, order_lines(quantity, unit_price)")
      .eq("is_paid", false)
      .is("deleted_at", null);

    const bal: Record<string, number> = {};
    for (const o of orders ?? []) {
      const t = (o.order_lines as {quantity:number;unit_price:number}[]).reduce((s, l) => s + l.quantity * l.unit_price, 0);
      bal[o.customer_id] = (bal[o.customer_id] ?? 0) + t;
    }
    setBalances(bal);
  }, [supabase]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  async function handleAdd() {
    setAddError(null);
    if (!newName.trim()) return setAddError("กรุณากรอกชื่อลูกค้า");
    setAdding(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("customers").insert({ name: newName.trim() }).select("id").single();
    if (error) { setAddError("เพิ่มลูกค้าไม่สำเร็จ: " + error.message); setAdding(false); return; }
    await supabase.from("change_history").insert({
      user_id: user?.id, user_email: user?.email,
      action: "create", entity_type: "customer",
      entity_id: data.id, entity_label: newName.trim(),
      after_data: { name: newName.trim() },
    });
    setNewName(""); setAdding(false); fetchCustomers();
  }

  async function viewCustomer(c: Customer) {
    setSelectedCustomer(c);
    setOrdersLoading(true);
    const { data } = await supabase
      .from("orders")
      .select("id, order_number, order_date, is_paid, order_lines(quantity, unit_price)")
      .eq("customer_id", c.id)
      .is("deleted_at", null)
      .order("order_date", { ascending: false });
    const orders: Order[] = (data ?? []).map(o => ({
      id: o.id, order_number: o.order_number, order_date: o.order_date, is_paid: o.is_paid,
      total: (o.order_lines as {quantity:number;unit_price:number}[]).reduce((s, l) => s + l.quantity * l.unit_price, 0),
    }));
    setCustomerOrders(orders);
    setOrdersLoading(false);
  }

  const filtered = customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => (balances[b.id] ?? 0) - (balances[a.id] ?? 0));

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">ลูกค้า</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: list */}
        <div className="lg:col-span-2">
          {/* Add + Search */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <div className="flex gap-2 mb-3">
              <input placeholder="ชื่อลูกค้าใหม่" value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAdd()}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <button onClick={handleAdd} disabled={adding}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
                {adding ? "กำลังเพิ่ม..." : "+ เพิ่ม"}
              </button>
            </div>
            {addError && <p className="text-sm text-red-600">{addError}</p>}
            <input placeholder="ค้นหาลูกค้า..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">ชื่อลูกค้า</th>
                  <th className="text-right px-4 py-3 font-medium">ยอดค้างชำระ</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map(c => (
                  <tr key={c.id} className={`hover:bg-gray-50 cursor-pointer ${selectedCustomer?.id === c.id ? "bg-blue-50" : ""}`}
                    onClick={() => viewCustomer(c)}>
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-right">
                      {balances[c.id] > 0 ? (
                        <span className="text-yellow-600 font-semibold">฿{formatBaht(balances[c.id])}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-blue-500 text-xs">ดูประวัติ →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: customer detail */}
        <div>
          {selectedCustomer ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-800">{selectedCustomer.name}</h2>
                <button onClick={() => setSelectedCustomer(null)} className="text-gray-400 hover:text-gray-600">×</button>
              </div>
              <div className="mb-3 text-sm">
                <span className="text-gray-500">ยอดค้างชำระ:</span>
                <span className="ml-2 font-bold text-yellow-600">฿{formatBaht(balances[selectedCustomer.id] ?? 0)}</span>
              </div>
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">ประวัติออเดอร์</h3>
              {ordersLoading ? <p className="text-sm text-gray-400">กำลังโหลด...</p> : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {customerOrders.length === 0 ? <p className="text-sm text-gray-400">ยังไม่มีออเดอร์</p> : (
                    customerOrders.map(o => (
                      <a key={o.id} href={`/orders/${o.id}`}
                        className="flex items-center justify-between text-sm hover:bg-gray-50 rounded-lg p-2 -mx-2 transition-colors">
                        <div>
                          <div className="font-mono text-gray-500 text-xs">{o.order_number}</div>
                          <div className="text-gray-600">{formatDateTH(o.order_date)}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">฿{formatBaht(o.total)}</div>
                          <span className={`text-xs ${o.is_paid ? "text-green-600" : "text-red-500"}`}>
                            {o.is_paid ? "ชำระแล้ว" : "ค้าง"}
                          </span>
                        </div>
                      </a>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-400 text-sm">
              เลือกลูกค้าเพื่อดูประวัติ
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
