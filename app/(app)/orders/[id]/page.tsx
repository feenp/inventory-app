import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import OrderDetail from "./OrderDetail";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select(`
      *,
      customer:customers(id, name),
      payment_channel:payment_channels(name),
      order_lines(*, lot:lots(lot_number, product:products(name, standard_price)))
    `)
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!order) notFound();

  const { data: paymentChannels } = await supabase.from("payment_channels").select("id, name").is("deleted_at", null).order("name");
  const { data: customers } = await supabase.from("customers").select("id, name").is("deleted_at", null).order("name");

  return <OrderDetail order={order} paymentChannels={paymentChannels ?? []} customers={customers ?? []} />;
}
