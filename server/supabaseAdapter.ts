import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createInitialDatabaseState } from './seedData.ts';
import type {
  Address,
  AdminActivityLog,
  Category,
  Coupon,
  Order,
  OrderStatus,
  PaymentRecord,
  Product,
  Review,
} from '../src/types/ecommerce';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toUuid(input: string): string {
  if (UUID_REGEX.test(input)) return input.toLowerCase();
  const h = crypto.createHash('sha256').update(`koratech:${input}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export interface SupabaseProbeResult {
  configured: boolean;
  tablesReady: boolean;
  categoryCount: number;
  productCount: number;
  keyRole?: string;
  urlShape?: string;
  error?: string;
}

function inspectUrlShape(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const parts = u.hostname.split('.');
    const hostSuffix = parts.slice(-2).join('.');
    const pathClean = u.pathname === '/' ? '/' : u.pathname.replace(/\/project\/[^/]+/, '/project/<ref>');
    return `${u.protocol}//<host>.${hostSuffix}${pathClean}`;
  } catch {
    return 'invalid-url';
  }
}

function inspectKeyRole(key: string): string {
  try {
    if (key.startsWith('sb_secret_')) return 'service_role';
    if (key.startsWith('sb_publishable_')) return 'anon';
    const parts = key.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { role?: string };
      return payload.role || 'unknown';
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function probeSupabaseSchema(supabase: SupabaseClient | null): Promise<SupabaseProbeResult> {
  if (!supabase) {
    return { configured: false, tablesReady: false, categoryCount: 0, productCount: 0 };
  }
  const keyRole = inspectKeyRole(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
  const urlShape = inspectUrlShape(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '');
  try {
    const { count: catCount, error: catErr } = await supabase
      .from('categories')
      .select('id', { count: 'exact' })
      .limit(1);
    if (catErr) {
      return {
        configured: true,
        tablesReady: false,
        categoryCount: 0,
        productCount: 0,
        keyRole,
        urlShape,
        error: catErr.message,
      };
    }
    const { count: prodCount, error: prodErr } = await supabase
      .from('products')
      .select('id', { count: 'exact' })
      .limit(1);
    if (prodErr) {
      return {
        configured: true,
        tablesReady: false,
        categoryCount: catCount || 0,
        productCount: 0,
        keyRole,
        urlShape,
        error: prodErr.message,
      };
    }
    return {
      configured: true,
      tablesReady: true,
      categoryCount: catCount || 0,
      productCount: prodCount || 0,
      keyRole,
      urlShape,
    };
  } catch (err) {
    return {
      configured: true,
      tablesReady: false,
      categoryCount: 0,
      productCount: 0,
      keyRole,
      urlShape,
      error: String(err),
    };
  }
}

export async function seedSupabaseCatalogIfEmpty(supabase: SupabaseClient): Promise<{ seeded: boolean; error?: string }> {
  const probe = await probeSupabaseSchema(supabase);
  if (!probe.tablesReady) {
    return { seeded: false, error: probe.error || 'Supabase tables not initialized yet.' };
  }
  if (probe.productCount > 0 && probe.categoryCount > 0) {
    return { seeded: false };
  }

  const initial = createInitialDatabaseState();

  // 1. Seed categories (parents first, then children)
  const mainCats = initial.categories.filter((c) => !c.parent_id);
  const subCats = initial.categories.filter((c) => c.parent_id);

  const { error: mainCatErr } = await supabase.from('categories').upsert(
    mainCats.map((cat) => ({
      id: toUuid(cat.id),
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      image_url: cat.image_url,
      parent_id: null,
      sort_order: cat.sort_order,
      is_active: cat.is_active,
    })),
    { onConflict: 'slug' },
  );
  if (mainCatErr) {
    return { seeded: false, error: `Categories seed error (keyRole=${probe.keyRole}): ${mainCatErr.message}` };
  }

  // Fetch back real category IDs by slug
  const { data: dbCats } = await supabase.from('categories').select('id, slug');
  const slugToId = new Map((dbCats || []).map((c: { id: string; slug: string }) => [c.slug, c.id]));

  const { error: subCatErr } = await supabase.from('categories').upsert(
    subCats.map((sub) => {
      const parentOrig = initial.categories.find((c) => c.id === sub.parent_id);
      const parentUuid = parentOrig ? slugToId.get(parentOrig.slug) || toUuid(sub.parent_id!) : null;
      return {
        id: toUuid(sub.id),
        name: sub.name,
        slug: sub.slug,
        description: sub.description,
        image_url: sub.image_url,
        parent_id: parentUuid,
        sort_order: sub.sort_order,
        is_active: sub.is_active,
      };
    }),
    { onConflict: 'slug' },
  );
  if (subCatErr) {
    return { seeded: false, error: `Subcategories seed error: ${subCatErr.message}` };
  }

  const { data: allDbCats } = await supabase.from('categories').select('id, slug');
  const finalSlugToId = new Map((allDbCats || []).map((c: { id: string; slug: string }) => [c.slug, c.id]));

  // 2. Seed products + images + variants + inventory
  for (const p of initial.products) {
    const prodUuid = toUuid(p.id);
    const catOrig = initial.categories.find((c) => c.id === p.category_id);
    const subOrig = p.subcategory_id ? initial.categories.find((c) => c.id === p.subcategory_id) : null;
    const catUuid = catOrig ? finalSlugToId.get(catOrig.slug) || toUuid(p.category_id) : null;
    const subUuid = subOrig ? finalSlugToId.get(subOrig.slug) || toUuid(p.subcategory_id!) : null;

    const { error: prodErr } = await supabase.from('products').upsert(
      {
        id: prodUuid,
        sku: p.sku,
        name: p.name,
        slug: p.slug,
        brand: p.brand,
        category_id: catUuid,
        subcategory_id: subUuid,
        short_description: p.short_description,
        description: p.description,
        price_ngn: p.price_ngn,
        original_price_ngn: p.original_price_ngn,
        colors: p.colors,
        specifications: p.specifications,
        features: p.features,
        is_featured: p.is_featured,
        is_best_seller: p.is_best_seller,
        is_trending: p.is_trending,
        is_new_arrival: p.is_new_arrival,
        is_recommended: p.is_recommended,
        is_published: p.is_published,
        rating_avg: p.rating_avg,
        review_count: p.review_count,
        sales_count: p.sales_count,
      },
      { onConflict: 'slug' },
    );
    if (prodErr) {
      return { seeded: false, error: `Product upsert error (${p.slug}): ${prodErr.message}` };
    }

    await supabase.from('inventory').upsert(
      {
        product_id: prodUuid,
        stock_quantity: p.stock_quantity,
        reserved_quantity: 0,
        low_stock_threshold: p.low_stock_threshold,
      },
      { onConflict: 'product_id' },
    );

    // Clear and insert images cleanly
    await supabase.from('product_images').delete().eq('product_id', prodUuid);
    if (p.images.length > 0) {
      await supabase.from('product_images').insert(
        p.images.map((img, idx) => ({
          id: toUuid(img.id),
          product_id: prodUuid,
          image_url: img.image_url,
          alt_text: img.alt_text,
          is_primary: idx === 0,
          sort_order: idx,
        })),
      );
    }

    if (p.variants.length > 0) {
      for (const v of p.variants) {
        await supabase.from('product_variants').upsert(
          {
            id: toUuid(v.id),
            product_id: prodUuid,
            name: v.name,
            sku_suffix: v.sku_suffix,
            color: v.color,
            price_ngn: v.price_ngn,
            original_price_ngn: v.original_price_ngn,
            stock_quantity: v.stock_quantity,
            is_active: v.is_active,
          },
          { onConflict: 'id' },
        );
      }
    }
  }

  // 3. Seed coupons
  for (const c of initial.coupons) {
    await supabase.from('coupons').upsert(
      {
        id: toUuid(c.id),
        code: c.code,
        description: c.description,
        discount_type: c.discount_type,
        discount_value: c.discount_value,
        min_order_ngn: c.min_order_ngn,
        max_discount_ngn: c.max_discount_ngn,
        usage_limit: c.usage_limit,
        used_count: c.used_count,
        is_active: c.is_active,
      },
      { onConflict: 'code' },
    );
  }

  // 4. Seed approved sample reviews
  for (const r of initial.reviews) {
    await supabase.from('reviews').upsert(
      {
        id: toUuid(r.id),
        product_id: toUuid(r.product_id),
        reviewer_name: r.reviewer_name,
        rating: r.rating,
        title: r.title,
        comment: r.comment,
        verified_purchase: r.verified_purchase,
        moderation_status: r.moderation_status,
      },
      { onConflict: 'id' },
    );
  }

  return { seeded: true };
}

export async function fetchCategoriesFromSupabase(supabase: SupabaseClient, includeInactive = false): Promise<Category[]> {
  let query = supabase.from('categories').select('*').order('sort_order', { ascending: true });
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error || !data) return [];
  return data as Category[];
}

export async function fetchProductsFromSupabase(supabase: SupabaseClient, includeUnpublished = false): Promise<Product[]> {
  let query = supabase
    .from('products')
    .select('*, product_images(*), product_variants(*), inventory(*)')
    .order('created_at', { ascending: false });
  if (!includeUnpublished) query = query.eq('is_published', true);

  const [{ data: rows, error }, cats] = await Promise.all([
    query,
    fetchCategoriesFromSupabase(supabase, true),
  ]);
  if (error || !rows) return [];

  const catMap = new Map(cats.map((c) => [c.id, c]));

  return rows.map((row: Record<string, unknown>) => {
    const cat = row.category_id ? catMap.get(String(row.category_id)) : undefined;
    const sub = row.subcategory_id ? catMap.get(String(row.subcategory_id)) : undefined;
    const invArr = Array.isArray(row.inventory) ? row.inventory : row.inventory ? [row.inventory] : [];
    const inv = invArr[0] as { stock_quantity?: number; low_stock_threshold?: number } | undefined;
    const imgs = (Array.isArray(row.product_images) ? row.product_images : []) as Array<{
      id: string;
      product_id: string;
      image_url: string;
      alt_text: string;
      is_primary: boolean;
      sort_order: number;
    }>;
    const vars = (Array.isArray(row.product_variants) ? row.product_variants : []) as Array<{
      id: string;
      product_id: string;
      name: string;
      sku_suffix: string;
      color: string;
      price_ngn: number;
      original_price_ngn: number | null;
      stock_quantity: number;
      is_active: boolean;
    }>;

    return {
      id: String(row.id),
      sku: String(row.sku),
      name: String(row.name),
      slug: String(row.slug),
      brand: String(row.brand || ''),
      category_id: String(row.category_id || ''),
      subcategory_id: row.subcategory_id ? String(row.subcategory_id) : null,
      category_name: cat?.name || '',
      category_slug: cat?.slug || '',
      subcategory_name: sub?.name || '',
      subcategory_slug: sub?.slug || '',
      short_description: String(row.short_description || ''),
      description: String(row.description || ''),
      price_ngn: Number(row.price_ngn),
      original_price_ngn: row.original_price_ngn ? Number(row.original_price_ngn) : null,
      colors: Array.isArray(row.colors) ? (row.colors as string[]) : [],
      specifications: (row.specifications && typeof row.specifications === 'object'
        ? row.specifications
        : {}) as Record<string, string>,
      features: Array.isArray(row.features) ? (row.features as string[]) : [],
      is_featured: Boolean(row.is_featured),
      is_best_seller: Boolean(row.is_best_seller),
      is_trending: Boolean(row.is_trending),
      is_new_arrival: Boolean(row.is_new_arrival),
      is_recommended: Boolean(row.is_recommended),
      is_published: Boolean(row.is_published),
      rating_avg: Number(row.rating_avg || 5),
      review_count: Number(row.review_count || 0),
      sales_count: Number(row.sales_count || 0),
      stock_quantity: Number(inv?.stock_quantity ?? 0),
      low_stock_threshold: Number(inv?.low_stock_threshold ?? 5),
      images: [...imgs].sort((a, b) => a.sort_order - b.sort_order),
      variants: vars.map((v) => ({
        ...v,
        price_ngn: Number(v.price_ngn),
        original_price_ngn: v.original_price_ngn ? Number(v.original_price_ngn) : null,
      })),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  });
}

export async function fetchOrdersFromSupabase(supabase: SupabaseClient, userId?: string): Promise<Order[]> {
  let query = supabase
    .from('orders')
    .select('*, order_items(*), delivery_records(*)')
    .order('created_at', { ascending: false });
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query;
  if (error || !data) return [];

  return data.map((o: Record<string, unknown>) => {
    const delivArr = Array.isArray(o.delivery_records)
      ? o.delivery_records
      : o.delivery_records
        ? [o.delivery_records]
        : [];
    return {
      id: String(o.id),
      order_number: String(o.order_number),
      user_id: o.user_id ? String(o.user_id) : null,
      guest_token: o.guest_token ? String(o.guest_token) : null,
      customer_name: String(o.customer_name),
      customer_email: String(o.customer_email),
      customer_phone: String(o.customer_phone),
      customer_whatsapp: String(o.customer_whatsapp),
      delivery_address: String(o.delivery_address),
      delivery_city: String(o.delivery_city),
      delivery_state: String(o.delivery_state),
      delivery_notes: String(o.delivery_notes || ''),
      coupon_code: o.coupon_code ? String(o.coupon_code) : null,
      subtotal_ngn: Number(o.subtotal_ngn),
      delivery_fee_ngn: Number(o.delivery_fee_ngn),
      discount_ngn: Number(o.discount_ngn),
      total_ngn: Number(o.total_ngn),
      status: o.status as OrderStatus,
      payment_status: o.payment_status as Order['payment_status'],
      paystack_reference: o.paystack_reference ? String(o.paystack_reference) : null,
      stock_deducted: Boolean(o.stock_deducted),
      stock_restored: Boolean(o.stock_restored),
      items: (Array.isArray(o.order_items) ? o.order_items : []).map((i: Record<string, unknown>) => ({
        id: String(i.id),
        order_id: String(i.order_id),
        product_id: i.product_id ? String(i.product_id) : null,
        variant_id: i.variant_id ? String(i.variant_id) : null,
        product_name: String(i.product_name),
        product_image: String(i.product_image || ''),
        selected_color: String(i.selected_color || ''),
        selected_variant: String(i.selected_variant || ''),
        unit_price_ngn: Number(i.unit_price_ngn),
        quantity: Number(i.quantity),
        line_total_ngn: Number(i.line_total_ngn),
      })),
      delivery: delivArr[0] || null,
      created_at: String(o.created_at),
      updated_at: String(o.updated_at),
    };
  });
}

export async function fetchPaymentsFromSupabase(supabase: SupabaseClient): Promise<PaymentRecord[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*, orders(order_number, customer_name)')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map((p: Record<string, unknown>) => {
    const ord = (p.orders || {}) as { order_number?: string; customer_name?: string };
    return {
      id: String(p.id),
      order_id: String(p.order_id),
      order_number: ord.order_number || '',
      customer_name: ord.customer_name || '',
      reference: String(p.reference),
      amount_kobo: Number(p.amount_kobo),
      currency: String(p.currency || 'NGN'),
      status: p.status as PaymentRecord['status'],
      payment_method: String(p.payment_method || 'paystack'),
      channel: String(p.channel || ''),
      gateway_response: String(p.gateway_response || ''),
      verified_at: p.verified_at ? String(p.verified_at) : null,
      created_at: String(p.created_at),
    };
  });
}

export async function fetchCouponsFromSupabase(supabase: SupabaseClient): Promise<Coupon[]> {
  const { data } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
  return (data || []) as Coupon[];
}

export async function fetchReviewsFromSupabase(supabase: SupabaseClient, onlyApproved = false): Promise<Review[]> {
  let query = supabase
    .from('reviews')
    .select('*, products(name)')
    .order('created_at', { ascending: false });
  if (onlyApproved) query = query.eq('moderation_status', 'approved');
  const { data } = await query;
  return (data || []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    product_id: String(r.product_id),
    product_name: ((r.products || {}) as { name?: string }).name || '',
    user_id: r.user_id ? String(r.user_id) : null,
    order_id: r.order_id ? String(r.order_id) : null,
    reviewer_name: String(r.reviewer_name),
    rating: Number(r.rating),
    title: String(r.title || ''),
    comment: String(r.comment),
    verified_purchase: Boolean(r.verified_purchase),
    moderation_status: r.moderation_status as Review['moderation_status'],
    created_at: String(r.created_at),
  }));
}

