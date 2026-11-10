export interface Product {
  id: string;
  name: string;
  standard_price: number | null;
  low_stock_threshold: number | null;
  sort_order: number | null;
  deleted_at: string | null;
  created_at: string;
}

export interface Lot {
  id: string;
  lot_number: string;
  product_id: string;
  date_received: string;
  boxes_received: number;
  deleted_at: string | null;
  created_at: string;
  product?: Product;
  remaining_boxes?: number;
}

export interface LotRemaining {
  lot_id: string;
  lot_number: string;
  product_id: string;
  date_received: string;
  boxes_received: number;
  deleted_at: string | null;
  boxes_sold: number;
  adjustment_total: number;
  remaining_boxes: number;
  product?: Product;
}

export interface Customer {
  id: string;
  name: string;
  deleted_at: string | null;
  created_at: string;
}

export interface PaymentChannel {
  id: string;
  name: string;
  deleted_at: string | null;
  created_at: string;
}

export interface OrderLine {
  id: string;
  order_id: string;
  lot_id: string;
  quantity: number;
  unit_price: number;
  is_price_adjusted: boolean;
  created_at: string;
  lot?: Lot;
}

export interface Order {
  id: string;
  order_number: string;
  order_date: string;
  customer_id: string;
  is_paid: boolean;
  payment_channel_id: string | null;
  note: string | null;
  deleted_at: string | null;
  created_at: string;
  created_by: string | null;
  customer?: Customer;
  payment_channel?: PaymentChannel;
  order_lines?: OrderLine[];
  total?: number;
}

export interface StockAdjustment {
  id: string;
  lot_id: string;
  quantity: number;
  reason: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  lot?: Lot;
  user_email?: string;
}

export interface ChangeHistory {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  extra: Record<string, unknown> | null;
  created_at: string;
}

export interface ProductStock {
  product_id: string;
  name: string;
  standard_price: number | null;
  low_stock_threshold: number | null;
  sort_order: number | null;
  total_remaining: number;
}

export const ADJUSTMENT_REASONS: Record<string, string> = {
  damaged: "สินค้าเสียหาย/สูญหาย",
  return: "ลูกค้าคืนสินค้า",
  sample: "ตัวอย่าง/ของแถม",
  correction: "ตรวจนับสต็อค",
  other: "อื่นๆ",
};
