"use client";
import { useRef } from "react";
import { formatDateTH } from "@/lib/utils";
import { exportAsA4Png, todayString } from "@/lib/exportImage";

interface ProductRow {
  product_id: string;
  name: string;
  total_remaining: number;
  low_stock_threshold: number | null;
  receivedToday: number;
  soldToday: number;
}

export default function StockReportClient({ rows, today }: { rows: ProductRow[]; today: string }) {
  const contentRef = useRef<HTMLDivElement>(null);

  async function handleExport() {
    if (!contentRef.current) return;
    await exportAsA4Png(contentRef.current, `รายงานสต็อค_${todayString()}.png`);
  }

  const totalRemaining = rows.reduce((s, p) => s + p.total_remaining, 0);
  const totalReceived = rows.reduce((s, p) => s + p.receivedToday, 0);
  const totalSold = rows.reduce((s, p) => s + p.soldToday, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">รายงานสต็อควันนี้</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{formatDateTH(today)}</span>
          <button
            onClick={handleExport}
            data-export-hidden="true"
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            ดาวน์โหลดรูปภาพ
          </button>
        </div>
      </div>

      <div ref={contentRef} className="bg-white p-6 rounded-xl">
        {/* Header for export */}
        <div className="mb-5">
          <div className="text-xl font-bold text-gray-800">รายงานสต็อควันนี้</div>
          <div className="text-sm text-gray-500">{formatDateTH(today)}</div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-400 mb-1">รับเข้าวันนี้</div>
            <div className="text-2xl font-bold text-green-600">{totalReceived.toLocaleString()}</div>
            <div className="text-xs text-gray-400">กล่อง</div>
          </div>
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-400 mb-1">ขายออกวันนี้</div>
            <div className="text-2xl font-bold text-red-500">{totalSold.toLocaleString()}</div>
            <div className="text-xs text-gray-400">กล่อง</div>
          </div>
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-400 mb-1">จำนวนสินค้า</div>
            <div className="text-2xl font-bold text-gray-700">{rows.length}</div>
            <div className="text-xs text-gray-400">รายการ</div>
          </div>
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-400 mb-1">สินค้าหมด</div>
            <div className="text-2xl font-bold text-orange-500">{rows.filter(p => p.total_remaining <= 0).length}</div>
            <div className="text-xs text-gray-400">รายการ</div>
          </div>
        </div>

        {/* Detail table */}
        <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="text-left px-4 py-3 font-medium">สินค้า</th>
              <th className="text-right px-4 py-3 font-medium">สต็อคคงเหลือ</th>
              <th className="text-right px-4 py-3 font-medium">รับเข้าวันนี้</th>
              <th className="text-right px-4 py-3 font-medium">ขายออกวันนี้</th>
              <th className="text-center px-4 py-3 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(p => {
              const isEmpty = p.total_remaining <= 0;
              const isLow = !isEmpty && p.low_stock_threshold != null && p.total_remaining <= p.low_stock_threshold;
              return (
                <tr key={p.product_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-right font-semibold">{p.total_remaining.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-green-600">{p.receivedToday > 0 ? `+${p.receivedToday}` : "-"}</td>
                  <td className="px-4 py-3 text-right text-red-500">{p.soldToday > 0 ? p.soldToday.toLocaleString() : "-"}</td>
                  <td className="px-4 py-3 text-center">
                    {isEmpty ? (
                      <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">หมดแล้ว</span>
                    ) : isLow ? (
                      <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">ใกล้หมด</span>
                    ) : (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">ปกติ</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50 font-semibold">
            <tr>
              <td className="px-4 py-3 text-gray-600">รวม</td>
              <td className="px-4 py-3 text-right">{totalRemaining.toLocaleString()}</td>
              <td className="px-4 py-3 text-right text-green-600">{totalReceived > 0 ? `+${totalReceived}` : "-"}</td>
              <td className="px-4 py-3 text-right text-red-500">{totalSold > 0 ? totalSold.toLocaleString() : "-"}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
