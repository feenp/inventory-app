"use client";
import { useState, useRef, useEffect } from "react";

export interface ColDef {
  key: string;
  label: string;
}

interface Props {
  columns: ColDef[];
  order: string[];
  onChange: (newOrder: string[]) => void;
  onReset: () => void;
}

export default function ColumnOrderPicker({ columns, order, onChange, onReset }: Props) {
  const [open, setOpen] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const orderedCols = order
    .map(key => columns.find(c => c.key === key))
    .filter((c): c is ColDef => !!c);

  function handleDrop(dropIdx: number) {
    if (dragIdx === null || dragIdx === dropIdx) {
      setDragIdx(null); setOverIdx(null); return;
    }
    const newOrder = [...order];
    const [moved] = newOrder.splice(dragIdx, 1);
    newOrder.splice(dropIdx, 0, moved);
    onChange(newOrder);
    setDragIdx(null); setOverIdx(null);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="จัดเรียงคอลัมน์"
        className={`p-1.5 rounded-lg transition-colors ${open ? "bg-blue-100 text-blue-600" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"}`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-xl shadow-xl p-3 w-52">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-bold text-gray-600">จัดเรียงคอลัมน์</span>
            <button
              onClick={() => { onReset(); setOpen(false); }}
              className="text-xs text-blue-500 hover:text-blue-700 font-medium"
            >
              รีเซ็ต
            </button>
          </div>
          <div className="space-y-1">
            {orderedCols.map((col, idx) => (
              <div
                key={col.key}
                draggable
                onDragStart={() => setDragIdx(idx)}
                onDragOver={e => { e.preventDefault(); setOverIdx(idx); }}
                onDrop={() => handleDrop(idx)}
                onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-grab select-none text-sm transition-colors ${
                  overIdx === idx && dragIdx !== idx
                    ? "bg-blue-50 border border-blue-300"
                    : "bg-gray-50 border border-transparent hover:bg-gray-100"
                } ${dragIdx === idx ? "opacity-40" : ""}`}
              >
                <span className="text-gray-400 text-base leading-none">⋮⋮</span>
                <span className="text-gray-800 font-medium">{col.label}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">ลากเพื่อจัดเรียงใหม่</p>
        </div>
      )}
    </div>
  );
}
