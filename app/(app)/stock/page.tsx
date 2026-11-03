import { createClient } from "@/lib/supabase/server";
import StockPage from "./StockClient";

export default async function Stock() {
  const supabase = await createClient();
  const { data: products } = await supabase.from("products").select("id, name, standard_price").is("deleted_at", null).order("name");
  return <StockPage products={products ?? []} />;
}
