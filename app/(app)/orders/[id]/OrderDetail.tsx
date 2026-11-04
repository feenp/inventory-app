"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatBaht, formatDateTH } from "@/lib/utils";

interface OrderLine {
  id: string;
  lot_id: string;
  quantity: number;
  unit_price: number;
  is_price_adjusted: boolean;
  lot: { lot_number: string; product: { name: string; standard_price: number | null } | null } | null;
}

interface Order {
  id: string;
  order_number: string;
  order_date: string;
  is_paid: boolean;
  payment_channel_id: string | null;
  bill_company: boolean;
  bill_cash: boolean;
  note: string | null;
  customer: { id: string; name: string } | null;
  payment_channel: { name: string } | null;
  order_lines: OrderLine[];
}

export default function OrderDetail({ order, paymentChannels, customers }: {
  order: Order;
  paymentChannels: { id: string; name: string }[];
  customers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [isPaid, setIsPaid] = useState(order.is_paid);
  const [paymentChannelId, setPaymentChannelId] = useState(order.payment_channel_id ?? "");
  const [note, setNote] = useState(order.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [returnStockOnDelete, setReturnStockOnDelete] = useState<boolean | null>(null);
  const [deleting, setDeleting] = useState(false);

  const total = order.order_lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const boxes = order.order_lines.reduce((s, l) => s + l.quantity, 0);

  async function handleSavePayment() {
    if (isPaid && !paymentChannelId) return setError("กรุณาเลือกช่องทางการชำระเงิน");
    setSaving(true); setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    const before = { is_paid: order.is_paid, payment_channel_id: order.payment_channel_id, note: order.note };
    const { error: e } = await supabase.from("orders").update({
      is_paid: isPaid,
      payment_channel_id: isPaid ? paymentChannelId : null,
      note: note.trim() || null,
    }).eq("id", order.id);
    if (e) { setError(e.message); setSaving(false); return; }
    await supabase.from("change_history").insert({
      user_id: user?.id, user_email: user?.email,
      action: "edit", entity_type: "order",
      entity_id: order.id, entity_label: order.order_number,
      before_data: before,
      after_data: { is_paid: isPaid, payment_channel_id: isPaid ? paymentChannelId : null, note: note.trim() || null },
    });
    setSaving(false);
    router.refresh();
  }

  async function handleDelete() {
    if (returnStockOnDelete === null) return setError("กรุณาเลือกว่าจะคืนสต็อคหรือไม่");
    setDeleting(true); setError(null);
    const { data: { user } } = await supabase.auth.getUser();

    if (returnStockOnDelete) {
      // Stock is returned automatically because order is soft-deleted and view excludes deleted orders
    }

    const { error: e } = await supabase.from("orders").update({ deleted_at: new Date().toISOString() }).eq("id", order.id);
    if (e) { setError(e.message); setDeleting(false); return; }

    await supabase.from("change_history").insert({
      user_id: user?.id, user_email: user?.email,
      action: "delete", entity_type: "order",
      entity_id: order.id, entity_label: order.order_number,
      before_data: { order_number: order.order_number, is_paid: order.is_paid },
      extra: { return_stock: returnStockOnDelete },
    });

    router.push("/orders");
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">← กลับ</button>
        <h1 className="text-2xl font-bold text-gray-800">ออเดอร์ {order.order_number}</h1>
        <span className={`text-sm px-3 py-1 rounded-full font-medium ${order.is_paid ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
          {order.is_paid ? "ชำระแล้ว" : "ค้างชำระ"}
        </span>
        <a href={`/orders/${order.id}/edit`} className="ml-auto text-sm px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-medium transition-colors">
          แก้ไขออเดอร์
        </a>
      </div>

      {/* Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><div className="text-gray-400 text-xs mb-1">วันที่</div><div className="font-medium">{formatDateTH(order.order_date)}</div></div>
          <div><div className="text-gray-400 text-xs mb-1">ลูกค้า</div><div className="font-medium">{order.customer?.name}</div></div>
          <div><div className="text-gray-400 text-xs mb-1">ช่องทางชำระ</div><div className="font-medium">{order.payment_channel?.name ?? "-"}</div></div>
          <div><div className="text-gray-400 text-xs mb-1">หมายเหตุ</div><div className="font-medium">{order.note ?? "-"}</div></div>
          <div>
            <div className="text-gray-400 text-xs mb-1">บิล</div>
            <div className="font-medium text-sm flex gap-2">
              {order.bill_company && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">บริษัท</span>}
              {order.bill_cash && <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs">เงินสด</span>}
              {!order.bill_company && !order.bill_cash && <span className="text-gray-400">-</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Lines */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-left px-4 py-3 font-medium">เลขล็อต</th>
              <th className="text-left px-4 py-3 font-medium">สินค้า</th>
              <th className="text-right px-4 py-3 font-medium">จำนวน</th>
              <th className="text-right px-4 py-3 font-medium">ราคา/กล่อง</th>
              <th className="text-right px-4 py-3 font-medium">รวม</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {order.order_lines.map(l => (
              <tr key={l.id}>
                <td className="px-4 py-3 font-mono text-gray-600">{l.lot?.lot_number}</td>
                <td className="px-4 py-3">
                  {l.lot?.product?.name}
                  {l.is_price_adjusted && (
                    <span className="ml-2 text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">ปรับราคา</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">{l.quantity.toLocaleString()}</td>
                <td className="px-4 py-3 text-right">
                  ฿{formatBaht(l.unit_price)}
                  {l.is_price_adjusted && l.lot?.product?.standard_price != null && (
                    <div className="text-xs text-gray-400">ปกติ ฿{formatBaht(l.lot.product.standard_price)}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-semibold">฿{formatBaht(l.quantity * l.unit_price)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50">
            <tr>
              <td colSpan={2} className="px-4 py-3 text-sm text-gray-500">{boxes} กล่อง</td>
              <td colSpan={3} className="px-4 py-3 text-right font-bold text-base">รวม ฿{formatBaht(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Edit payment/note */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h2 className="font-semibold text-gray-700 mb-4">แก้ไขการชำระ / หมายเหตุ</h2>
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
        {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
        <div className="mt-4 flex gap-3">
          <button onClick={handleSavePayment} disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </div>

      {/* Delete */}
      <div className="bg-white rounded-xl border border-red-100 p-5">
        <h2 className="font-semibold text-red-600 mb-2">ลบออเดอร์</h2>
        {!showDeleteConfirm ? (
          <button onClick={() => setShowDeleteConfirm(true)}
            className="text-sm text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 px-4 py-2 rounded-lg transition-colors">
            ลบออเดอร์นี้
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-700 font-medium">ต้องการคืนสต็อคกลับไปยังล็อตหรือไม่?</p>
            <p className="text-xs text-gray-500">การลบออเดอร์จะทำให้ไม่แสดงในระบบ แต่ข้อมูลยังคงอยู่ในประวัติ</p>
            <div className="flex gap-3">
              <button
                onClick={() => setReturnStockOnDelete(true)}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${returnStockOnDelete === true ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 hover:border-blue-400"}`}>
                คืนสต็อค
              </button>
              <button
                onClick={() => setReturnStockOnDelete(false)}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${returnStockOnDelete === false ? "bg-gray-600 text-white border-gray-600" : "border-gray-300 hover:border-gray-400"}`}>
                ไม่คืนสต็อค
              </button>
            </div>
            {returnStockOnDelete !== null && (
              <div className="flex gap-3 pt-1">
                <button onClick={handleDelete} disabled={deleting}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                  {deleting ? "กำลังลบ..." : "ยืนยันการลบ"}
                </button>
                <button onClick={() => { setShowDeleteConfirm(false); setReturnStockOnDelete(null); }}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">ยกเลิก</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
