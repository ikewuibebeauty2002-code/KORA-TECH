import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createInitialDatabaseState, type DatabaseState } from './seedData.ts';
import type { Order, Product } from '../src/types/ecommerce';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'koratech-db.json');

let supabaseAdmin: SupabaseClient | null = null;

export function normalizeSupabaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/^["']|["']$/g, '');
  if (!trimmed) return '';
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withProto);
    if (u.hostname === 'supabase.com' || u.hostname === 'app.supabase.com') {
      const m = u.pathname.match(/\/project\/([a-z0-9]+)/i);
      if (m) return `https://${m[1]}.supabase.co`;
    }
    return u.origin;
  } catch {
    return trimmed;
  }
}

export function getSupabaseAdmin(): SupabaseClient | null {
  const rawUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const url = normalizeSupabaseUrl(rawUrl);
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceKey) return null;
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return supabaseAdmin;
}

export function isSupabaseConfigured(): boolean {
  const rawUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  return Boolean(normalizeSupabaseUrl(rawUrl) && (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim());
}

// Promise-chain mutex ensures atomic stock reservations/deductions with zero race conditions
let writeQueue: Promise<unknown> = Promise.resolve();

export function withStoreLock<T>(fn: (db: DatabaseState) => Promise<T> | T): Promise<T> {
  const next = writeQueue.then(async () => {
    const db = loadDb();
    const result = await fn(db);
    saveDb(db);
    return result;
  });
  writeQueue = next.catch(() => {});
  return next;
}

export function loadDb(): DatabaseState {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initial = createInitialDatabaseState();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw) as DatabaseState;
  } catch {
    const initial = createInitialDatabaseState();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
}

export function saveDb(db: DatabaseState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DB_FILE}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
}

export function enrichProductCategories(product: Product, db: DatabaseState): Product {
  const cat = db.categories.find((c) => c.id === product.category_id);
  const sub = product.subcategory_id
    ? db.categories.find((c) => c.id === product.subcategory_id)
    : undefined;
  return {
    ...product,
    category_name: cat?.name || product.category_name || '',
    category_slug: cat?.slug || product.category_slug || '',
    subcategory_name: sub?.name || product.subcategory_name || '',
    subcategory_slug: sub?.slug || product.subcategory_slug || '',
  };
}

export function deductStockAtomic(db: DatabaseState, order: Order): { ok: boolean; error?: string } {
  if (order.stock_deducted) {
    return { ok: true };
  }

  // First pass: verify stock for every line item before mutating
  for (const item of order.items) {
    if (!item.product_id) continue;
    const product = db.products.find((p) => p.id === item.product_id);
    if (!product) {
      return { ok: false, error: `Product no longer exists: ${item.product_name}` };
    }
    if (item.variant_id) {
      const variant = product.variants.find((v) => v.id === item.variant_id);
      if (!variant || variant.stock_quantity < item.quantity) {
        return {
          ok: false,
          error: `Insufficient stock for ${item.product_name} (${item.selected_variant})`,
        };
      }
    } else if (product.stock_quantity < item.quantity) {
      return {
        ok: false,
        error: `Insufficient stock for ${item.product_name}`,
      };
    }
  }

  // Second pass: deduct stock atomically
  for (const item of order.items) {
    if (!item.product_id) continue;
    const product = db.products.find((p) => p.id === item.product_id);
    if (!product) continue;
    if (item.variant_id) {
      const variant = product.variants.find((v) => v.id === item.variant_id);
      if (variant) {
        variant.stock_quantity = Math.max(0, variant.stock_quantity - item.quantity);
      }
      product.stock_quantity = Math.max(
        0,
        product.variants.reduce((sum, v) => sum + v.stock_quantity, 0),
      );
    } else {
      product.stock_quantity = Math.max(0, product.stock_quantity - item.quantity);
    }
    product.sales_count += item.quantity;
    product.updated_at = new Date().toISOString();
  }

  order.stock_deducted = true;
  order.payment_status = 'paid';
  if (order.status === 'Pending Payment') {
    order.status = 'Paid';
  }
  order.updated_at = new Date().toISOString();
  return { ok: true };
}

export function restoreStockAtomic(db: DatabaseState, order: Order): void {
  if (!order.stock_deducted || order.stock_restored) {
    return;
  }

  for (const item of order.items) {
    if (!item.product_id) continue;
    const product = db.products.find((p) => p.id === item.product_id);
    if (!product) continue;
    if (item.variant_id) {
      const variant = product.variants.find((v) => v.id === item.variant_id);
      if (variant) {
        variant.stock_quantity += item.quantity;
      }
      product.stock_quantity = product.variants.reduce((sum, v) => sum + v.stock_quantity, 0);
    } else {
      product.stock_quantity += item.quantity;
    }
    product.updated_at = new Date().toISOString();
  }

  order.stock_restored = true;
  order.updated_at = new Date().toISOString();
}
