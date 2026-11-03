"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatBaht, getYearMonthKey, makeOrderNumber } from "@/lib/utils";

interface Customer { id: string; name: string }
interface Product { id: string; name: string; standard_price: number | null }
interface PaymentChannel { id: string; name: string }

interface OrderLine {
  id: string; // local key
  lot_number: string;
  quantity: string;
  unit_price: string;
  is_price_adjusted: boolean;
  // fetched from DB
  lot_id?: string;
  product_name?: string;
  standard_price?: number | null;
  remaining_boxes?: number;
  error?: string;
}

function newLine(): OrderLine {
  return { id: crypto.randomUUID(), lot_number: "", quantity: "", unit_price: "", is_price_adjusted: false };
}

export default function NewOrderForm({ customers, products: _products, paymentChannels }: {
  customers: Customer[];
  products: Product[];
  paymentChannels: PaymentChannel[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const today = new Date().toISOString().slice(0, 10);
  const [orderDate, setOrderDate] = useState(today);
  const [customerId, setCustomerId] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [paymentChannelId, setPaymentChannelId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<OrderLine[]>([newLine()]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Lookup lot by lot_number
  const lookupLot = useCallback(async (lotNumber: string, lineId: string) => {
    if (!lotNumber.trim()) return;
    const { data } = await supabase
      .from("lot_remaining")
      .select("lot_id, lot_number, product_id, remaining_boxes, deleted_at")
      .eq("lot_number", lotNumber.trim())
      .single();

    if (!data || data.deleted_at) {
      setLines(prev => prev.map(l => l.id === lineId ? { ...l, error: "ไม่พบล็อตนี้ในระบบ", lot_id: undefined, product_name: undefined, remaining_boxes: undefined } : l));
      return;
    }

    // Get product name + standard price
    const { data: product } = await supabase
      .from("products")
      .select("name, standard_price")
      .eq("id", data.product_id)
      .single();

    setLines(prev => prev.map(l => {
      if (l.id !== lineId) return l;
      const sp = product?.standard_price ?? null;
      return {
        ...l,
        lot_id: data.lot_id,
        product_name: product?.name ?? "ไม่ระบุ",
        standard_price: sp,
        remaining_boxes: data.remaining_boxes,
        unit_price: l.unit_price || (sp != null ? String(sp) : ""),
        error: undefined,
      };
    }));
  }, [supabase]);

  function updateLine(id: string, field: keyof OrderLine, value: string | boolean) {
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: value };
      if (field === "unit_price") {
        updated.is_price_adjusted = updated.standard_price != null && parseFloat(value as string) !== updated.standard_price;
      }
      return updated;
    }));
  }

  function removeLine(id: string) {
    setLines(prev => prev.filter(l => l.id !== id));
  }

  // Per-lot combined quantity check (same lot on multiple lines)
  function getLotQuantityError(line: OrderLine): string | null {
    if (!line.lot_id || !line.remaining_boxes) return null;
    const combinedQty = lines
      .filter(l => l.lot_id === line.lot_id)
      .reduce((sum, l) => sum + (parseInt(l.quantity) || 0), 0);
    if (combinedQty > line.remaining_boxes) {
      return `เกินจำนวนคงเหลือในล็อต (เหลือ ${line.remaining_boxes} กล่อง)`;
    }
    return null;
  }

  const grandTotal = lines.reduce((sum, l) => {
    const qty = parseInt(l.quantity) || 0;
    const price = parseFloat(l.unit_price) || 0;
    return sum + qty * price;
  }, 0);

  const totalBoxes = lines.reduce((sum, l) => sum + (parseInt(l.quantity) || 0), 0);

  async function handleSave() {
    setSaveError(null);
    // Validate
    if (!customerId && !newCustomerName.trim()) return setSaveError("กรุณาเลือกหรือกรอกชื่อลูกค้า");
    if (lines.length === 0) return setSaveError("กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ");
    if (isPaid && !paymentChannelId) return setSaveError("กรุณาเลือกช่องทางการชำระเงิน");

    for (const l of lines) {
      if (!l.lot_id) return setSaveError(`ล็อต "${l.lot_number}" ไม่ถูกต้อง กรุณาตรวจสอบ`);
      if (!l.quantity || parseInt(l.quantity) < 1) return setSaveError("กรุณากรอกจำนวนกล่องให้ครบ");
      if (!l.unit_price || parseFloat(l.unit_price) < 0) return setSaveError("กรุณากรอกราคาให้ครบ");
      const qErr = getLotQuantityError(l);
      if (qErr) return setSaveError(qErr);
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Create customer if new
      let resolvedCustomerId = customerId;
      if (!customerId && newCustomerName.trim()) {
        const { data: nc, error: ncErr } = await supabase
          .from("customers")
          .insert({ name: newCustomerName.trim() })
          .select("id")
          .single();
        if (ncErr) throw new Error("เพิ่มลูกค้าใหม่ไม่สำเร็จ: " + ncErr.message);
        resolvedCustomerId = nc.id;
        await supabase.from("change_history").insert({
          user_id: user?.id, user_email: user?.email,
          action: "create", entity_type: "customer",
          entity_id: nc.id, entity_label: newCustomerName.trim(),
          after_data: { name: newCustomerName.trim() },
        });
      }

      // Generate order number by counting existing orders this month
      const ymKey = getYearMonthKey(orderDate);
      const { count } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .like("order_number", `${ymKey}-%`);
      const seq = (count ?? 0) + 1;
      const orderNumber = makeOrderNumber(ymKey, seq);

      // Create order
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert({
          order_number: orderNumber,
          order_date: orderDate,
          customer_id: resolvedCustomerId,
          is_paid: isPaid,
          payment_channel_id: isPaid ? paymentChannelId : null,
          note: note.trim() || null,
          created_by: user?.id,
        })
        .select("id")
        .single();
      if (orderErr) throw new Error("บันทึกออเดอร์ไม่สำเร็จ: " + orderErr.message);

      // Create order lines
      const linePayloads = lines.map(l => ({
        order_id: order.id,
        lot_id: l.lot_id!,
        quantity: parseInt(l.quantity),
        unit_price: parseFloat(l.unit_price),
        is_price_adjusted: l.is_price_adjusted,
      }));
      const { error: linesErr } = await supabase.from("order_lines").insert(linePayloads);
      if (linesErr) throw new Error("บันทึกรายการสินค้าไม่สำเร็จ: " + linesErr.message);

      // Change history
      await supabase.from("change_history").insert({
        user_id: user?.id, user_email: user?.email,
        action: "create", entity_type: "order",
        entity_id: order.id, entity_label: orderNumber,
        after_data: { orderNumber, date: orderDate, customerId: resolvedCustomerId, lines: linePayloads, isPaid },
      });

      router.push(`/orders/${order.id}`);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">บันทึกออเดอร์ใหม่</h1>

      {/* Header info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">วันที่</label>
            <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>

          {/* Customer */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ลูกค้า</label>
            {!showNewCustomer ? (
              <div className="flex gap-2">
                <select value={customerId} onChange={e => setCustomerId(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">-- เลือกลูกค้า --</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button onClick={() => { setShowNewCustomer(true); setCustomerId(""); }}
                  className="text-sm text-blue-600 hover:text-blue-800 whitespace-nowrap">+ ใหม่</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input placeholder="ชื่อลูกค้าใหม่" value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                <button onClick={() => { setShowNewCustomer(false); setNewCustomerName(""); }}
                  className="text-sm text-gray-500 hover:text-gray-700">ยกเลิก</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Order lines */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h2 className="font-semibold text-gray-700 mb-3">รายการสินค้า</h2>

        <div className="space-y-3">
          {lines.map((line, idx) => {
            const qtyErr = getLotQuantityError(line);
            return (
              <div key={line.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                <div className="flex items-start gap-2">
                  <span className="text-xs text-gray-400 mt-3 w-5 text-right shrink-0">{idx + 1}</span>
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-4 gap-2">
                    {/* Lot number */}
                    <div>
                      <label className="text-xs text-gray-500">เลขล็อต</label>
                      <input
                        value={line.lot_number}
                        onChange={e => updateLine(line.id, "lot_number", e.target.value)}
                        onBlur={() => lookupLot(line.lot_number, line.id)}
                        placeholder="เช่น 256911031"
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>

                    {/* Product info */}
                    <div>
                      <label className="text-xs text-gray-500">สินค้า</label>
                      <div className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white min-h-[34px] flex items-center">
                        {line.product_name ? (
                          <span className="text-gray-700">{line.product_name}</span>
                        ) : (
                          <span className="text-gray-400 text-xs">กรอกเลขล็อต</span>
                        )}
                      </div>
                    </div>

                    {/* Quantity */}
                    <div>
                      <label className="text-xs text-gray-500">
                        จำนวน (กล่อง)
                        {line.remaining_boxes != null && (
                          <span className="ml-1 text-gray-400">เหลือ {line.remaining_boxes}</span>
                        )}
                      </label>
                      <input
                        type="number" min={1}
                        value={line.quantity}
                        onChange={e => updateLine(line.id, "quantity", e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>

                    {/* Price */}
                    <div>
                      <label className="text-xs text-gray-500">
                        ราคา/กล่อง
                        {line.is_price_adjusted && line.standard_price != null && (
                          <span className="ml-1 text-orange-500">(ปรับราคา ปกติ {formatBaht(line.standard_price)})</span>
                        )}
                      </label>
                      <input
                        type="number" min={0} step={0.01}
                        value={line.unit_price}
                        onChange={e => updateLine(line.id, "unit_price", e.target.value)}
                        className={`w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${line.is_price_adjusted ? "border-orange-400 bg-orange-50" : "border-gray-300"}`}
                      />
                    </div>
                  </div>

                  <button onClick={() => removeLine(line.id)} className="text-gray-300 hover:text-red-500 mt-2 text-lg shrink-0">×</button>
                </div>

                {(line.error || qtyErr) && (
                  <div className="ml-7 mt-1 text-xs text-red-600">{line.error ?? qtyErr}</div>
                )}

                {!line.error && !qtyErr && line.lot_id && line.quantity && line.unit_price && (
                  <div className="ml-7 mt-1 text-xs text-gray-400">
                    รวม ฿{formatBaht(parseInt(line.quantity) * parseFloat(line.unit_price))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button onClick={() => setLines(prev => [...prev, newLine()])}
          className="mt-3 text-sm text-blue-600 hover:text-blue-800">+ เพิ่มรายการ</button>
      </div>

      {/* Payment & totals */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2 cursor-pointer">
              <input type="checkbox" checked={isPaid} onChange={e => setIsPaid(e.target.checked)} className="w-4 h-4" />
              ชำระเงินแล้ว
            </label>
            {isPaid && (
              <select value={paymentChannelId} onChange={e => setPaymentChannelId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">-- ช่องทางการชำระ --</option>
                {paymentChannels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end gap-8">
          <div className="text-sm text-gray-500">{totalBoxes} กล่อง</div>
          <div className="text-lg font-bold text-gray-800">รวม ฿{formatBaht(grandTotal)}</div>
        </div>
      </div>

      {saveError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{saveError}</div>
      )}

      <div className="flex gap-3">
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50">
          {saving ? "กำลังบันทึก..." : "บันทึกออเดอร์"}
        </button>
        <button onClick={() => router.back()}
          className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors">
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
