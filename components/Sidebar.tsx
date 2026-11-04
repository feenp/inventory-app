"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "แดชบอร์ด", icon: "📊" },
  { href: "/orders/new", label: "บันทึกออเดอร์", icon: "➕" },
  { href: "/orders", label: "ออเดอร์ทั้งหมด", icon: "📋" },
  { href: "/stock", label: "สต็อคและล็อต", icon: "📦" },
  { href: "/receive", label: "รับสินค้าเข้า", icon: "📥" },
  { href: "/stock-report", label: "รายงานสต็อค", icon: "📉" },
  { href: "/customers", label: "ลูกค้า", icon: "👥" },
  { href: "/prices", label: "ราคาและสินค้า", icon: "💰" },
  { href: "/report", label: "รายงาน", icon: "📈" },
  { href: "/history", label: "ประวัติการแก้ไข", icon: "🕐" },
];

export default function Sidebar({ user }: { user: User }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col h-full shrink-0">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🐟</span>
          <div>
            <div className="font-bold text-gray-800 text-sm leading-tight">ระบบขาย-สต็อค</div>
            <div className="text-xs text-gray-400">โรงงาน</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-2 overflow-y-auto">
        {navItems.map(({ href, label, icon }) => {
          const isActive = href === "/orders"
            ? pathname === "/orders" || (pathname.startsWith("/orders/") && pathname !== "/orders/new")
            : pathname === href || (href !== "/orders/new" && pathname.startsWith(href + "/") && href !== "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                isActive
                  ? "bg-blue-50 text-blue-700 font-semibold border-r-2 border-blue-600"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <span className="text-base">{icon}</span>
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-gray-100">
        <div className="text-xs text-gray-400 truncate mb-2 px-1">{user.email}</div>
        <button
          onClick={handleSignOut}
          className="w-full text-left text-xs text-gray-500 hover:text-red-600 px-1 py-1 transition-colors"
        >
          ออกจากระบบ
        </button>
      </div>
    </aside>
  );
}
