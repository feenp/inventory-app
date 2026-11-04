import { createClient } from "@/lib/supabase/server";
import StockReportClient from "./StockReportClient";

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

  const receivedToday: Record<string, number> = {};
  for (const lot of todayLots ?? []) {
    const name = (lot.products as unknown as { name: string } | null)?.name ?? lot.product_id;
    receivedToday[name] = (receivedToday[name] ?? 0) + lot.boxes_received;
  }

  const soldToday: Record<string, number> = {};
  for (const order of todayOrders ?? []) {
    for (const line of (order.order_lines as unknown as { quantity: number; lot: { product_id: string; products: { name: string } | null } | null }[])) {
      const name = line.lot?.products?.name ?? line.lot?.product_id ?? "ไม่ระบุ";
      soldToday[name] = (soldToday[name] ?? 0) + line.quantity;
    }
  }

  const rows = (productStock ?? []).map(p => ({
    product_id: p.product_id,
    name: p.name,
    total_remaining: p.total_remaining,
    low_stock_threshold: p.low_stock_threshold,
    receivedToday: receivedToday[p.name] ?? 0,
    soldToday: soldToday[p.name] ?? 0,
  }));

  return <StockReportClient rows={rows} today={today} />;
}
