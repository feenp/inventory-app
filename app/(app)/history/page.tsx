"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTH } from "@/lib/utils";
import type { ChangeHistory } from "@/lib/types";

const ENTITY_LABELS: Record<string, string> = {
  order: "ออเดอร์", lot: "ล็อต", product: "สินค้า",
  customer: "ลูกค้า", stock_adjustment: "ปรับสต็อค", payment_channel: "ช่องทางชำระ",
};

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  create: { label: "สร้างใหม่", color: "bg-green-100 text-green-700" },
  edit: { label: "แก้ไข", color: "bg-blue-100 text-blue-700" },
  delete: { label: "ลบ", color: "bg-red-100 text-red-600" },
};

export default function HistoryPage() {
  const supabase = createClient();
  const [history, setHistory] = useState<ChangeHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ChangeHistory | null>(null);

  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterAction, setFilterAction] = useState("");

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("change_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (filterType) query = query.eq("entity_type", filterType);
    if (filterAction) query = query.eq("action", filterAction);
    if (filterDateFrom) query = query.gte("created_at", filterDateFrom);
    if (filterDateTo) query = query.lte("created_at", filterDateTo + "T23:59:59");

    const { data } = await query;
    setHistory((data ?? []) as ChangeHistory[]);
    setLoading(false);
  }, [supabase, filterType, filterAction, filterDateFrom, filterDateTo]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">ประวัติการแก้ไข</h1>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option value="">ทุกประเภท</option>
            {Object.entries(ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option value="">ทุกการกระทำ</option>
            <option value="create">สร้างใหม่</option>
            <option value="edit">แก้ไข</option>
            <option value="delete">ลบ</option>
          </select>
          <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* List */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400">กำลังโหลด...</div>
          ) : history.length === 0 ? (
            <div className="p-8 text-center text-gray-400">ไม่พบประวัติ</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">เวลา</th>
                  <th className="text-left px-4 py-3 font-medium">ผู้ใช้</th>
                  <th className="text-left px-4 py-3 font-medium">ประเภท</th>
                  <th className="text-left px-4 py-3 font-medium">รายการ</th>
                  <th className="text-left px-4 py-3 font-medium">การกระทำ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map(h => {
                  const act = ACTION_LABELS[h.action];
                  const d = new Date(h.created_at);
                  return (
                    <tr key={h.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(h)}>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {formatDateTH(d)}<br />
                        {d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs truncate max-w-24">{h.user_email ?? "-"}</td>
                      <td className="px-4 py-3 text-gray-600">{ENTITY_LABELS[h.entity_type] ?? h.entity_type}</td>
                      <td className="px-4 py-3 font-mono text-gray-600 text-xs">{h.entity_label ?? "-"}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${act?.color ?? "bg-gray-100 text-gray-600"}`}>
                          {act?.label ?? h.action}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail */}
        <div>
          {selected ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ACTION_LABELS[selected.action]?.color ?? ""}`}>
                  {ACTION_LABELS[selected.action]?.label ?? selected.action}
                </span>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">×</button>
              </div>
              <div className="text-sm space-y-2">
                <div><span className="text-gray-400">ผู้ใช้:</span> <span className="font-medium">{selected.user_email ?? "-"}</span></div>
                <div><span className="text-gray-400">เวลา:</span> <span>{new Date(selected.created_at).toLocaleString("th-TH")}</span></div>
                <div><span className="text-gray-400">รายการ:</span> <span className="font-mono">{selected.entity_label ?? "-"}</span></div>
                {selected.extra?.return_stock != null && (
                  <div><span className="text-gray-400">คืนสต็อค:</span> <span className="font-medium">{selected.extra.return_stock ? "ใช่" : "ไม่"}</span></div>
                )}
              </div>
              {selected.before_data && (
                <div className="mt-3">
                  <div className="text-xs font-medium text-gray-500 mb-1">ก่อนแก้ไข</div>
                  <pre className="text-xs bg-red-50 text-red-800 p-2 rounded-lg overflow-auto max-h-40">{JSON.stringify(selected.before_data, null, 2)}</pre>
                </div>
              )}
              {selected.after_data && (
                <div className="mt-2">
                  <div className="text-xs font-medium text-gray-500 mb-1">หลังแก้ไข</div>
                  <pre className="text-xs bg-green-50 text-green-800 p-2 rounded-lg overflow-auto max-h-40">{JSON.stringify(selected.after_data, null, 2)}</pre>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-400 text-sm">
              คลิกที่รายการเพื่อดูรายละเอียด
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
