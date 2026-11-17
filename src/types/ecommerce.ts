export type UserRole = 'customer' | 'admin' | 'super_admin';

export type OrderStatus =
  | 'Pending Payment'
  | 'Paid'
  | 'Processing'
  | 'Ready for Delivery'
  | 'Shipped'
  | 'Delivered'
  | 'Cancelled'
  | 'Refunded';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'abandoned' | 'refunded';

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  whatsapp_number: string;
  role: UserRole;
  created_at: string;
}

export interface Address {
  id: string;
  user_id: string;
  label: string;
  full_name: string;
  phone: string;
  whatsapp_number: string;
  street_address: string;
  city: string;
  state: string;
  additional_info: string;
  is_default: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  image_url: string;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  alt_text: string;
  is_primary: boolean;
  sort_order: number;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  sku_suffix: string;
  color: string;
  price_ngn: number;
  original_price_ngn: number | null;
  stock_quantity: number;
  is_active: boolean;
}

export interface InventoryRecord {
  id: string;
  product_id: string;
  stock_quantity: number;
  reserved_quantity: number;
  low_stock_threshold: number;
  updated_at: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  slug: string;
  brand: string;
  category_id: string;
  subcategory_id: string | null;
  category_name?: string;
  category_slug?: string;
  subcategory_name?: string;
  subcategory_slug?: string;
  short_description: string;
  description: string;
  price_ngn: number;
  original_price_ngn: number | null;
  colors: string[];
  specifications: Record<string, string>;
  features: string[];
  is_featured: boolean;
  is_best_seller: boolean;
  is_trending: boolean;
  is_new_arrival: boolean;
  is_recommended: boolean;
  is_published: boolean;
  rating_avg: number;
  review_count: number;
  sales_count: number;
  stock_quantity: number;
  low_stock_threshold: number;
  images: ProductImage[];
  variants: ProductVariant[];
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  id: string;
  product_id: string;
  variant_id: string | null;
  selected_color: string;
  quantity: number;
  product: Product;
  variant: ProductVariant | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  product_image: string;
  selected_color: string;
  selected_variant: string;
  unit_price_ngn: number;
  quantity: number;
  line_total_ngn: number;
}

export interface DeliveryRecord {
  id: string;
  order_id: string;
  courier_name: string;
  tracking_number: string;
  dispatched_at: string | null;
  delivered_at: string | null;
  delivery_notes: string;
  updated_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  user_id: string | null;
  guest_token: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_whatsapp: string;
  delivery_address: string;
  delivery_city: string;
  delivery_state: string;
  delivery_notes: string;
  coupon_code: string | null;
  subtotal_ngn: number;
  delivery_fee_ngn: number;
  discount_ngn: number;
  total_ngn: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  paystack_reference: string | null;
  stock_deducted: boolean;
  stock_restored: boolean;
  items: OrderItem[];
  delivery?: DeliveryRecord | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentRecord {
  id: string;
  order_id: string;
  order_number: string;
  customer_name: string;
  reference: string;
  amount_kobo: number;
  currency: string;
  status: 'initialized' | 'success' | 'failed' | 'abandoned' | 'refunded';
  payment_method: string;
  channel: string;
  gateway_response: string;
  verified_at: string | null;
  created_at: string;
}

export interface Review {
  id: string;
  product_id: string;
  product_name?: string;
  user_id: string | null;
  order_id: string | null;
  reviewer_name: string;
  rating: number;
  title: string;
  comment: string;
  verified_purchase: boolean;
  moderation_status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface Coupon {
  id: string;
  code: string;
  description: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_order_ngn: number;
  max_discount_ngn: number | null;
  usage_limit: number | null;
  used_count: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

export interface AdminActivityLog {
  id: string;
  admin_user_id: string | null;
  admin_email: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface GatewayStatus {
  supabaseConfigured: boolean;
  supabaseTablesReady?: boolean;
  supabaseCategoryCount?: number;
  supabaseProductCount?: number;
  supabaseKeyRole?: string;
  supabaseError?: string;
  paystackConfigured: boolean;
  paystackMode: 'live' | 'test' | 'unconfigured';
  paystackPublicKey: string;
  whatsappBusinessNumber: string;
  storeName: string;
  storeEmail: string;
  storePhone: string;
  storeAddress: string;
}