export async function fetchAddressesFromSupabase(supabase: SupabaseClient, userId: string): Promise<Address[]> {
  const { data } = await supabase
    .from('addresses')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return (data || []) as Address[];
}

export async function fetchLogsFromSupabase(supabase: SupabaseClient): Promise<AdminActivityLog[]> {
  const { data } = await supabase
    .from('admin_activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  return (data || []) as AdminActivityLog[];
}

export async function isProfileInSupabase(supabase: SupabaseClient, userId: string | null | undefined): Promise<string | null> {
  if (!userId || !UUID_REGEX.test(userId)) return null;
  const { data } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle();
  return data?.id ? String(data.id) : null;
}

export async function upsertSupabaseUser(
  supabase: SupabaseClient,
  input: {
    id?: string;
    email: string;
    full_name: string;
    phone?: string;
    whatsapp_number?: string;
    password?: string;
    role?: 'customer' | 'admin' | 'super_admin';
  },
): Promise<{ userId: string | null; error?: string }> {
  try {
    const cleanEmail = input.email.trim().toLowerCase();
    // Look up existing profile by email first
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', cleanEmail)
      .maybeSingle();

    let authUserId: string | null = existingProfile?.id ? String(existingProfile.id) : null;

    if (!authUserId && input.password) {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: cleanEmail,
        password: input.password,
        email_confirm: true,
        user_metadata: { full_name: input.full_name },
      });
      if (created?.user?.id) {
        authUserId = created.user.id;
      } else if (createErr && !createErr.message.toLowerCase().includes('already')) {
        return { userId: null, error: createErr.message };
      } else {
        // Fallback: look up auth user via admin listUsers
        const { data: listed } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
        const match = listed?.users?.find((u) => (u.email || '').toLowerCase() === cleanEmail);
        if (match?.id) authUserId = match.id;
      }
    }

    if (!authUserId) {
      return { userId: null };
    }

    await supabase.from('profiles').upsert(
      {
        id: authUserId,
        email: cleanEmail,
        full_name: input.full_name,
        phone: input.phone || '',
        whatsapp_number: input.whatsapp_number || input.phone || '',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );

    if (input.role) {
      await supabase.from('user_roles').upsert(
        { user_id: authUserId, role: input.role },
        { onConflict: 'user_id,role' },
      );
    }

    return { userId: authUserId };
  } catch (err) {
    return { userId: null, error: String(err) };
  }
}

