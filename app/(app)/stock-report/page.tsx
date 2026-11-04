import { createClient } from "@/lib/supabase/server";
import { formatDateTH } from "@/lib/utils";

export default async function StockReportPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: productStock }, { data: todayLots }, { data: todayOrders }] = await Promise.all([
    supabase.from("product_stock").select("*").order("name"),
    supabase.from("lots").select("product_id, boxes_received, products(name)").eq("date_received", today).is("deleted_at", null),
    supabase.from("orders")
      .select("order_lines(quantity, lot:lots(product_id, products(name)))")
      .eq("order_date", today)
      .is("deleted_at", null),
  ]);

  // Received today per product
  const receivedToday: Record<string, number> = {};
  for (const lot of todayLots ?? []) {
    const name = (lot.products as unknown as { name: string } | null)?.name ?? lot.product_id;
    receivedToday[name] = (receivedToday[name] ?? 0) + lot.boxes_received;
  }

  // Sold today per product
  const soldToday: Record<string, number> = {};
  for (const order of todayOrders ?? []) {
    for (const line of (order.order_lines as unknown as { quantity: number; lot: { product_id: string; products: { name: string } | null } | null }[])) {
      const name = line.lot?.products?.name ?? line.lot?.product_id ?? "ไม่ระบุ";
      soldToday[name] = (soldToday[name] ?? 0) + line.quantity;
    }
  }

  const totalSoldBoxes = Object.values(soldToday).reduce((s, v) => s + v, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">รายงานสต็อควันนี้</h1>
        <span className="text-sm text-gray-500">{formatDateTH(today)}</span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400 mb-1">รับเข้าวันนี้</div>
          <div className="text-2xl font-bold text-green-600">{Object.values(receivedToday).reduce((s, v) => s + v, 0).toLocaleString()}</div>
          <div className="text-xs text-gray-400">กล่อง</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400 mb-1">ขายออกวันนี้</div>
          <div className="text-2xl font-bold text-red-500">{totalSoldBoxes.toLocaleString()}</div>
          <div className="text-xs text-gray-400">กล่อง</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400 mb-1">จำนวนสินค้า</div>
          <div className="text-2xl font-bold text-gray-700">{(productStock ?? []).length}</div>
          <div className="text-xs text-gray-400">รายการ</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400 mb-1">สินค้าหมด</div>
          <div className="text-2xl font-bold text-orange-500">
            {(productStock ?? []).filter(p => p.total_remaining <= 0).length}
          </div>
          <div className="text-xs text-gray-400">รายการ</div>
        </div>
      </div>

      {/* Detail table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 font-semibold text-gray-700">รายละเอียดตามสินค้า</div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="text-left px-4 py-3 font-medium">สินค้า</th>
              <th className="text-right px-4 py-3 font-medium">สต็อคคงเหลือ</th>
              <th className="text-right px-4 py-3 font-medium">รับเข้าวันนี้</th>
              <th className="text-right px-4 py-3 font-medium">ขายออกวันนี้</th>
              <th className="text-center px-4 py-3 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(productStock ?? []).map(p => {
              const recv = receivedToday[p.name] ?? 0;
              const sold = soldToday[p.name] ?? 0;
              const isEmpty = p.total_remaining <= 0;
              const isLow = !isEmpty && p.low_stock_threshold != null && p.total_remaining <= p.low_stock_threshold;
              return (
                <tr key={p.product_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-right font-semibold">{p.total_remaining.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-green-600">{recv > 0 ? `+${recv}` : "-"}</td>
                  <td className="px-4 py-3 text-right text-red-500">{sold > 0 ? sold.toLocaleString() : "-"}</td>
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
          <tfoot className="bg-gray-50">
            <tr>
              <td className="px-4 py-3 text-sm font-semibold text-gray-600">รวม</td>
              <td className="px-4 py-3 text-right font-bold">{(productStock ?? []).reduce((s, p) => s + p.total_remaining, 0).toLocaleString()}</td>
              <td className="px-4 py-3 text-right font-bold text-green-600">
                {Object.values(receivedToday).reduce((s, v) => s + v, 0) > 0 ? `+${Object.values(receivedToday).reduce((s, v) => s + v, 0)}` : "-"}
              </td>
              <td className="px-4 py-3 text-right font-bold text-red-500">{totalSoldBoxes > 0 ? totalSoldBoxes.toLocaleString() : "-"}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
