import { createClient } from "@/lib/supabase/server";
import OrdersTable from "./OrdersTable";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data: customers } = await supabase
    .from("customers").select("id, name").is("deleted_at", null).order("name");

  const { data: products } = await supabase
    .from("products").select("id, name").is("deleted_at", null).order("name");

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">ออเดอร์ทั้งหมด</h1>
        <a href="/orders/new" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          + บันทึกออเดอร์ใหม่
        </a>
      </div>
      <OrdersTable
        customers={customers ?? []}
        products={products ?? []}
        initialPaid={params.paid}
        initialSearch={params.search}
      />
    </div>
  );
}