export async function createProductInSupabase(supabase: SupabaseClient, p: Product): Promise<{ product?: Product; error?: string }> {
  const prodUuid = toUuid(p.id);
  const { error } = await supabase.from('products').insert({
    id: prodUuid,
    sku: p.sku,
    name: p.name,
    slug: p.slug,
    brand: p.brand,
    category_id: p.category_id ? toUuid(p.category_id) : null,
    subcategory_id: p.subcategory_id ? toUuid(p.subcategory_id) : null,
    short_description: p.short_description,
    description: p.description,
    price_ngn: p.price_ngn,
    original_price_ngn: p.original_price_ngn,
    colors: p.colors,
    specifications: p.specifications,
    features: p.features,
    is_featured: p.is_featured,
    is_best_seller: p.is_best_seller,
    is_trending: p.is_trending,
    is_new_arrival: p.is_new_arrival,
    is_recommended: p.is_recommended,
    is_published: p.is_published,
    rating_avg: p.rating_avg,
    review_count: p.review_count,
    sales_count: p.sales_count,
  });
  if (error) return { error: error.message };

  await supabase.from('inventory').upsert(
    {
      product_id: prodUuid,
      stock_quantity: p.stock_quantity,
      reserved_quantity: 0,
      low_stock_threshold: p.low_stock_threshold,
    },
    { onConflict: 'product_id' },
  );

  if (p.images.length > 0) {
    await supabase.from('product_images').insert(
      p.images.map((img, idx) => ({
        id: toUuid(img.id),
        product_id: prodUuid,
        image_url: img.image_url,
        alt_text: img.alt_text,
        is_primary: idx === 0,
        sort_order: idx,
      })),
    );
  }

  if (p.variants.length > 0) {
    await supabase.from('product_variants').insert(
      p.variants.map((v) => ({
        id: toUuid(v.id),
        product_id: prodUuid,
        name: v.name,
        sku_suffix: v.sku_suffix,
        color: v.color,
        price_ngn: v.price_ngn,
        original_price_ngn: v.original_price_ngn,
        stock_quantity: v.stock_quantity,
        is_active: v.is_active,
      })),
    );
  }

  const all = await fetchProductsFromSupabase(supabase, true);
  return { product: all.find((x) => x.id === prodUuid) };
}

