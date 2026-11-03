import { createClient } from "@/lib/supabase/server";
import NewOrderForm from "./NewOrderForm";

export default async function NewOrderPage() {
  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("id, name").is("deleted_at", null).order("name");
  const { data: products } = await supabase.from("products").select("id, name, standard_price").is("deleted_at", null).order("name");
  const { data: paymentChannels } = await supabase.from("payment_channels").select("id, name").is("deleted_at", null).order("name");

  return <NewOrderForm customers={customers ?? []} products={products ?? []} paymentChannels={paymentChannels ?? []} />;
}
