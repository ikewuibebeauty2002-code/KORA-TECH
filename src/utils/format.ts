import type { Order } from '../types/ecommerce';
import { DEFAULT_STORE_CONFIG } from '../config/storeConfig';

export function formatNaira(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `₦${Math.round(safe).toLocaleString('en-NG')}`;
}

export function formatPlainNumber(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return Math.round(safe).toLocaleString('en-NG');
}

export function getDiscountPercent(price: number, originalPrice: number | null | undefined): number {
  if (!originalPrice || originalPrice <= price) return 0;
  return Math.round(((originalPrice - price) / originalPrice) * 100);
}

export function sanitizeWhatsappNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) {
    return `234${digits.slice(1)}`;
  }
  return digits || DEFAULT_STORE_CONFIG.whatsappNumber;
}

export function buildOrderWhatsAppMessage(order: Order): string {
  const productLines = order.items
    .map((item) => {
      const variantDetails = [item.selected_variant, item.selected_color].filter(Boolean).join(', ');
      const suffix = variantDetails ? ` (${variantDetails})` : '';
      return `${item.product_name}${suffix} × ${item.quantity}`;
    })
    .join('\n');

  return [
    'Hello, I have made my payment for my gadgets, kindly confirm and get back to me.',
    '',
    `Customer Name: ${order.customer_name}`,
    '',
    `Order Number: ${order.order_number}`,
    '',
    'Products Purchased:',
    productLines,
    '',
    `Total Amount Paid: ₦${formatPlainNumber(order.total_ngn)}`,
    '',
    `Payment Reference: ${order.paystack_reference || 'Verified'}`,
    '',
    'Please confirm my order and provide the delivery details.',
  ].join('\n');
}

export function buildOrderWhatsAppUrl(order: Order, businessNumber?: string): string {
  const target = sanitizeWhatsappNumber(businessNumber || DEFAULT_STORE_CONFIG.whatsappNumber);
  const message = buildOrderWhatsAppMessage(order);
  return `https://wa.me/${target}?text=${encodeURIComponent(message)}`;
}

export function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