export async function updateProductInSupabase(
  supabase: SupabaseClient,
  productId: string,
  p: Product,
  replaceImages: boolean,
  replaceVariants: boolean,
): Promise<{ error?: string }> {
  const prodUuid = toUuid(productId);
  const { error } = await supabase
    .from('products')
    .update({
      sku: p.sku,
      name: p.name,
      slug: p.slug,
      brand: p.brand,
      category_id: p.category_id ? toUuid(p.category_id) : null,
      subcategory_id: p.subcategory_id ? toUuid(p.subcategory_id) : null,
      short_description: p.short_description,
      description: p.description,
      price_ngn: p.price_ngn,
      original_price_ngn: p.original_price_ngn,
      colors: p.colors,
      specifications: p.specifications,
      features: p.features,
      is_featured: p.is_featured,
      is_best_seller: p.is_best_seller,
      is_trending: p.is_trending,
      is_new_arrival: p.is_new_arrival,
      is_recommended: p.is_recommended,
      is_published: p.is_published,
      updated_at: new Date().toISOString(),
    })
    .eq('id', prodUuid);
  if (error) return { error: error.message };

  await supabase.from('inventory').upsert(
    {
      product_id: prodUuid,
      stock_quantity: p.stock_quantity,
      low_stock_threshold: p.low_stock_threshold,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'product_id' },
  );

  if (replaceImages) {
    await supabase.from('product_images').delete().eq('product_id', prodUuid);
    if (p.images.length > 0) {
      await supabase.from('product_images').insert(
        p.images.map((img, idx) => ({
          id: toUuid(img.id),
          product_id: prodUuid,
          image_url: img.image_url,
          alt_text: img.alt_text,
          is_primary: idx === 0,
          sort_order: idx,
        })),
      );
    }
  }

  if (replaceVariants) {
    await supabase.from('product_variants').delete().eq('product_id', prodUuid);
    if (p.variants.length > 0) {
      await supabase.from('product_variants').insert(
        p.variants.map((v) => ({
          id: toUuid(v.id),
          product_id: prodUuid,
          name: v.name,
          sku_suffix: v.sku_suffix,
          color: v.color,
          price_ngn: v.price_ngn,
          original_price_ngn: v.original_price_ngn,
          stock_quantity: v.stock_quantity,
          is_active: v.is_active,
        })),
      );
    }
  }

  return {};
}

