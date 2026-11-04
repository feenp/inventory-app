import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import NewOrderForm from "../../new/NewOrderForm";

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: order }, { data: customers }, { data: paymentChannels }, { data: lots }] = await Promise.all([
    supabase.from("orders")
      .select("id, order_number, order_date, customer_id, is_paid, payment_channel_id, bill_company, bill_cash, note, order_lines(id, lot_id, quantity, unit_price, is_price_adjusted, lot:lots(lot_number, product:products(name, standard_price)))")
      .eq("id", id)
      .is("deleted_at", null)
      .single(),
    supabase.from("customers").select("id, name").is("deleted_at", null).order("name"),
    supabase.from("payment_channels").select("id, name").is("deleted_at", null).order("name"),
    supabase.from("lot_remaining").select("lot_id, lot_number, remaining_boxes").is("deleted_at", null),
  ]);

  if (!order) notFound();

  const lotRemainingMap: Record<string, number> = {};
  for (const l of lots ?? []) lotRemainingMap[l.lot_id] = l.remaining_boxes;

  const editLines = (order.order_lines ?? []).map((l: {
    lot_id: string;
    quantity: number;
    unit_price: number;
    is_price_adjusted: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lot: any;
  }) => ({
    lot_id: l.lot_id,
    lot_number: l.lot?.lot_number ?? "",
    quantity: l.quantity,
    unit_price: l.unit_price,
    is_price_adjusted: l.is_price_adjusted,
    product_name: l.lot?.product?.name ?? "ไม่ระบุ",
    standard_price: l.lot?.product?.standard_price ?? null,
    remaining_boxes: lotRemainingMap[l.lot_id] ?? 0,
  }));

  return (
    <NewOrderForm
      customers={customers ?? []}
      paymentChannels={paymentChannels ?? []}
      editOrder={{
        id: order.id,
        order_number: order.order_number,
        order_date: order.order_date,
        customer_id: order.customer_id,
        is_paid: order.is_paid,
        payment_channel_id: order.payment_channel_id,
        bill_company: order.bill_company ?? false,
        bill_cash: order.bill_cash ?? false,
        note: order.note,
        lines: editLines,
      }}
    />
  );
}
