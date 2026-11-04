"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatBaht, getYearMonthKey, makeOrderNumber } from "@/lib/utils";

interface Customer { id: string; name: string }
interface PaymentChannel { id: string; name: string }
interface LotOption {
  lot_id: string;
  lot_number: string;
  product_id: string;
  remaining_boxes: number;
  product_name: string;
  standard_price: number | null;
}

interface OrderLine {
  id: string;
  lot_number: string;
  quantity: string;
  unit_price: string;
  is_price_adjusted: boolean;
  lot_id?: string;
  product_name?: string;
  standard_price?: number | null;
  remaining_boxes?: number;
  error?: string;
}

function newLine(): OrderLine {
  return { id: crypto.randomUUID(), lot_number: "", quantity: "", unit_price: "", is_price_adjusted: false };
}

function getDefaultLotPrefix(): string {
  const now = new Date();
  const beYear = now.getFullYear() + 543;
  const yy = String(beYear).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

export default function NewOrderForm({ customers, paymentChannels, editOrder }: {
  customers: Customer[];
  paymentChannels: PaymentChannel[];
  editOrder?: {
    id: string;
    order_number: string;
    order_date: string;
    customer_id: string;
    is_paid: boolean;
    payment_channel_id: string | null;
    bill_company: boolean;
    bill_cash: boolean;
    note: string | null;
    lines: { lot_id: string; lot_number: string; quantity: number; unit_price: number; is_price_adjusted: boolean; product_name: string; standard_price: number | null; remaining_boxes: number }[];
  };
}) {
  const router = useRouter();
  const supabase = createClient();
  const isEdit = !!editOrder;

  const today = new Date().toISOString().slice(0, 10);
  const [orderDate, setOrderDate] = useState(editOrder?.order_date ?? today);
  const [customerId, setCustomerId] = useState(editOrder?.customer_id ?? "");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [isPaid, setIsPaid] = useState(editOrder?.is_paid ?? false);
  const [paymentChannelId, setPaymentChannelId] = useState(editOrder?.payment_channel_id ?? "");
  const [billCompany, setBillCompany] = useState(editOrder?.bill_company ?? false);
  const [billCash, setBillCash] = useState(editOrder?.bill_cash ?? false);
  const [note, setNote] = useState(editOrder?.note ?? "");
  const [lines, setLines] = useState<OrderLine[]>(() =>
    editOrder?.lines.map(l => ({
      id: crypto.randomUUID(),
      lot_number: l.lot_number,
      quantity: String(l.quantity),
      unit_price: String(l.unit_price),
      is_price_adjusted: l.is_price_adjusted,
      lot_id: l.lot_id,
      product_name: l.product_name,
      standard_price: l.standard_price,
      remaining_boxes: l.remaining_boxes,
    })) ?? [newLine()]
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [previewOrderNumber, setPreviewOrderNumber] = useState<string | null>(null);

  // All available lots for typeahead
  const [allLots, setAllLots] = useState<LotOption[]>([]);
  const [dropdownState, setDropdownState] = useState<Record<string, { open: boolean; index: number }>>({});

  useEffect(() => {
    async function loadLots() {
      const { data } = await supabase
        .from("lot_remaining")
        .select("lot_id, lot_number, product_id, remaining_boxes, deleted_at")
        .is("deleted_at", null)
        .gt("remaining_boxes", 0);
      if (!data) return;
      const productIds = [...new Set(data.map(l => l.product_id))];
      const { data: prods } = await supabase.from("products").select("id, name, standard_price").in("id", productIds);
      const prodMap: Record<string, { name: string; standard_price: number | null }> = {};
      for (const p of prods ?? []) prodMap[p.id] = { name: p.name, standard_price: p.standard_price };
      setAllLots(data.map(l => ({
        lot_id: l.lot_id,
        lot_number: l.lot_number,
        product_id: l.product_id,
        remaining_boxes: l.remaining_boxes,
        product_name: prodMap[l.product_id]?.name ?? "ไม่ระบุ",
        standard_price: prodMap[l.product_id]?.standard_price ?? null,
      })));
    }
    loadLots();
  }, [supabase]);

  // Set default lot number prefix on new lines when date changes
  useEffect(() => {
    if (isEdit) return;
    const prefix = getDefaultLotPrefix();
    setLines(prev => prev.map(l =>
      l.lot_number === "" || /^\d{6,8}0*\d*$/.test(l.lot_number)
        ? { ...l, lot_number: prefix + "01" }
        : l
    ));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isEdit) return;
    async function fetchPreview() {
      const ymKey = getYearMonthKey(orderDate);
      const { count } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .like("order_number", `${ymKey}-%`);
      setPreviewOrderNumber(makeOrderNumber(ymKey, (count ?? 0) + 1));
    }
    fetchPreview();
  }, [orderDate, supabase, isEdit]);

  function getFilteredLots(lineId: string, typed: string): LotOption[] {
    if (!typed.trim()) return [];
    const usedLotIds = lines.filter(l => l.id !== lineId && l.lot_id).map(l => l.lot_id!);
    return allLots
      .filter(l => l.lot_number.includes(typed) && !usedLotIds.includes(l.lot_id))
      .slice(0, 8);
  }

  function selectLot(lineId: string, lot: LotOption) {
    setLines(prev => prev.map(l => {
      if (l.id !== lineId) return l;
      const sp = lot.standard_price;
      return {
        ...l,
        lot_number: lot.lot_number,
        lot_id: lot.lot_id,
        product_name: lot.product_name,
        standard_price: sp,
        remaining_boxes: lot.remaining_boxes,
        unit_price: l.unit_price || (sp != null ? String(sp) : ""),
        is_price_adjusted: l.unit_price ? (sp != null && parseFloat(l.unit_price) !== sp) : false,
        error: undefined,
      };
    }));
    setDropdownState(prev => ({ ...prev, [lineId]: { open: false, index: -1 } }));
  }

  function updateLine(id: string, field: keyof OrderLine, value: string | boolean) {
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: value };
      if (field === "lot_number") {
        updated.lot_id = undefined;
        updated.product_name = undefined;
        updated.remaining_boxes = undefined;
        updated.error = undefined;
        setDropdownState(ds => ({ ...ds, [id]: { open: true, index: -1 } }));
      }
      if (field === "unit_price") {
        updated.is_price_adjusted = updated.standard_price != null && parseFloat(value as string) !== updated.standard_price;
      }
      return updated;
    }));
  }

  function handleKeyDown(e: React.KeyboardEvent, lineId: string) {
    const ds = dropdownState[lineId];
    const matches = getFilteredLots(lineId, lines.find(l => l.id === lineId)?.lot_number ?? "");
    if (!ds?.open || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDropdownState(prev => ({ ...prev, [lineId]: { open: true, index: Math.min((ds.index ?? -1) + 1, matches.length - 1) } }));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDropdownState(prev => ({ ...prev, [lineId]: { open: true, index: Math.max((ds.index ?? 0) - 1, 0) } }));
    } else if (e.key === "Enter" && ds.index >= 0) {
      e.preventDefault();
      selectLot(lineId, matches[ds.index]);
    } else if (e.key === "Escape") {
      setDropdownState(prev => ({ ...prev, [lineId]: { open: false, index: -1 } }));
    }
  }

  function removeLine(id: string) {
    setLines(prev => prev.filter(l => l.id !== id));
  }

  function getLotQuantityError(line: OrderLine): string | null {
    if (!line.lot_id || !line.remaining_boxes) return null;
    const baseRemaining = isEdit
      ? (line.remaining_boxes + (editOrder?.lines.find(l => l.lot_id === line.lot_id)?.quantity ?? 0))
      : line.remaining_boxes;
    const combinedQty = lines.filter(l => l.lot_id === line.lot_id).reduce((sum, l) => sum + (parseInt(l.quantity) || 0), 0);
    if (combinedQty > baseRemaining) return `เกินจำนวนคงเหลือในล็อต (เหลือ ${line.remaining_boxes} กล่อง)`;
    return null;
  }

  const grandTotal = lines.reduce((sum, l) => sum + (parseInt(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), 0);
  const totalBoxes = lines.reduce((sum, l) => sum + (parseInt(l.quantity) || 0), 0);

  async function handleSave() {
    setSaveError(null);
    if (!customerId && !newCustomerName.trim()) return setSaveError("กรุณาเลือกหรือกรอกชื่อลูกค้า");
    if (lines.length === 0) return setSaveError("กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ");
    if (isPaid && !paymentChannelId) return setSaveError("กรุณาเลือกช่องทางการชำระเงิน");
    for (const l of lines) {
      if (!l.lot_id) return setSaveError(`ล็อต "${l.lot_number}" ไม่ถูกต้อง กรุณาเลือกจากรายการ`);
      if (!l.quantity || parseInt(l.quantity) < 1) return setSaveError("กรุณากรอกจำนวนกล่องให้ครบ");
      if (!l.unit_price || parseFloat(l.unit_price) < 0) return setSaveError("กรุณากรอกราคาให้ครบ");
      const qErr = getLotQuantityError(l);
      if (qErr) return setSaveError(qErr);
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      let resolvedCustomerId = customerId;
      if (!customerId && newCustomerName.trim()) {
        const { data: nc, error: ncErr } = await supabase.from("customers").insert({ name: newCustomerName.trim() }).select("id").single();
        if (ncErr) throw new Error("เพิ่มลูกค้าใหม่ไม่สำเร็จ: " + ncErr.message);
        resolvedCustomerId = nc.id;
      }

      const linePayloads = lines.map(l => ({
        lot_id: l.lot_id!,
        quantity: parseInt(l.quantity),
        unit_price: parseFloat(l.unit_price),
        is_price_adjusted: l.is_price_adjusted,
      }));

      if (isEdit && editOrder) {
        // Delete old lines and insert new ones
        await supabase.from("order_lines").delete().eq("order_id", editOrder.id);
        const { error: linesErr } = await supabase.from("order_lines").insert(linePayloads.map(l => ({ ...l, order_id: editOrder.id })));
        if (linesErr) throw new Error("บันทึกรายการสินค้าไม่สำเร็จ: " + linesErr.message);
        const { error: orderErr } = await supabase.from("orders").update({
          order_date: orderDate,
          customer_id: resolvedCustomerId,
          is_paid: isPaid,
          payment_channel_id: isPaid ? paymentChannelId : null,
          bill_company: billCompany,
          bill_cash: billCash,
          note: note.trim() || null,
        }).eq("id", editOrder.id);
        if (orderErr) throw new Error("บันทึกออเดอร์ไม่สำเร็จ: " + orderErr.message);
        await supabase.from("change_history").insert({
          user_id: user?.id, user_email: user?.email,
          action: "edit", entity_type: "order",
          entity_id: editOrder.id, entity_label: editOrder.order_number,
          after_data: { date: orderDate, customerId: resolvedCustomerId, lines: linePayloads, isPaid, billCompany, billCash },
        });
        router.push(`/orders/${editOrder.id}`);
      } else {
        const ymKey = getYearMonthKey(orderDate);
        const { count } = await supabase.from("orders").select("*", { count: "exact", head: true }).like("order_number", `${ymKey}-%`);
        const seq = (count ?? 0) + 1;
        const orderNumber = makeOrderNumber(ymKey, seq);
        const { data: order, error: orderErr } = await supabase.from("orders").insert({
          order_number: orderNumber,
          order_date: orderDate,
          customer_id: resolvedCustomerId,
          is_paid: isPaid,
          payment_channel_id: isPaid ? paymentChannelId : null,
          bill_company: billCompany,
          bill_cash: billCash,
          note: note.trim() || null,
          created_by: user?.id,
        }).select("id").single();
        if (orderErr) throw new Error("บันทึกออเดอร์ไม่สำเร็จ: " + orderErr.message);
        const { error: linesErr } = await supabase.from("order_lines").insert(linePayloads.map(l => ({ ...l, order_id: order.id })));
        if (linesErr) throw new Error("บันทึกรายการสินค้าไม่สำเร็จ: " + linesErr.message);
        await supabase.from("change_history").insert({
          user_id: user?.id, user_email: user?.email,
          action: "create", entity_type: "order",
          entity_id: order.id, entity_label: orderNumber,
          after_data: { orderNumber, date: orderDate, customerId: resolvedCustomerId, lines: linePayloads, isPaid, billCompany, billCash },
        });
        router.push(`/orders/${order.id}`);
      }
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">{isEdit ? `แก้ไขออเดอร์ ${editOrder?.order_number}` : "บันทึกออเดอร์ใหม่"}</h1>
        {!isEdit && previewOrderNumber && (
          <div className="text-sm text-gray-500">
            เลขออเดอร์: <span className="font-semibold text-blue-600">{previewOrderNumber}</span>
          </div>
        )}
      </div>

      {/* Header info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">วันที่</label>
            <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
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
            const matches = getFilteredLots(line.id, line.lot_number);
            const ds = dropdownState[line.id];
            return (
              <div key={line.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                <div className="flex items-start gap-2">
                  <span className="text-xs text-gray-400 mt-3 w-5 text-right shrink-0">{idx + 1}</span>
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-4 gap-2">
                    {/* Lot number with typeahead */}
                    <div className="relative">
                      <label className="text-xs text-gray-500">เลขล็อต</label>
                      <input
                        value={line.lot_number}
                        onChange={e => updateLine(line.id, "lot_number", e.target.value)}
                        onKeyDown={e => handleKeyDown(e, line.id)}
                        onFocus={() => setDropdownState(ds2 => ({ ...ds2, [line.id]: { open: true, index: -1 } }))}
                        onBlur={() => setTimeout(() => setDropdownState(ds2 => ({ ...ds2, [line.id]: { open: false, index: -1 } })), 150)}
                        placeholder="พิมพ์เลขล็อต"
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                      {ds?.open && matches.length > 0 && (
                        <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {matches.map((lot, i) => (
                            <div
                              key={lot.lot_id}
                              onMouseDown={() => selectLot(line.id, lot)}
                              className={`px-3 py-2 text-xs cursor-pointer flex items-center justify-between gap-2 ${i === ds.index ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50"}`}
                            >
                              <span className="font-mono">{lot.lot_number}</span>
                              <span className="text-gray-500 truncate">{lot.product_name}</span>
                              <span className="shrink-0 text-green-600">เหลือ {lot.remaining_boxes}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {ds?.open && line.lot_number.trim() && matches.length === 0 && !line.lot_id && (
                        <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs text-gray-400">
                          ไม่พบล็อตที่ตรงกัน
                        </div>
                      )}
                    </div>

                    {/* Product info */}
                    <div>
                      <label className="text-xs text-gray-500">สินค้า</label>
                      <div className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white min-h-[34px] flex items-center">
                        {line.product_name ? (
                          <span className="text-gray-700">{line.product_name}</span>
                        ) : (
                          <span className="text-gray-400 text-xs">เลือกล็อต</span>
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
                      <input type="number" min={1} value={line.quantity} onChange={e => updateLine(line.id, "quantity", e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    </div>

                    {/* Price */}
                    <div>
                      <label className="text-xs text-gray-500">
                        ราคา/กล่อง
                        {line.is_price_adjusted && line.standard_price != null && (
                          <span className="ml-1 text-orange-500">(ปรับราคา ปกติ {formatBaht(line.standard_price)})</span>
                        )}
                      </label>
                      <input type="number" min={0} step={0.01} value={line.unit_price} onChange={e => updateLine(line.id, "unit_price", e.target.value)}
                        className={`w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${line.is_price_adjusted ? "border-orange-400 bg-orange-50" : "border-gray-300"}`} />
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
        <button onClick={() => {
          const prefix = getDefaultLotPrefix();
          setLines(prev => [...prev, { ...newLine(), lot_number: prefix + "01" }]);
        }} className="mt-3 text-sm text-blue-600 hover:text-blue-800">+ เพิ่มรายการ</button>
      </div>

      {/* Payment & bill type */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
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
            <div className="flex gap-4 pt-1">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={billCompany} onChange={e => setBillCompany(e.target.checked)} className="w-4 h-4" />
                บิลบริษัท
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={billCash} onChange={e => setBillCash(e.target.checked)} className="w-4 h-4" />
                บิลเงินสด
              </label>
            </div>
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
          {saving ? "กำลังบันทึก..." : isEdit ? "บันทึกการแก้ไข" : "บันทึกออเดอร์"}
        </button>
        <button onClick={() => router.back()}
          className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors">
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