export async function createOrderInSupabase(supabase: SupabaseClient, order: Order): Promise<{ error?: string }> {
  const orderUuid = toUuid(order.id);
  const validUserId = await isProfileInSupabase(supabase, order.user_id);

  const { error } = await supabase.from('orders').insert({
    id: orderUuid,
    order_number: order.order_number,
    user_id: validUserId,
    guest_token: order.guest_token,
    customer_name: order.customer_name,
    customer_email: order.customer_email,
    customer_phone: order.customer_phone,
    customer_whatsapp: order.customer_whatsapp,
    delivery_address: order.delivery_address,
    delivery_city: order.delivery_city,
    delivery_state: order.delivery_state,
    delivery_notes: order.delivery_notes,
    coupon_code: order.coupon_code,
    subtotal_ngn: order.subtotal_ngn,
    delivery_fee_ngn: order.delivery_fee_ngn,
    discount_ngn: order.discount_ngn,
    total_ngn: order.total_ngn,
    status: order.status,
    payment_status: order.payment_status,
    paystack_reference: order.paystack_reference,
    stock_deducted: order.stock_deducted,
    stock_restored: order.stock_restored,
  });
  if (error) return { error: error.message };

  if (order.items.length > 0) {
    await supabase.from('order_items').insert(
      order.items.map((i) => ({
        id: toUuid(i.id),
        order_id: orderUuid,
        product_id: i.product_id ? toUuid(i.product_id) : null,
        variant_id: i.variant_id ? toUuid(i.variant_id) : null,
        product_name: i.product_name,
        product_image: i.product_image,
        selected_color: i.selected_color,
        selected_variant: i.selected_variant,
        unit_price_ngn: i.unit_price_ngn,
        quantity: i.quantity,
        line_total_ngn: i.line_total_ngn,
      })),
    );
  }

  if (order.delivery) {
    await supabase.from('delivery_records').upsert(
      {
        id: toUuid(order.delivery.id),
        order_id: orderUuid,
        courier_name: order.delivery.courier_name,
        tracking_number: order.delivery.tracking_number,
        delivery_notes: order.delivery.delivery_notes,
      },
      { onConflict: 'order_id' },
    );
  }

  return {};
}

export async function verifyPaystackApiHealth(secretKey: string): Promise<{
  reachable: boolean;
  validKey: boolean;
  mode: 'live' | 'test' | 'unconfigured';
  message: string;
}> {
  if (!secretKey) {
    return { reachable: false, validKey: false, mode: 'unconfigured', message: 'Missing PAYSTACK_SECRET_KEY' };
  }
  const mode = secretKey.startsWith('sk_live_') ? 'live' : 'test';
  try {
    const res = await fetch('https://api.paystack.co/bank?country=nigeria&perPage=1', {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const json = (await res.json()) as { status?: boolean; message?: string };
    return {
      reachable: true,
      validKey: res.ok && Boolean(json.status),
      mode,
      message: json.message || (res.ok ? 'Paystack API verified' : `HTTP ${res.status}`),
    };
  } catch (err) {
    return { reachable: false, validKey: false, mode, message: String(err) };
  }
}

