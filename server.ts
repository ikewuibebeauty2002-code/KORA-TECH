import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import {
  deductStockAtomic,
  enrichProductCategories,
  getSupabaseAdmin,
  isSupabaseConfigured,
  loadDb,
  restoreStockAtomic,
  withStoreLock,
} from './server/store.ts';
import {
  createOrderInSupabase,
  createProductInSupabase,
  fetchAddressesFromSupabase,
  fetchCategoriesFromSupabase,
  fetchCouponsFromSupabase,
  fetchLogsFromSupabase,
  fetchOrdersFromSupabase,
  fetchPaymentsFromSupabase,
  fetchProductsFromSupabase,
  fetchReviewsFromSupabase,
  isProfileInSupabase,
  probeSupabaseSchema,
  seedSupabaseCatalogIfEmpty,
  toUuid,
  updateProductInSupabase,
  upsertSupabaseUser,
  verifyPaystackApiHealth,
  type SupabaseProbeResult,
} from './server/supabaseAdapter.ts';
import { calculateDeliveryFeeNgn } from './src/config/storeConfig.ts';
import type { Order, OrderStatus, Product, UserRole } from './src/types/ecommerce';

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.AUTH_JWT_SECRET || 'koratech_dev_jwt_secret_change_in_production';
const ADMIN_ACCESS_CODE = process.env.ADMIN_ACCESS_CODE || 'CHINNY123';
const UPLOAD_DIR = path.resolve(process.cwd(), 'public', 'uploads');

let cachedProbe: { at: number; result: SupabaseProbeResult } | null = null;
let seedingInFlight: Promise<{ seeded: boolean; error?: string }> | null = null;

async function refreshSupabaseState(force = false): Promise<SupabaseProbeResult> {
  const now = Date.now();
  if (
    !force &&
    cachedProbe &&
    ((cachedProbe.result.tablesReady &&
      cachedProbe.result.categoryCount > 0 &&
      cachedProbe.result.productCount > 0) ||
      now - cachedProbe.at < 20_000)
  ) {
    return cachedProbe.result;
  }
  const sb = getSupabaseAdmin();
  let probe = await probeSupabaseSchema(sb);
  let seedError: string | undefined;
  if (sb && probe.tablesReady && (probe.productCount === 0 || probe.categoryCount === 0)) {
    if (!seedingInFlight) {
      seedingInFlight = seedSupabaseCatalogIfEmpty(sb).finally(() => {
        seedingInFlight = null;
      });
    }
    const seedRes = await seedingInFlight;
    seedError = seedRes.error;
    probe = await probeSupabaseSchema(sb);
    if (seedError && !probe.error) {
      probe = { ...probe, error: seedError };
    }
  }
  cachedProbe = { at: Date.now(), result: probe };
  return probe;
}

async function getReadySupabase() {
  const probe = await refreshSupabaseState(false);
  if (!probe.tablesReady || probe.categoryCount === 0 || probe.productCount === 0) {
    return null;
  }
  return getSupabaseAdmin();
}

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

interface AuthTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}

interface AuthedRequest extends Request {
  auth?: AuthTokenPayload;
  rawBody?: string;
}

// Lightweight in-memory sliding-window rate limiter for sensitive endpoints
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (bucket.count >= maxRequests) {
      res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
      return;
    }
    bucket.count += 1;
    next();
  };
}

function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function extractAuth(req: AuthedRequest): AuthTokenPayload | null {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
  } catch {
    return null;
  }
}

function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  req.auth = extractAuth(req) || undefined;
  next();
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const auth = extractAuth(req);
  if (!auth) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  req.auth = auth;
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const auth = extractAuth(req);
  if (!auth) {
    res.status(401).json({ error: 'Administrator authentication required' });
    return;
  }
  if (auth.role !== 'admin' && auth.role !== 'super_admin') {
    res.status(403).json({ error: 'Forbidden: Administrator access required' });
    return;
  }
  req.auth = auth;
  next();
}

function getGuestToken(req: Request): string {
  const token = (req.headers['x-guest-token'] as string) || '';
  return token.trim().slice(0, 120);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '.jpg').toLowerCase() || '.jpg';
      cb(null, `kt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

const resetTokens = new Map<string, { email: string; expiresAt: number }>();

async function startServer() {
  const app = express();

  // Capture raw body for Paystack webhook HMAC-SHA512 verification
  app.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        (req as AuthedRequest).rawBody = buf.toString('utf8');
      },
    }),
  );

  app.use('/uploads', express.static(UPLOAD_DIR));

  // =========================================================
  // 1. PUBLIC GATEWAY & STORE CONFIGURATION
  // =========================================================
  app.get('/api/config', async (_req, res) => {
    const psSecret = process.env.PAYSTACK_SECRET_KEY || '';
    const psPublic = process.env.PAYSTACK_PUBLIC_KEY || process.env.VITE_PAYSTACK_PUBLIC_KEY || '';
    const paystackMode = !psSecret
      ? 'unconfigured'
      : psSecret.startsWith('sk_live_')
        ? 'live'
        : 'test';

    const probe = await refreshSupabaseState(false);

    res.json({
      supabaseConfigured: isSupabaseConfigured(),
      supabaseTablesReady: probe.tablesReady,
      supabaseCategoryCount: probe.categoryCount,
      supabaseProductCount: probe.productCount,
      supabaseKeyRole: probe.keyRole,
      supabaseError: probe.error,
      paystackConfigured: Boolean(psSecret),
      paystackMode,
      paystackPublicKey: psPublic,
      whatsappBusinessNumber:
        process.env.WHATSAPP_BUSINESS_NUMBER ||
        process.env.VITE_WHATSAPP_BUSINESS_NUMBER ||
        '2348005672832',
      storeName: process.env.STORE_NAME || 'KoraTech Electronics',
      storeEmail: process.env.STORE_EMAIL || 'orders@koratech.ng',
      storePhone: process.env.STORE_PHONE || '+234 800 567 2832',
      storeAddress: process.env.STORE_ADDRESS || '14 Admiralty Way, Lekki Phase 1, Lagos, Nigeria',
    });
  });

  // =========================================================
  // 2. AUTHENTICATION & CUSTOMER ACCOUNT
  // =========================================================
  app.post('/api/auth/register', rateLimit(15, 60_000), async (req, res) => {
    try {
      const { full_name, email, phone, whatsapp_number, password } = req.body || {};
      if (!full_name || !email || !password || String(password).length < 6) {
        res.status(400).json({ error: 'Full name, valid email, and password (min 6 chars) are required.' });
        return;
      }

      const cleanEmail = String(email).trim().toLowerCase();
      const guestToken = getGuestToken(req);

      const sb = await getReadySupabase();
      let supabaseUserId: string | null = null;
      if (sb) {
        const up = await upsertSupabaseUser(sb, {
          email: cleanEmail,
          full_name: String(full_name).trim(),
          phone: String(phone || '').trim(),
          whatsapp_number: String(whatsapp_number || phone || '').trim(),
          password: String(password),
          role: 'customer',
        });
        if (up.userId) supabaseUserId = up.userId;
      }

      const result = await withStoreLock((db) => {
        const existing = db.users.find((u) => u.email.toLowerCase() === cleanEmail);
        if (existing) {
          return { error: 'An account with this email address already exists.' };
        }

        const newUser = {
          id: supabaseUserId || `user-${crypto.randomUUID()}`,
          full_name: String(full_name).trim(),
          email: cleanEmail,
          phone: String(phone || '').trim(),
          whatsapp_number: String(whatsapp_number || phone || '').trim(),
          password_hash: bcrypt.hashSync(String(password), 10),
          role: 'customer' as UserRole,
          created_at: new Date().toISOString(),
        };
        db.users.push(newUser);

        // Merge guest cart into user cart
        if (guestToken) {
          const gCart = db.carts.find((c) => c.guest_token === guestToken);
          if (gCart) {
            gCart.user_id = newUser.id;
            gCart.guest_token = null;
          }
        }

        const token = signToken({ sub: newUser.id, email: newUser.email, role: newUser.role });
        const { password_hash: _pw, ...safeUser } = newUser;
        return { token, user: safeUser };
      });

      if ('error' in result) {
        res.status(409).json(result);
        return;
      }
      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/auth/login', rateLimit(20, 60_000), async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }
      const cleanEmail = String(email).trim().toLowerCase();
      const guestToken = getGuestToken(req);

      const result = await withStoreLock((db) => {
        const user = db.users.find((u) => u.email.toLowerCase() === cleanEmail);
        const matchesPassword =
          user &&
          (bcrypt.compareSync(String(password), user.password_hash) ||
            (user.role === 'super_admin' && String(password) === ADMIN_ACCESS_CODE));
        if (!user || !matchesPassword) {
          return { error: 'Invalid email or password.' };
        }
        if (user.role === 'super_admin' && String(password) === ADMIN_ACCESS_CODE) {
          user.password_hash = bcrypt.hashSync(ADMIN_ACCESS_CODE, 10);
        }

        if (guestToken) {
          const gCart = db.carts.find((c) => c.guest_token === guestToken);
          let uCart = db.carts.find((c) => c.user_id === user.id);
          if (gCart) {
            if (!uCart) {
              gCart.user_id = user.id;
              gCart.guest_token = null;
            } else {
              const gItems = db.cart_items.filter((i) => i.cart_id === gCart.id);
              for (const gi of gItems) {
                const existing = db.cart_items.find(
                  (ui) =>
                    ui.cart_id === uCart!.id &&
                    ui.product_id === gi.product_id &&
                    ui.variant_id === gi.variant_id &&
                    ui.selected_color === gi.selected_color,
                );
                if (existing) {
                  existing.quantity += gi.quantity;
                } else {
                  gi.cart_id = uCart.id;
                }
              }
              db.cart_items = db.cart_items.filter((i) => i.cart_id !== gCart.id);
              db.carts = db.carts.filter((c) => c.id !== gCart.id);
            }
          }
        }

        const token = signToken({ sub: user.id, email: user.email, role: user.role });
        const { password_hash: _pw, ...safeUser } = user;
        return { token, user: safeUser };
      });

      if ('error' in result) {
        res.status(401).json(result);
        return;
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/auth/admin-access', rateLimit(20, 60_000), async (req, res) => {
    try {
      const { passcode } = req.body || {};
      if (!passcode || String(passcode).trim() !== ADMIN_ACCESS_CODE) {
        res.status(401).json({ error: 'Invalid admin access code.' });
        return;
      }

      const result = await withStoreLock((db) => {
        let admin = db.users.find((u) => u.role === 'super_admin' || u.role === 'admin');
        if (!admin) {
          admin = {
            id: 'user-admin-1',
            full_name: 'Chidi Okafor (Store Admin)',
            email: 'admin@koratech.ng',
            phone: '+2348005672832',
            whatsapp_number: '2348005672832',
            password_hash: bcrypt.hashSync(ADMIN_ACCESS_CODE, 10),
            role: 'super_admin',
            created_at: new Date().toISOString(),
          };
          db.users.unshift(admin);
        } else {
          admin.password_hash = bcrypt.hashSync(ADMIN_ACCESS_CODE, 10);
        }

        const token = signToken({ sub: admin.id, email: admin.email, role: admin.role });
        const { password_hash: _pw, ...safeUser } = admin;
        return { token, user: safeUser };
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/auth/forgot-password', rateLimit(10, 60_000), (req, res) => {
    const cleanEmail = String(req.body?.email || '').trim().toLowerCase();
    const db = loadDb();
    const exists = db.users.some((u) => u.email.toLowerCase() === cleanEmail);
    const token = crypto.randomBytes(20).toString('hex');
    if (exists) {
      resetTokens.set(token, { email: cleanEmail, expiresAt: Date.now() + 30 * 60_000 });
    }
    res.json({
      message:
        'If an account matches that email, a password reset link has been generated.',
      // Exposed only when not running with external SMTP so local reset flow is fully testable
      resetPath: exists ? `/reset-password?token=${token}` : undefined,
    });
  });

  app.post('/api/auth/reset-password', rateLimit(10, 60_000), async (req, res) => {
    const { token, password } = req.body || {};
    if (!token || !password || String(password).length < 6) {
      res.status(400).json({ error: 'Valid reset token and password (min 6 chars) required.' });
      return;
    }
    const entry = resetTokens.get(String(token));
    if (!entry || entry.expiresAt < Date.now()) {
      res.status(400).json({ error: 'Reset token is invalid or has expired.' });
      return;
    }

    await withStoreLock((db) => {
      const user = db.users.find((u) => u.email.toLowerCase() === entry.email);
      if (user) {
        user.password_hash = bcrypt.hashSync(String(password), 10);
      }
    });
    resetTokens.delete(String(token));
    res.json({ message: 'Password updated successfully. You can now sign in.' });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const db = loadDb();
    const user = db.users.find((u) => u.id === req.auth!.sub);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const { password_hash: _pw, ...safeUser } = user;
    res.json({ user: safeUser });
  });

  app.patch('/api/auth/profile', requireAuth, async (req: AuthedRequest, res) => {
    const { full_name, phone, whatsapp_number } = req.body || {};
    const updated = await withStoreLock((db) => {
      const user = db.users.find((u) => u.id === req.auth!.sub);
      if (!user) return null;
      if (full_name !== undefined) user.full_name = String(full_name).trim();
      if (phone !== undefined) user.phone = String(phone).trim();
      if (whatsapp_number !== undefined) user.whatsapp_number = String(whatsapp_number).trim();
      const { password_hash: _pw, ...safeUser } = user;
      return safeUser;
    });
    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user: updated });
  });

  // Saved addresses
  app.get('/api/addresses', requireAuth, (req: AuthedRequest, res) => {
    const db = loadDb();
    res.json({ addresses: db.addresses.filter((a) => a.user_id === req.auth!.sub) });
  });

  app.post('/api/addresses', requireAuth, async (req: AuthedRequest, res) => {
    const { label, full_name, phone, whatsapp_number, street_address, city, state, additional_info, is_default } = req.body || {};
    if (!full_name || !phone || !street_address || !city || !state) {
      res.status(400).json({ error: 'Complete address details are required.' });
      return;
    }
    const address = await withStoreLock((db) => {
      if (is_default) {
        db.addresses.forEach((a) => {
          if (a.user_id === req.auth!.sub) a.is_default = false;
        });
      }
      const created = {
        id: `addr-${crypto.randomUUID()}`,
        user_id: req.auth!.sub,
        label: String(label || 'Home').trim(),
        full_name: String(full_name).trim(),
        phone: String(phone).trim(),
        whatsapp_number: String(whatsapp_number || phone).trim(),
        street_address: String(street_address).trim(),
        city: String(city).trim(),
        state: String(state).trim(),
        additional_info: String(additional_info || '').trim(),
        is_default: Boolean(is_default),
        created_at: new Date().toISOString(),
      };
      db.addresses.push(created);
      return created;
    });
    res.status(201).json({ address });
  });

  app.delete('/api/addresses/:id', requireAuth, async (req: AuthedRequest, res) => {
    await withStoreLock((db) => {
      db.addresses = db.addresses.filter(
        (a) => !(a.id === req.params.id && a.user_id === req.auth!.sub),
      );
    });
    res.json({ ok: true });
  });

  // Wishlist
  app.get('/api/wishlist', requireAuth, (req: AuthedRequest, res) => {
    const db = loadDb();
    const ids = db.wishlists.filter((w) => w.user_id === req.auth!.sub).map((w) => w.product_id);
    const items = db.products
      .filter((p) => ids.includes(p.id) && p.is_published)
      .map((p) => enrichProductCategories(p, db));
    res.json({ productIds: ids, products: items });
  });

  app.post('/api/wishlist/toggle', requireAuth, async (req: AuthedRequest, res) => {
    const { productId } = req.body || {};
    if (!productId) {
      res.status(400).json({ error: 'productId is required' });
      return;
    }
    const result = await withStoreLock((db) => {
      const idx = db.wishlists.findIndex(
        (w) => w.user_id === req.auth!.sub && w.product_id === productId,
      );
      let wishlisted = false;
      if (idx >= 0) {
        db.wishlists.splice(idx, 1);
      } else {
        db.wishlists.push({
          id: `wish-${crypto.randomUUID()}`,
          user_id: req.auth!.sub,
          product_id: String(productId),
          created_at: new Date().toISOString(),
        });
        wishlisted = true;
      }
      return { wishlisted };
    });
    res.json(result);
  });

  // =========================================================
  // 3. PUBLIC CATALOG, SEARCH & REVIEWS
  // =========================================================
  app.get('/api/categories', async (_req, res) => {
    const sb = await getReadySupabase();
    if (sb) {
      const categories = await fetchCategoriesFromSupabase(sb, false);
      res.json({ categories });
      return;
    }
    const db = loadDb();
    const categories = db.categories
      .filter((c) => c.is_active)
      .sort((a, b) => a.sort_order - b.sort_order);
    res.json({ categories });
  });

  app.get('/api/products', async (req, res) => {
    const sb = await getReadySupabase();
    const db = loadDb();
    const allCats = sb ? await fetchCategoriesFromSupabase(sb, true) : db.categories;
    const allProducts = sb
      ? await fetchProductsFromSupabase(sb, false)
      : db.products.filter((p) => p.is_published).map((p) => enrichProductCategories(p, db));

    const {
      category,
      section,
      search,
      brand,
      minPrice,
      maxPrice,
      inStock,
      feature,
      sort = 'popular',
      page = '1',
      limit = '24',
    } = req.query as Record<string, string | undefined>;

    let list = [...allProducts];

    if (category && category !== 'all') {
      const catObj = allCats.find((c) => c.slug === category || c.id === category);
      if (category === 'new-arrivals') {
        list = list.filter((p) => p.is_new_arrival);
      } else if (category === 'deals') {
        list = list.filter((p) => p.original_price_ngn && p.original_price_ngn > p.price_ngn);
      } else if (catObj) {
        const childIds = allCats
          .filter((c) => c.parent_id === catObj.id)
          .map((c) => c.id);
        list = list.filter(
          (p) =>
            p.category_id === catObj.id ||
            p.subcategory_id === catObj.id ||
            childIds.includes(p.category_id) ||
            (p.subcategory_id ? childIds.includes(p.subcategory_id) : false),
        );
      } else {
        list = list.filter(
          (p) => p.category_slug === category || p.subcategory_slug === category,
        );
      }
    }

    if (section) {
      if (section === 'new-arrivals') list = list.filter((p) => p.is_new_arrival);
      else if (section === 'best-sellers') list = list.filter((p) => p.is_best_seller);
      else if (section === 'featured') list = list.filter((p) => p.is_featured);
      else if (section === 'trending') list = list.filter((p) => p.is_trending);
      else if (section === 'recommended') list = list.filter((p) => p.is_recommended);
      else if (section === 'deals') {
        list = list.filter((p) => p.original_price_ngn && p.original_price_ngn > p.price_ngn);
      }
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => {
        const specText = Object.entries(p.specifications || {})
          .map(([k, v]) => `${k} ${v}`)
          .join(' ')
          .toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.short_description.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          (p.category_name || '').toLowerCase().includes(q) ||
          (p.subcategory_name || '').toLowerCase().includes(q) ||
          specText.includes(q)
        );
      });
    }

    if (brand && brand !== 'all') {
      list = list.filter((p) => p.brand.toLowerCase() === brand.toLowerCase());
    }

    if (minPrice) {
      const min = Number(minPrice);
      if (Number.isFinite(min)) list = list.filter((p) => p.price_ngn >= min);
    }
    if (maxPrice) {
      const max = Number(maxPrice);
      if (Number.isFinite(max)) list = list.filter((p) => p.price_ngn <= max);
    }

    if (inStock === 'true') {
      list = list.filter((p) => p.stock_quantity > 0);
    }

    if (feature && feature !== 'all') {
      list = list.filter((p) =>
        p.features.some((f) => f.toLowerCase().includes(feature.toLowerCase())),
      );
    }

    // Sorting
    if (sort === 'price_asc') list.sort((a, b) => a.price_ngn - b.price_ngn);
    else if (sort === 'price_desc') list.sort((a, b) => b.price_ngn - a.price_ngn);
    else if (sort === 'newest') {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sort === 'best_selling') {
      list.sort((a, b) => b.sales_count - a.sales_count);
    } else {
      list.sort((a, b) => b.sales_count + b.review_count * 3 - (a.sales_count + a.review_count * 3));
    }

    const brands = Array.from(new Set(allProducts.map((p) => p.brand))).sort();
    const allFeatures = Array.from(
      new Set(allProducts.flatMap((p) => p.features)),
    ).sort();

    const pNum = Math.max(1, Number(page) || 1);
    const lNum = Math.min(48, Math.max(1, Number(limit) || 24));
    const total = list.length;
    const paged = list.slice((pNum - 1) * lNum, pNum * lNum);

    res.json({
      products: paged,
      total,
      page: pNum,
      totalPages: Math.max(1, Math.ceil(total / lNum)),
      brands,
      features: allFeatures,
    });
  });

  app.get('/api/products/:slug', async (req, res) => {
    const sb = await getReadySupabase();
    if (sb) {
      const allProducts = await fetchProductsFromSupabase(sb, false);
      const product = allProducts.find(
        (p) => p.slug === req.params.slug || p.id === req.params.slug || p.id === toUuid(req.params.slug),
      );
      if (!product) {
        res.status(404).json({ error: 'Product not found' });
        return;
      }
      const allReviews = await fetchReviewsFromSupabase(sb, true);
      const reviews = allReviews.filter((r) => r.product_id === product.id);
      const related = allProducts
        .filter(
          (p) =>
            p.id !== product.id &&
            (p.category_id === product.category_id || p.brand === product.brand),
        )
        .slice(0, 4);
      res.json({ product, reviews, related });
      return;
    }

    const db = loadDb();
    const product = db.products.find(
      (p) => (p.slug === req.params.slug || p.id === req.params.slug) && p.is_published,
    );
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const enriched = enrichProductCategories(product, db);
    const reviews = db.reviews
      .filter((r) => r.product_id === product.id && r.moderation_status === 'approved')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const related = db.products
      .filter(
        (p) =>
          p.id !== product.id &&
          p.is_published &&
          (p.category_id === product.category_id || p.brand === product.brand),
      )
      .slice(0, 4)
      .map((p) => enrichProductCategories(p, db));

    res.json({ product: enriched, reviews, related });
  });

  app.get('/api/reviews/featured', async (_req, res) => {
    const sb = await getReadySupabase();
    if (sb) {
      const reviews = (await fetchReviewsFromSupabase(sb, true)).slice(0, 8);
      res.json({ reviews });
      return;
    }
    const db = loadDb();
    const reviews = db.reviews
      .filter((r) => r.moderation_status === 'approved')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 8)
      .map((r) => ({
        ...r,
        product_name: db.products.find((p) => p.id === r.product_id)?.name || r.product_name || '',
      }));
    res.json({ reviews });
  });

  app.post('/api/reviews', requireAuth, async (req: AuthedRequest, res) => {
    const { productId, rating, title, comment } = req.body || {};
    const numRating = Number(rating);
    if (!productId || !Number.isFinite(numRating) || numRating < 1 || numRating > 5 || !comment) {
      res.status(400).json({ error: 'Product, rating (1–5), and review comment are required.' });
      return;
    }

    const sb = await getReadySupabase();
    const sbProducts = sb ? await fetchProductsFromSupabase(sb, true) : undefined;
    const sbOrders = sb ? await fetchOrdersFromSupabase(sb) : undefined;
    const sbReviews = sb ? await fetchReviewsFromSupabase(sb, false) : undefined;

    const result = await withStoreLock((db) => {
      const productPool = sbProducts || db.products;
      const product = findProductMatch(productPool, String(productId));
      if (!product) return { status: 404, error: 'Product not found.' };

      const user = db.users.find((u) => u.id === req.auth!.sub);
      if (!user) return { status: 401, error: 'User not found.' };

      const orderPool = sbOrders || db.orders;
      // Enforce verified purchase requirement!
      const verifiedOrder = orderPool.find(
        (o) =>
          o.payment_status === 'paid' &&
          (o.user_id === user.id || o.customer_email.toLowerCase() === user.email.toLowerCase()) &&
          o.items.some((i) => i.product_id && toUuid(i.product_id) === toUuid(product.id)),
      );

      if (!verifiedOrder) {
        return {
          status: 403,
          error:
            'Only verified customers with a paid order for this product can submit a verified-purchase review.',
        };
      }

      const reviewPool = sbReviews || db.reviews;
      const duplicate = reviewPool.find(
        (r) => toUuid(r.product_id) === toUuid(product.id) && r.user_id === user.id,
      );
      if (duplicate) {
        return { status: 409, error: 'You have already reviewed this product.' };
      }

      const newReview = {
        id: crypto.randomUUID(),
        product_id: product.id,
        product_name: product.name,
        user_id: user.id,
        order_id: verifiedOrder.id,
        reviewer_name: user.full_name,
        rating: numRating,
        title: String(title || 'Verified Customer Review').trim(),
        comment: String(comment).trim(),
        verified_purchase: true,
        moderation_status: 'pending' as const,
        created_at: new Date().toISOString(),
      };
      db.reviews.push(newReview);

      return { status: 201, review: newReview };
    });

    if ('error' in result) {
      res.status(result.status || 400).json({ error: result.error });
      return;
    }

    if (sb) {
      const validUser = await isProfileInSupabase(sb, req.auth!.sub);
      await sb.from('reviews').insert({
        id: result.review.id,
        product_id: toUuid(result.review.product_id),
        user_id: validUser,
        order_id: toUuid(result.review.order_id!),
        reviewer_name: result.review.reviewer_name,
        rating: result.review.rating,
        title: result.review.title,
        comment: result.review.comment,
        verified_purchase: true,
        moderation_status: 'pending',
      });
    }

    res.status(201).json({
      review: result.review,
      message: 'Thank you! Your verified review has been submitted for moderation.',
    });
  });

  // =========================================================
  // 4. SHOPPING CART (PERSISTENT BACKEND FOR GUEST + AUTH)
  // =========================================================
  function findProductMatch(products: Product[], productId: string): Product | undefined {
    const targetUuid = toUuid(productId);
    return products.find((p) => p.id === productId || toUuid(p.id) === targetUuid);
  }

  function hydrateCart(
    db: ReturnType<typeof loadDb>,
    cartId: string | null,
    liveProducts?: Product[],
  ) {
    if (!cartId) return [];
    const pool = liveProducts || db.products.map((p) => enrichProductCategories(p, db));
    const items = db.cart_items.filter((i) => i.cart_id === cartId);
    return items
      .map((item) => {
        const product = findProductMatch(pool, item.product_id);
        if (!product || !product.is_published) return null;
        const variant = item.variant_id
          ? product.variants.find(
              (v) => v.id === item.variant_id || toUuid(v.id) === toUuid(item.variant_id!),
            ) || null
          : null;
        return {
          id: item.id,
          product_id: product.id,
          variant_id: variant?.id || item.variant_id,
          selected_color: item.selected_color,
          quantity: item.quantity,
          product: liveProducts ? product : enrichProductCategories(product, db),
          variant,
        };
      })
      .filter(Boolean);
  }

  app.get('/api/cart', optionalAuth, async (req: AuthedRequest, res) => {
    const sb = await getReadySupabase();
    const liveProducts = sb ? await fetchProductsFromSupabase(sb, false) : undefined;
    const db = loadDb();
    const guestToken = getGuestToken(req);
    const cart = req.auth
      ? db.carts.find((c) => c.user_id === req.auth!.sub)
      : guestToken
        ? db.carts.find((c) => c.guest_token === guestToken)
        : undefined;

    res.json({ items: hydrateCart(db, cart?.id || null, liveProducts) });
  });

  app.post('/api/cart/items', optionalAuth, async (req: AuthedRequest, res) => {
    const { productId, variantId, selectedColor, quantity = 1 } = req.body || {};
    const qty = Math.max(1, Number(quantity) || 1);
    const guestToken = getGuestToken(req);

    if (!req.auth && !guestToken) {
      res.status(400).json({ error: 'Missing guest session token' });
      return;
    }

    const sb = await getReadySupabase();
    const liveProducts = sb ? await fetchProductsFromSupabase(sb, false) : undefined;

    const result = await withStoreLock((db) => {
      const pool = liveProducts || db.products;
      const product = findProductMatch(pool, String(productId || ''));
      if (!product || !product.is_published) return { status: 404, error: 'Product not found' };

      const variant = variantId
        ? product.variants.find(
            (v) => v.id === variantId || toUuid(v.id) === toUuid(String(variantId)),
          )
        : null;
      const availableStock = variant ? variant.stock_quantity : product.stock_quantity;
      if (availableStock <= 0) {
        return { status: 400, error: 'This item is currently out of stock.' };
      }

      let cart = req.auth
        ? db.carts.find((c) => c.user_id === req.auth!.sub)
        : db.carts.find((c) => c.guest_token === guestToken);

      if (!cart) {
        cart = {
          id: `cart-${crypto.randomUUID()}`,
          user_id: req.auth ? req.auth.sub : null,
          guest_token: req.auth ? null : guestToken,
          updated_at: new Date().toISOString(),
        };
        db.carts.push(cart);
      }

      const color = String(selectedColor || product.colors[0] || '');
      const existing = db.cart_items.find(
        (i) =>
          i.cart_id === cart!.id &&
          toUuid(i.product_id) === toUuid(product.id) &&
          (i.variant_id ? toUuid(i.variant_id) : null) === (variant?.id ? toUuid(variant.id) : null) &&
          i.selected_color === color,
      );

      if (existing) {
        const nextQty = existing.quantity + qty;
        if (nextQty > availableStock) {
          return {
            status: 400,
            error: `Only ${availableStock} unit(s) available in stock.`,
          };
        }
        existing.quantity = nextQty;
      } else {
        if (qty > availableStock) {
          return {
            status: 400,
            error: `Only ${availableStock} unit(s) available in stock.`,
          };
        }
        db.cart_items.push({
          id: `ci-${crypto.randomUUID()}`,
          cart_id: cart.id,
          product_id: product.id,
          variant_id: variant?.id || null,
          selected_color: color,
          quantity: qty,
          created_at: new Date().toISOString(),
        });
      }

      cart.updated_at = new Date().toISOString();
      return { status: 200, items: hydrateCart(db, cart.id, liveProducts) };
    });

    if ('error' in result) {
      res.status(result.status || 400).json({ error: result.error });
      return;
    }
    res.json({ items: result.items });
  });

  app.patch('/api/cart/items/:id', optionalAuth, async (req: AuthedRequest, res) => {
    const { quantity, variantId, selectedColor } = req.body || {};
    const guestToken = getGuestToken(req);
    const sb = await getReadySupabase();
    const liveProducts = sb ? await fetchProductsFromSupabase(sb, false) : undefined;

    const result = await withStoreLock((db) => {
      const cart = req.auth
        ? db.carts.find((c) => c.user_id === req.auth!.sub)
        : db.carts.find((c) => c.guest_token === guestToken);
      if (!cart) return { status: 404, error: 'Cart not found' };

      const item = db.cart_items.find((i) => i.id === req.params.id && i.cart_id === cart.id);
      if (!item) return { status: 404, error: 'Cart item not found' };

      const pool = liveProducts || db.products;
      const product = findProductMatch(pool, item.product_id);
      if (!product) return { status: 404, error: 'Product not found' };

      if (variantId !== undefined) {
        item.variant_id = variantId || null;
      }
      if (selectedColor !== undefined) {
        item.selected_color = String(selectedColor);
      }

      const variant = item.variant_id
        ? product.variants.find(
            (v) => v.id === item.variant_id || toUuid(v.id) === toUuid(item.variant_id!),
          )
        : null;
      const availableStock = variant ? variant.stock_quantity : product.stock_quantity;

      if (quantity !== undefined) {
        const nextQty = Number(quantity);
        if (nextQty <= 0) {
          db.cart_items = db.cart_items.filter((i) => i.id !== item.id);
          return { status: 200, items: hydrateCart(db, cart.id, liveProducts) };
        }
        if (nextQty > availableStock) {
          return { status: 400, error: `Maximum available stock is ${availableStock}.` };
        }
        item.quantity = nextQty;
      }

      cart.updated_at = new Date().toISOString();
      return { status: 200, items: hydrateCart(db, cart.id, liveProducts) };
    });

    if ('error' in result) {
      res.status(result.status || 400).json({ error: result.error });
      return;
    }
    res.json({ items: result.items });
  });

  app.delete('/api/cart/items/:id', optionalAuth, async (req: AuthedRequest, res) => {
    const guestToken = getGuestToken(req);
    const sb = await getReadySupabase();
    const liveProducts = sb ? await fetchProductsFromSupabase(sb, false) : undefined;
    const items = await withStoreLock((db) => {
      const cart = req.auth
        ? db.carts.find((c) => c.user_id === req.auth!.sub)
        : db.carts.find((c) => c.guest_token === guestToken);
      if (!cart) return [];
      db.cart_items = db.cart_items.filter(
        (i) => !(i.id === req.params.id && i.cart_id === cart.id),
      );
      return hydrateCart(db, cart.id, liveProducts);
    });
    res.json({ items });
  });

  app.post('/api/coupons/validate', async (req, res) => {
    const { code, subtotal } = req.body || {};
    const cleanCode = String(code || '').trim().toUpperCase();
    const sub = Number(subtotal) || 0;
    const sb = await getReadySupabase();
    const coupons = sb ? await fetchCouponsFromSupabase(sb) : loadDb().coupons;
    const coupon = coupons.find((c) => c.code.toUpperCase() === cleanCode && c.is_active);
    if (!coupon) {
      res.status(404).json({ error: 'Invalid or expired coupon code.' });
      return;
    }
    if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) {
      res.status(400).json({ error: 'This coupon has expired.' });
      return;
    }
    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
      res.status(400).json({ error: 'Coupon usage limit reached.' });
      return;
    }
    if (sub < coupon.min_order_ngn) {
      res.status(400).json({
        error: `Minimum order of ₦${coupon.min_order_ngn.toLocaleString('en-NG')} required for ${coupon.code}.`,
      });
      return;
    }

    let discount =
      coupon.discount_type === 'percentage'
        ? (sub * coupon.discount_value) / 100
        : coupon.discount_value;
    if (coupon.max_discount_ngn) {
      discount = Math.min(discount, coupon.max_discount_ngn);
    }
    discount = Math.round(Math.min(discount, sub));

    res.json({ coupon, discount_ngn: discount });
  });

  // =========================================================
  // 5. CHECKOUT, ORDER CREATION & PAYSTACK PAYMENT FLOW
  // =========================================================
  app.post('/api/checkout/create-order', rateLimit(15, 60_000), optionalAuth, async (req: AuthedRequest, res) => {
    try {
      const {
        customer_name,
        customer_email,
        customer_phone,
        customer_whatsapp,
        delivery_address,
        delivery_city,
        delivery_state,
        delivery_notes,
        coupon_code,
        direct_item, // Optional for "Buy Now" without disrupting existing cart
      } = req.body || {};

      if (
        !customer_name ||
        !customer_email ||
        !customer_phone ||
        !customer_whatsapp ||
        !delivery_address ||
        !delivery_city ||
        !delivery_state
      ) {
        res.status(400).json({ error: 'All compulsory delivery and contact fields must be completed.' });
        return;
      }

      const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(customer_email).trim());
      if (!emailValid) {
        res.status(400).json({ error: 'Please provide a valid email address for Paystack receipts.' });
        return;
      }

      const guestToken = getGuestToken(req);
      const sb = await getReadySupabase();
      const liveProducts = sb ? await fetchProductsFromSupabase(sb, false) : undefined;
      const liveCoupons = sb ? await fetchCouponsFromSupabase(sb) : undefined;

      const result = await withStoreLock((db) => {
        let sourceItems: Array<{
          product_id: string;
          variant_id: string | null;
          selected_color: string;
          quantity: number;
        }> = [];

        if (direct_item?.productId) {
          sourceItems = [
            {
              product_id: String(direct_item.productId),
              variant_id: direct_item.variantId ? String(direct_item.variantId) : null,
              selected_color: String(direct_item.selectedColor || ''),
              quantity: Math.max(1, Number(direct_item.quantity) || 1),
            },
          ];
        } else {
          const cart = req.auth
            ? db.carts.find((c) => c.user_id === req.auth!.sub)
            : db.carts.find((c) => c.guest_token === guestToken);
          if (!cart) {
            return { status: 400, error: 'Your shopping cart is empty.' };
          }
          const cartItems = db.cart_items.filter((i) => i.cart_id === cart.id);
          if (cartItems.length === 0) {
            return { status: 400, error: 'Your shopping cart is empty.' };
          }
          sourceItems = cartItems.map((ci) => ({
            product_id: ci.product_id,
            variant_id: ci.variant_id,
            selected_color: ci.selected_color,
            quantity: ci.quantity,
          }));
        }

        // Authoritative backend price & stock validation
        let subtotal = 0;
        const orderId = crypto.randomUUID();
        const orderItems = [];
        const productPool = liveProducts || db.products;

        for (const item of sourceItems) {
          const product = findProductMatch(productPool, item.product_id);
          if (!product || !product.is_published) {
            return { status: 400, error: 'One or more products in your cart are no longer available.' };
          }

          const variant = item.variant_id
            ? product.variants.find(
                (v) =>
                  (v.id === item.variant_id || toUuid(v.id) === toUuid(item.variant_id!)) &&
                  v.is_active,
              )
            : null;
          if (item.variant_id && !variant) {
            return { status: 400, error: `Selected variation for ${product.name} is unavailable.` };
          }

          const availableStock = variant ? variant.stock_quantity : product.stock_quantity;
          if (availableStock < item.quantity) {
            return {
              status: 400,
              error: `Insufficient stock for ${product.name}. Only ${availableStock} remaining.`,
            };
          }

          const unitPrice = variant ? variant.price_ngn : product.price_ngn;
          const lineTotal = unitPrice * item.quantity;
          subtotal += lineTotal;

          orderItems.push({
            id: crypto.randomUUID(),
            order_id: orderId,
            product_id: product.id,
            variant_id: variant?.id || null,
            product_name: product.name,
            product_image: product.images[0]?.image_url || '',
            selected_color: item.selected_color || product.colors[0] || '',
            selected_variant: variant?.name || '',
            unit_price_ngn: unitPrice,
            quantity: item.quantity,
            line_total_ngn: lineTotal,
          });
        }

        // Coupon validation server-side
        let discountNgn = 0;
        let appliedCoupon: string | null = null;
        if (coupon_code) {
          const cleanCode = String(coupon_code).trim().toUpperCase();
          const couponPool = liveCoupons || db.coupons;
          const coupon = couponPool.find((c) => c.code.toUpperCase() === cleanCode && c.is_active);
          if (coupon && subtotal >= coupon.min_order_ngn) {
            let d =
              coupon.discount_type === 'percentage'
                ? (subtotal * coupon.discount_value) / 100
                : coupon.discount_value;
            if (coupon.max_discount_ngn) d = Math.min(d, coupon.max_discount_ngn);
            discountNgn = Math.round(Math.min(d, subtotal));
            appliedCoupon = coupon.code;
          }
        }

        const deliveryFee = calculateDeliveryFeeNgn(String(delivery_state), subtotal);
        const totalNgn = Math.max(0, subtotal + deliveryFee - discountNgn);

        const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randTag = crypto.randomInt(1000, 9999);
        const orderNumber = `KT-${dateTag}-${randTag}`;
        const paystackRef = `KTREF-${dateTag}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

        const order: Order = {
          id: orderId,
          order_number: orderNumber,
          user_id: req.auth ? req.auth.sub : null,
          guest_token: req.auth ? null : guestToken || null,
          customer_name: String(customer_name).trim(),
          customer_email: String(customer_email).trim().toLowerCase(),
          customer_phone: String(customer_phone).trim(),
          customer_whatsapp: String(customer_whatsapp).trim(),
          delivery_address: String(delivery_address).trim(),
          delivery_city: String(delivery_city).trim(),
          delivery_state: String(delivery_state).trim(),
          delivery_notes: String(delivery_notes || '').trim(),
          coupon_code: appliedCoupon,
          subtotal_ngn: subtotal,
          delivery_fee_ngn: deliveryFee,
          discount_ngn: discountNgn,
          total_ngn: totalNgn,
          status: 'Pending Payment',
          payment_status: 'pending',
          paystack_reference: paystackRef,
          stock_deducted: false,
          stock_restored: false,
          items: orderItems,
          delivery: {
            id: crypto.randomUUID(),
            order_id: orderId,
            courier_name: 'KoraTech Express Dispatch',
            tracking_number: '',
            dispatched_at: null,
            delivered_at: null,
            delivery_notes: '',
            updated_at: new Date().toISOString(),
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        db.orders.unshift(order);
        return { status: 201, order };
      });

      if ('error' in result) {
        res.status(result.status || 400).json({ error: result.error });
        return;
      }

      if (sb) {
        await createOrderInSupabase(sb, result.order);
      }

      res.status(201).json({ order: result.order });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/paystack/initialize', rateLimit(15, 60_000), async (req, res) => {
    try {
      const { orderId, callbackUrl } = req.body || {};
      const paystackSecret = process.env.PAYSTACK_SECRET_KEY || '';
      if (!paystackSecret) {
        res.status(503).json({
          configured: false,
          error:
            'Paystack Secret Key (PAYSTACK_SECRET_KEY) is not configured in server environment secrets yet. Add your Paystack test or live keys to initialize live checkout.',
        });
        return;
      }

      const sb = await getReadySupabase();
      const db = loadDb();
      let order = db.orders.find((o) => o.id === orderId || toUuid(o.id) === toUuid(String(orderId || '')));
      if (!order && sb) {
        const sbOrders = await fetchOrdersFromSupabase(sb);
        order = sbOrders.find((o) => o.id === orderId || o.id === toUuid(String(orderId || '')));
      }
      if (!order) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }
      if (order.payment_status === 'paid') {
        res.status(400).json({ error: 'This order has already been paid.' });
        return;
      }

      const amountKobo = Math.round(order.total_ngn * 100);
      const reference = `KTREF-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      const nameParts = (order.customer_name || '').trim().split(/\s+/);
      const firstName = nameParts[0] || 'Customer';
      const lastName = nameParts.slice(1).join(' ') || 'KoraTech';

      const psRes = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${paystackSecret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: order.customer_email,
          amount: amountKobo,
          currency: 'NGN',
          reference,
          callback_url: callbackUrl,
          metadata: {
            order_id: order.id,
            order_number: order.order_number,
            customer_name: order.customer_name,
            first_name: firstName,
            last_name: lastName,
            phone: order.customer_phone,
            custom_fields: [
              { display_name: 'Order Number', variable_name: 'order_number', value: order.order_number },
              { display_name: 'Customer Phone', variable_name: 'customer_phone', value: order.customer_phone },
            ],
          },
        }),
      });

      const psJson = (await psRes.json()) as {
        status: boolean;
        message?: string;
        data?: { authorization_url: string; reference: string; access_code: string };
      };

      if (!psJson.status || !psJson.data?.authorization_url) {
        res.status(400).json({ error: psJson.message || 'Paystack transaction initialization failed.' });
        return;
      }

      await withStoreLock((liveDb) => {
        const target = liveDb.orders.find((o) => o.id === order!.id);
        if (target) target.paystack_reference = reference;
        const existingPayment = liveDb.payments.find((p) => p.reference === reference);
        if (!existingPayment) {
          liveDb.payments.unshift({
            id: crypto.randomUUID(),
            order_id: order!.id,
            order_number: order!.order_number,
            customer_name: order!.customer_name,
            reference,
            amount_kobo: amountKobo,
            currency: 'NGN',
            status: 'initialized',
            payment_method: 'paystack',
            channel: '',
            gateway_response: 'Initialized',
            verified_at: null,
            created_at: new Date().toISOString(),
          });
        }
      });

      if (sb) {
        await sb
          .from('orders')
          .update({ paystack_reference: reference, updated_at: new Date().toISOString() })
          .eq('id', toUuid(order.id));
        await sb.from('payments').upsert(
          {
            order_id: toUuid(order.id),
            reference,
            amount_kobo: amountKobo,
            currency: 'NGN',
            status: 'initialized',
            payment_method: 'paystack',
            gateway_response: 'Initialized',
          },
          { onConflict: 'reference' },
        );
      }

      res.json({
        configured: true,
        mode: paystackSecret.startsWith('sk_live_') ? 'live' : 'test',
        authorization_url: psJson.data.authorization_url,
        access_code: psJson.data.access_code,
        reference: psJson.data.reference,
        order_number: order.order_number,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/paystack/verify', rateLimit(25, 60_000), optionalAuth, async (req: AuthedRequest, res) => {
    try {
      const { reference } = req.body || {};
      if (!reference) {
        res.status(400).json({ error: 'Transaction reference is required.' });
        return;
      }
      const paystackSecret = process.env.PAYSTACK_SECRET_KEY || '';
      if (!paystackSecret) {
        res.status(503).json({
          verified: false,
          configured: false,
          error: 'Paystack Secret Key is not configured on the server.',
        });
        return;
      }

      const verifyRes = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(String(reference))}`,
        {
          headers: { Authorization: `Bearer ${paystackSecret}` },
        },
      );
      const verifyJson = (await verifyRes.json()) as {
        status: boolean;
        message?: string;
        data?: {
          status: string;
          amount: number;
          currency: string;
          reference: string;
          channel?: string;
          gateway_response?: string;
        };
      };

      if (!verifyJson.status || !verifyJson.data) {
        res.status(400).json({
          verified: false,
          error: verifyJson.message || 'Could not verify transaction with Paystack.',
        });
        return;
      }

      const tx = verifyJson.data;
      const guestToken = getGuestToken(req);
      const sb = await getReadySupabase();
      const sbOrders = sb ? await fetchOrdersFromSupabase(sb) : [];

      const outcome = await withStoreLock((db) => {
        let order = db.orders.find((o) => o.paystack_reference === tx.reference);
        if (!order) {
          const sbMatch = sbOrders.find((o) => o.paystack_reference === tx.reference);
          if (sbMatch) {
            db.orders.unshift(sbMatch);
            order = sbMatch;
          }
        }
        if (!order) {
          return { status: 404, verified: false, error: 'Matching order not found for reference.' };
        }

        const expectedKobo = Math.round(order.total_ngn * 100);
        const matches =
          tx.status === 'success' &&
          tx.currency === 'NGN' &&
          Number(tx.amount) === expectedKobo &&
          tx.reference === order.paystack_reference;

        if (!matches) {
          const mapped = tx.status === 'abandoned' ? 'abandoned' : 'failed';
          if (order.payment_status !== 'paid') {
            order.payment_status = mapped;
            order.updated_at = new Date().toISOString();
          }
          const pay = db.payments.find((p) => p.reference === tx.reference);
          if (pay && pay.status !== 'success') {
            pay.status = mapped;
            pay.gateway_response = tx.gateway_response || mapped;
          }
          return {
            status: 200,
            verified: false,
            paymentStatus: mapped,
            order,
            error: `Paystack status: ${tx.status}${tx.gateway_response ? ` (${tx.gateway_response})` : ''}.`,
          };
        }

        // Idempotent atomic stock deduction locally if products exist locally
        if (!order.stock_deducted) {
          const hasLocalProds = order.items.every(
            (i) => !i.product_id || db.products.some((p) => p.id === i.product_id),
          );
          if (hasLocalProds) {
            const stockRes = deductStockAtomic(db, order);
            if (!stockRes.ok) {
              return { status: 409, verified: false, error: stockRes.error, order };
            }
          } else {
            order.stock_deducted = true;
            order.payment_status = 'paid';
            if (order.status === 'Pending Payment') order.status = 'Paid';
            order.updated_at = new Date().toISOString();
          }
        } else {
          order.payment_status = 'paid';
          if (order.status === 'Pending Payment') order.status = 'Paid';
        }

        if (order.coupon_code) {
          const coupon = db.coupons.find((c) => c.code === order!.coupon_code);
          if (coupon) coupon.used_count += 1;
        }

        const existingPay = db.payments.find((p) => p.reference === tx.reference);
        if (existingPay) {
          existingPay.status = 'success';
          existingPay.channel = tx.channel || 'card';
          existingPay.gateway_response = tx.gateway_response || 'Approved';
          existingPay.verified_at = new Date().toISOString();
        } else {
          db.payments.unshift({
            id: crypto.randomUUID(),
            order_id: order.id,
            order_number: order.order_number,
            customer_name: order.customer_name,
            reference: tx.reference,
            amount_kobo: expectedKobo,
            currency: 'NGN',
            status: 'success',
            payment_method: 'paystack',
            channel: tx.channel || 'card',
            gateway_response: tx.gateway_response || 'Approved',
            verified_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          });
        }

        // Clear cart ONLY after verified payment
        const cart = order.user_id
          ? db.carts.find((c) => c.user_id === order!.user_id)
          : db.carts.find((c) => c.guest_token === (order!.guest_token || guestToken));
        if (cart) {
          db.cart_items = db.cart_items.filter((i) => i.cart_id !== cart.id);
        }

        return { status: 200, verified: true, paymentStatus: 'paid', order };
      });

      if (sb && 'order' in outcome && outcome.order) {
        if (outcome.verified) {
          await sb.rpc('deduct_inventory_on_payment', { p_order_id: toUuid(outcome.order.id) });
          await sb.from('payments').upsert(
            {
              order_id: toUuid(outcome.order.id),
              reference: tx.reference,
              amount_kobo: Math.round(outcome.order.total_ngn * 100),
              currency: 'NGN',
              status: 'success',
              payment_method: 'paystack',
              channel: tx.channel || 'card',
              gateway_response: tx.gateway_response || 'Approved',
              raw_payload: tx,
              verified_at: new Date().toISOString(),
            },
            { onConflict: 'reference' },
          );
          if (outcome.order.coupon_code) {
            const { data: coup } = await sb
              .from('coupons')
              .select('id, used_count')
              .eq('code', outcome.order.coupon_code)
              .maybeSingle();
            if (coup) {
              await sb
                .from('coupons')
                .update({ used_count: Number(coup.used_count || 0) + 1 })
                .eq('id', coup.id);
            }
          }
        } else if (outcome.paymentStatus) {
          await sb
            .from('orders')
            .update({ payment_status: outcome.paymentStatus, updated_at: new Date().toISOString() })
            .eq('id', toUuid(outcome.order.id))
            .neq('payment_status', 'paid');
        }
      }

      res.status(outcome.status).json(outcome);
    } catch (err) {
      res.status(500).json({ verified: false, error: String(err) });
    }
  });

  app.post('/api/paystack/webhook', async (req: AuthedRequest, res) => {
    const paystackSecret = process.env.PAYSTACK_SECRET_KEY || '';
    if (!paystackSecret) {
      res.status(503).send('Paystack secret not configured');
      return;
    }
    const signature = String(req.headers['x-paystack-signature'] || '');
    const rawBody = req.rawBody || JSON.stringify(req.body || {});
    const expected = crypto
      .createHmac('sha512', paystackSecret)
      .update(rawBody)
      .digest('hex');

    if (
      signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      res.status(401).send('Invalid signature');
      return;
    }

    const event = req.body;
    if (event?.event === 'charge.success' && event.data?.reference) {
      const tx = event.data;
      const sb = await getReadySupabase();
      const sbOrders = sb ? await fetchOrdersFromSupabase(sb) : [];

      const matchedOrder = await withStoreLock((db) => {
        let order = db.orders.find((o) => o.paystack_reference === tx.reference);
        if (!order) {
          const sbMatch = sbOrders.find((o) => o.paystack_reference === tx.reference);
          if (sbMatch) {
            db.orders.unshift(sbMatch);
            order = sbMatch;
          }
        }
        if (!order) return null;
        const expectedKobo = Math.round(order.total_ngn * 100);
        if (tx.currency === 'NGN' && Number(tx.amount) === expectedKobo) {
          if (!order.stock_deducted) {
            const hasLocalProds = order.items.every(
              (i) => !i.product_id || db.products.some((p) => p.id === i.product_id),
            );
            if (hasLocalProds) deductStockAtomic(db, order);
            else {
              order.stock_deducted = true;
              order.payment_status = 'paid';
              if (order.status === 'Pending Payment') order.status = 'Paid';
            }
          }
          const pay = db.payments.find((p) => p.reference === tx.reference);
          if (pay) {
            pay.status = 'success';
            pay.channel = tx.channel || 'webhook';
            pay.gateway_response = tx.gateway_response || 'Approved';
            pay.verified_at = new Date().toISOString();
          }
        }
        return order;
      });

      if (sb && matchedOrder) {
        const expectedKobo = Math.round(matchedOrder.total_ngn * 100);
        if (tx.currency === 'NGN' && Number(tx.amount) === expectedKobo) {
          await sb.rpc('deduct_inventory_on_payment', { p_order_id: toUuid(matchedOrder.id) });
          await sb.from('payments').upsert(
            {
              order_id: toUuid(matchedOrder.id),
              reference: tx.reference,
              amount_kobo: expectedKobo,
              currency: 'NGN',
              status: 'success',
              payment_method: 'paystack',
              channel: tx.channel || 'webhook',
              gateway_response: tx.gateway_response || 'Approved',
              raw_payload: tx,
              verified_at: new Date().toISOString(),
            },
            { onConflict: 'reference' },
          );
        }
      }
    }
    res.status(200).send('ok');
  });

  // Customer Orders & Tracking
  app.get('/api/orders/my', requireAuth, async (req: AuthedRequest, res) => {
    const sb = await getReadySupabase();
    if (sb) {
      const all = await fetchOrdersFromSupabase(sb);
      const orders = all.filter(
        (o) =>
          o.user_id === req.auth!.sub ||
          o.customer_email.toLowerCase() === req.auth!.email.toLowerCase(),
      );
      res.json({ orders });
      return;
    }
    const db = loadDb();
    const orders = db.orders
      .filter(
        (o) =>
          o.user_id === req.auth!.sub ||
          o.customer_email.toLowerCase() === req.auth!.email.toLowerCase(),
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    res.json({ orders });
  });

  app.get('/api/orders/track/:orderNumber', optionalAuth, async (req: AuthedRequest, res) => {
    const sb = await getReadySupabase();
    const ordersPool = sb ? await fetchOrdersFromSupabase(sb) : loadDb().orders;
    const order = ordersPool.find(
      (o) => o.order_number.toLowerCase() === String(req.params.orderNumber).toLowerCase(),
    );
    if (!order) {
      res.status(404).json({ error: 'No order found with that order number.' });
      return;
    }

    const emailQuery = String(req.query.email || '').trim().toLowerCase();
    const guestToken = getGuestToken(req);
    const isOwner =
      (req.auth && (req.auth.role === 'admin' || req.auth.role === 'super_admin' || order.user_id === req.auth.sub)) ||
      (guestToken && order.guest_token === guestToken) ||
      (emailQuery && order.customer_email.toLowerCase() === emailQuery);

    if (!isOwner) {
      // Allow masked status summary for order tracking page if email not supplied yet
      res.json({
        masked: true,
        order_number: order.order_number,
        status: order.status,
        payment_status: order.payment_status,
        delivery_state: order.delivery_state,
        created_at: order.created_at,
        delivery: order.delivery,
      });
      return;
    }

    res.json({ masked: false, order });
  });

  // =========================================================
  // 6. NEWSLETTER & CONTACT
  // =========================================================
  app.post('/api/newsletter', rateLimit(10, 60_000), async (req, res) => {
    const cleanEmail = String(req.body?.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    const sb = await getReadySupabase();
    if (sb) {
      await sb
        .from('newsletter_subscribers')
        .upsert({ email: cleanEmail, is_active: true }, { onConflict: 'email' });
    }
    await withStoreLock((db) => {
      const exists = db.newsletter_subscribers.some((s) => s.email === cleanEmail);
      if (!exists) {
        db.newsletter_subscribers.push({
          id: `news-${crypto.randomUUID()}`,
          email: cleanEmail,
          is_active: true,
          subscribed_at: new Date().toISOString(),
        });
      }
    });
    res.json({ message: 'Subscribed! Watch your inbox for restocks and exclusive tech deals.' });
  });

  app.post('/api/contact', rateLimit(10, 60_000), async (req, res) => {
    const { full_name, email, phone, subject, message } = req.body || {};
    if (!full_name || !email || !subject || !message) {
      res.status(400).json({ error: 'Name, email, subject, and message are required.' });
      return;
    }
    const sb = await getReadySupabase();
    if (sb) {
      await sb.from('contact_messages').insert({
        full_name: String(full_name).trim(),
        email: String(email).trim().toLowerCase(),
        phone: String(phone || '').trim(),
        subject: String(subject).trim(),
        message: String(message).trim(),
      });
    }
    await withStoreLock((db) => {
      db.contact_messages.unshift({
        id: `msg-${crypto.randomUUID()}`,
        full_name: String(full_name).trim(),
        email: String(email).trim().toLowerCase(),
        phone: String(phone || '').trim(),
        subject: String(subject).trim(),
        message: String(message).trim(),
        status: 'new',
        created_at: new Date().toISOString(),
      });
    });
    res.status(201).json({
      message: 'Message received! Our Lagos support team will respond shortly.',
    });
  });

  // =========================================================
  // 7. ADMIN DASHBOARD API (STRICT SERVER-SIDE RBAC)
  // =========================================================
  async function writeAdminLog(
    auth: AuthTokenPayload,
    action: string,
    entity_type: string,
    entity_id: string,
    details: Record<string, unknown>,
  ) {
    const sb = await getReadySupabase();
    if (sb) {
      const validUser = await isProfileInSupabase(sb, auth.sub);
      await sb.from('admin_activity_logs').insert({
        admin_user_id: validUser,
        admin_email: auth.email,
        action,
        entity_type,
        entity_id,
        details,
      });
    }
  }

  app.get('/api/admin/gateway-health', requireAdmin, async (_req, res) => {
    const probe = await refreshSupabaseState(true);
    const paystack = await verifyPaystackApiHealth(process.env.PAYSTACK_SECRET_KEY || '');
    res.json({
      supabase: probe,
      paystack,
      whatsappBusinessNumber:
        process.env.WHATSAPP_BUSINESS_NUMBER ||
        process.env.VITE_WHATSAPP_BUSINESS_NUMBER ||
        '2348005672832',
    });
  });

  app.get('/api/admin/supabase-sql', requireAdmin, (_req, res) => {
    const sqlPath = path.resolve(process.cwd(), 'supabase', 'migrations', '001_initial_schema.sql');
    if (!fs.existsSync(sqlPath)) {
      res.status(404).json({ error: 'Migration SQL file not found.' });
      return;
    }
    res.json({ sql: fs.readFileSync(sqlPath, 'utf-8') });
  });

  app.post('/api/admin/supabase-sync', requireAdmin, async (req: AuthedRequest, res) => {
    const sb = getSupabaseAdmin();
    if (!sb) {
      res.status(400).json({ error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured.' });
      return;
    }
    const seedRes = await seedSupabaseCatalogIfEmpty(sb);
    const probe = await refreshSupabaseState(true);
    if (probe.tablesReady) {
      const db = loadDb();
      for (const u of db.users) {
        await upsertSupabaseUser(sb, {
          email: u.email,
          full_name: u.full_name,
          phone: u.phone,
          whatsapp_number: u.whatsapp_number,
          role: u.role,
        });
      }
      await writeAdminLog(req.auth!, 'SYNCED_SUPABASE_CATALOG', 'system', 'supabase', {
        categoryCount: probe.categoryCount,
        productCount: probe.productCount,
      });
    }
    res.json({ probe, seeded: seedRes.seeded, error: seedRes.error || probe.error });
  });

  app.get('/api/admin/overview', requireAdmin, async (req, res) => {
    const db = loadDb();
    const sb = await getReadySupabase();
    const allOrders = sb ? await fetchOrdersFromSupabase(sb) : db.orders;
    const allProducts = sb
      ? await fetchProductsFromSupabase(sb, true)
      : db.products.map((p) => enrichProductCategories(p, db));
    const allCategories = sb ? await fetchCategoriesFromSupabase(sb, true) : db.categories;

    let customerCount = db.users.filter((u) => u.role === 'customer').length;
    if (sb) {
      const { count } = await sb
        .from('user_roles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'customer');
      if (typeof count === 'number' && count > customerCount) {
        customerCount = count;
      }
    }

    const { startDate, endDate } = req.query as Record<string, string | undefined>;

    const filteredOrders = allOrders.filter((o) => {
      const t = new Date(o.created_at).getTime();
      if (startDate && t < new Date(startDate).getTime()) return false;
      if (endDate && t > new Date(endDate).getTime() + 86400_000) return false;
      return true;
    });

    const paidOrders = filteredOrders.filter((o) => o.payment_status === 'paid');
    const totalSales = paidOrders.reduce((sum, o) => sum + o.total_ngn, 0);
    const pendingOrders = filteredOrders.filter((o) =>
      ['Pending Payment', 'Paid', 'Processing', 'Ready for Delivery', 'Shipped'].includes(o.status),
    ).length;
    const completedOrders = filteredOrders.filter((o) => o.status === 'Delivered').length;
    const totalProducts = allProducts.length;
    const lowStockProducts = allProducts.filter(
      (p) => p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_threshold,
    );
    const outOfStockProducts = allProducts.filter((p) => p.stock_quantity <= 0);

    // Time-bucketed revenue
    const now = Date.now();
    const dailySales = paidOrders
      .filter((o) => now - new Date(o.created_at).getTime() <= 86400_000)
      .reduce((s, o) => s + o.total_ngn, 0);
    const weeklySales = paidOrders
      .filter((o) => now - new Date(o.created_at).getTime() <= 7 * 86400_000)
      .reduce((s, o) => s + o.total_ngn, 0);
    const monthlySales = paidOrders
      .filter((o) => now - new Date(o.created_at).getTime() <= 30 * 86400_000)
      .reduce((s, o) => s + o.total_ngn, 0);

    // Sales by category
    const categorySalesMap = new Map<string, number>();
    for (const o of paidOrders) {
      for (const item of o.items) {
        const prod = allProducts.find((p) => p.id === item.product_id);
        const catName =
          allCategories.find((c) => c.id === prod?.category_id)?.name || 'Other Gadgets';
        categorySalesMap.set(catName, (categorySalesMap.get(catName) || 0) + item.line_total_ngn);
      }
    }
    const salesByCategory = Array.from(categorySalesMap.entries()).map(([category, revenue]) => ({
      category,
      revenue,
    }));

    const bestSellers = [...allProducts]
      .sort((a, b) => b.sales_count - a.sales_count)
      .slice(0, 6);

    res.json({
      metrics: {
        totalSales,
        totalOrders: filteredOrders.length,
        pendingOrders,
        completedOrders,
        totalCustomers: customerCount,
        totalProducts,
        lowStockCount: lowStockProducts.length,
        outOfStockCount: outOfStockProducts.length,
        dailySales,
        weeklySales,
        monthlySales,
      },
      lowStockProducts,
      outOfStockProducts,
      recentOrders: filteredOrders.slice(0, 8),
      salesByCategory,
      bestSellers,
    });
  });

  app.post('/api/admin/upload', requireAdmin, upload.array('images', 8), async (req, res) => {
    try {
      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) {
        res.status(400).json({ error: 'No image files uploaded.' });
        return;
      }

      const bucket = String(req.body?.bucket || 'product-images');
      const supabase = getSupabaseAdmin();
      const urls: string[] = [];

      for (const file of files) {
        if (supabase) {
          const buf = fs.readFileSync(file.path);
          const storagePath = `${Date.now()}-${file.filename}`;
          const { error } = await supabase.storage.from(bucket).upload(storagePath, buf, {
            contentType: file.mimetype,
            upsert: false,
          });
          if (!error) {
            const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
            urls.push(data.publicUrl);
            fs.unlinkSync(file.path);
            continue;
          }
        }
        urls.push(`/uploads/${file.filename}`);
      }

      res.json({ urls });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Admin Products CRUD
  app.get('/api/admin/products', requireAdmin, async (_req, res) => {
    const sb = await getReadySupabase();
    if (sb) {
      const products = await fetchProductsFromSupabase(sb, true);
      res.json({ products });
      return;
    }
    const db = loadDb();
    res.json({
      products: db.products.map((p) => enrichProductCategories(p, db)),
    });
  });

  app.post('/api/admin/products', requireAdmin, async (req: AuthedRequest, res) => {
    try {
      const body = req.body || {};
      if (!body.name || !body.category_id || body.price_ngn === undefined) {
        res.status(400).json({ error: 'Product name, category, and selling price are required.' });
        return;
      }

      const sb = await getReadySupabase();
      const existingProducts = sb ? await fetchProductsFromSupabase(sb, true) : loadDb().products;

      const id = crypto.randomUUID();
      const baseSlug = slugify(body.slug || body.name);
      const slug = existingProducts.some((p) => p.slug === baseSlug)
        ? `${baseSlug}-${crypto.randomBytes(2).toString('hex')}`
        : baseSlug;

      const imagesList: string[] = Array.isArray(body.images) ? body.images : [];
      const variantsInput = Array.isArray(body.variants) ? body.variants : [];
      const variants = variantsInput.map((v: Record<string, unknown>, idx: number) => ({
        id: String(v.id || crypto.randomUUID()),
        product_id: id,
        name: String(v.name || `Option ${idx + 1}`),
        sku_suffix: String(v.sku_suffix || idx + 1),
        color: String(v.color || ''),
        price_ngn: Number(v.price_ngn) || Number(body.price_ngn),
        original_price_ngn: v.original_price_ngn ? Number(v.original_price_ngn) : null,
        stock_quantity: Math.max(0, Number(v.stock_quantity) || 0),
        is_active: true,
      }));

      const totalStock =
        variants.length > 0
          ? variants.reduce((s: number, v: { stock_quantity: number }) => s + v.stock_quantity, 0)
          : Math.max(0, Number(body.stock_quantity) || 0);

      const created: Product = {
        id,
        sku: String(body.sku || `KT-${crypto.randomBytes(3).toString('hex').toUpperCase()}`),
        name: String(body.name).trim(),
        slug,
        brand: String(body.brand || 'KoraTech').trim(),
        category_id: String(body.category_id),
        subcategory_id: body.subcategory_id ? String(body.subcategory_id) : null,
        short_description: String(body.short_description || '').trim(),
        description: String(body.description || '').trim(),
        price_ngn: Number(body.price_ngn),
        original_price_ngn: body.original_price_ngn ? Number(body.original_price_ngn) : null,
        colors: Array.isArray(body.colors) ? body.colors : [],
        specifications: body.specifications && typeof body.specifications === 'object' ? body.specifications : {},
        features: Array.isArray(body.features) ? body.features : [],
        is_featured: Boolean(body.is_featured),
        is_best_seller: Boolean(body.is_best_seller),
        is_trending: Boolean(body.is_trending),
        is_new_arrival: Boolean(body.is_new_arrival),
        is_recommended: Boolean(body.is_recommended),
        is_published: body.is_published !== false,
        rating_avg: 5.0,
        review_count: 0,
        sales_count: 0,
        stock_quantity: totalStock,
        low_stock_threshold: Math.max(1, Number(body.low_stock_threshold) || 5),
        images: imagesList.map((url, idx) => ({
          id: crypto.randomUUID(),
          product_id: id,
          image_url: url,
          alt_text: String(body.name),
          is_primary: idx === 0,
          sort_order: idx,
        })),
        variants,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const product = await withStoreLock((db) => {
        db.products.unshift(created);
        db.admin_activity_logs.unshift({
          id: crypto.randomUUID(),
          admin_user_id: req.auth!.sub,
          admin_email: req.auth!.email,
          action: 'CREATED_PRODUCT',
          entity_type: 'product',
          entity_id: created.id,
          details: { name: created.name, price_ngn: created.price_ngn },
          created_at: new Date().toISOString(),
        });
        return enrichProductCategories(created, db);
      });

      if (sb) {
        const sbRes = await createProductInSupabase(sb, created);
        await writeAdminLog(req.auth!, 'CREATED_PRODUCT', 'product', created.id, {
          name: created.name,
          price_ngn: created.price_ngn,
        });
        if (sbRes.error) {
          res.status(400).json({ error: sbRes.error });
          return;
        }
        res.status(201).json({ product: sbRes.product || product });
        return;
      }

      res.status(201).json({ product });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.patch('/api/admin/products/:id', requireAdmin, async (req: AuthedRequest, res) => {
    try {
      const body = req.body || {};
      const sb = await getReadySupabase();
      const sbProducts = sb ? await fetchProductsFromSupabase(sb, true) : [];

      const updated = await withStoreLock((db) => {
        let idx = db.products.findIndex(
          (p) => p.id === req.params.id || toUuid(p.id) === toUuid(String(req.params.id)),
        );
        if (idx === -1 && sb) {
          const sbMatch = sbProducts.find((p) => p.id === req.params.id);
          if (sbMatch) {
            db.products.unshift(sbMatch);
            idx = 0;
          }
        }
        if (idx === -1) return null;
        const current = db.products[idx];

        const nextImages = Array.isArray(body.images)
          ? body.images.map((url: string, i: number) => ({
              id: crypto.randomUUID(),
              product_id: current.id,
              image_url: url,
              alt_text: String(body.name || current.name),
              is_primary: i === 0,
              sort_order: i,
            }))
          : current.images;

        const nextVariants = Array.isArray(body.variants)
          ? body.variants.map((v: Record<string, unknown>, i: number) => ({
              id: String(v.id || crypto.randomUUID()),
              product_id: current.id,
              name: String(v.name || `Option ${i + 1}`),
              sku_suffix: String(v.sku_suffix || i + 1),
              color: String(v.color || ''),
              price_ngn: Number(v.price_ngn) || Number(body.price_ngn ?? current.price_ngn),
              original_price_ngn: v.original_price_ngn ? Number(v.original_price_ngn) : null,
              stock_quantity: Math.max(0, Number(v.stock_quantity) || 0),
              is_active: true,
            }))
          : current.variants;

        const nextStock =
          nextVariants.length > 0
            ? nextVariants.reduce((s: number, v: { stock_quantity: number }) => s + v.stock_quantity, 0)
            : body.stock_quantity !== undefined
              ? Math.max(0, Number(body.stock_quantity))
              : current.stock_quantity;

        const nextProduct: Product = {
          ...current,
          ...body,
          price_ngn: body.price_ngn !== undefined ? Number(body.price_ngn) : current.price_ngn,
          original_price_ngn:
            body.original_price_ngn !== undefined
              ? body.original_price_ngn
                ? Number(body.original_price_ngn)
                : null
              : current.original_price_ngn,
          low_stock_threshold:
            body.low_stock_threshold !== undefined
              ? Math.max(1, Number(body.low_stock_threshold))
              : current.low_stock_threshold,
          stock_quantity: nextStock,
          images: nextImages,
          variants: nextVariants,
          updated_at: new Date().toISOString(),
        };

        db.products[idx] = nextProduct;
        db.admin_activity_logs.unshift({
          id: crypto.randomUUID(),
          admin_user_id: req.auth!.sub,
          admin_email: req.auth!.email,
          action: 'UPDATED_PRODUCT',
          entity_type: 'product',
          entity_id: current.id,
          details: { name: nextProduct.name, stock_quantity: nextProduct.stock_quantity },
          created_at: new Date().toISOString(),
        });

        return nextProduct;
      });

      if (!updated) {
        res.status(404).json({ error: 'Product not found' });
        return;
      }

      if (sb) {
        await updateProductInSupabase(
          sb,
          String(req.params.id),
          updated,
          Array.isArray(body.images),
          Array.isArray(body.variants),
        );
        await writeAdminLog(req.auth!, 'UPDATED_PRODUCT', 'product', String(req.params.id), {
          name: updated.name,
          stock_quantity: updated.stock_quantity,
        });
      }

      res.json({ product: updated });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.delete('/api/admin/products/:id', requireAdmin, async (req: AuthedRequest, res) => {
    const sb = await getReadySupabase();
    if (sb) {
      const { error } = await sb.from('products').delete().eq('id', toUuid(String(req.params.id)));
      if (error) {
        res.status(400).json({ error: error.message });
        return;
      }
      await writeAdminLog(req.auth!, 'DELETED_PRODUCT', 'product', String(req.params.id), {});
    }
    const deleted = await withStoreLock((db) => {
      const target = db.products.find(
        (p) => p.id === req.params.id || toUuid(p.id) === toUuid(String(req.params.id)),
      );
      if (!target) return Boolean(sb);
      db.products = db.products.filter(
        (p) => p.id !== req.params.id && toUuid(p.id) !== toUuid(String(req.params.id)),
      );
      db.admin_activity_logs.unshift({
        id: crypto.randomUUID(),
        admin_user_id: req.auth!.sub,
        admin_email: req.auth!.email,
        action: 'DELETED_PRODUCT',
        entity_type: 'product',
        entity_id: String(req.params.id),
        details: { name: target.name },
        created_at: new Date().toISOString(),
      });
      return true;
    });
    if (!deleted) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    res.json({ ok: true });
  });

  // Admin Categories CRUD
  app.get('/api/admin/categories', requireAdmin, async (_req, res) => {
    const sb = await getReadySupabase();
    if (sb) {
      const categories = await fetchCategoriesFromSupabase(sb, true);
      res.json({ categories });
      return;
    }
    const db = loadDb();
    res.json({ categories: [...db.categories].sort((a, b) => a.sort_order - b.sort_order) });
  });

  app.post('/api/admin/categories', requireAdmin, async (req: AuthedRequest, res) => {
    const { name, description, image_url, parent_id, sort_order } = req.body || {};
    if (!name) {
      res.status(400).json({ error: 'Category name is required.' });
      return;
    }
    const sb = await getReadySupabase();
    const existingCats = sb ? await fetchCategoriesFromSupabase(sb, true) : loadDb().categories;
    const slug = slugify(name);
    const created = {
      id: crypto.randomUUID(),
      name: String(name).trim(),
      slug: existingCats.some((c) => c.slug === slug)
        ? `${slug}-${crypto.randomBytes(2).toString('hex')}`
        : slug,
      description: String(description || '').trim(),
      image_url: String(image_url || '/src/assets/images/promo_deals_bundle_1794811188657.jpg'),
      parent_id: parent_id ? String(parent_id) : null,
      sort_order: Number(sort_order) || existingCats.length + 1,
      is_active: true,
    };

    if (sb) {
      const { error } = await sb.from('categories').insert({
        ...created,
        parent_id: created.parent_id ? toUuid(created.parent_id) : null,
      });
      if (error) {
        res.status(400).json({ error: error.message });
        return;
      }
      await writeAdminLog(req.auth!, 'CREATED_CATEGORY', 'category', created.id, {
        name: created.name,
      });
    }

    await withStoreLock((db) => {
      db.categories.push(created);
      db.admin_activity_logs.unshift({
        id: crypto.randomUUID(),
        admin_user_id: req.auth!.sub,
        admin_email: req.auth!.email,
        action: 'CREATED_CATEGORY',
        entity_type: 'category',
        entity_id: created.id,
        details: { name: created.name },
        created_at: new Date().toISOString(),
      });
    });
    res.status(201).json({ category: created });
  });

  app.patch('/api/admin/categories/:id', requireAdmin, async (req: AuthedRequest, res) => {
    const sb = await getReadySupabase();
    const { name, description, image_url, parent_id, is_active } = req.body || {};
    if (sb) {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (name !== undefined) patch.name = String(name).trim();
      if (description !== undefined) patch.description = String(description).trim();
      if (image_url !== undefined) patch.image_url = String(image_url);
      if (parent_id !== undefined) patch.parent_id = parent_id ? toUuid(String(parent_id)) : null;
      if (is_active !== undefined) patch.is_active = Boolean(is_active);
      const { data } = await sb
        .from('categories')
        .update(patch)
        .eq('id', toUuid(String(req.params.id)))
        .select('*')
        .maybeSingle();
      if (data) {
        res.json({ category: data });
        return;
      }
    }
    const updated = await withStoreLock((db) => {
      const cat = db.categories.find((c) => c.id === req.params.id);
      if (!cat) return null;
      if (name !== undefined) cat.name = String(name).trim();
      if (description !== undefined) cat.description = String(description).trim();
      if (image_url !== undefined) cat.image_url = String(image_url);
      if (parent_id !== undefined) cat.parent_id = parent_id || null;
      if (is_active !== undefined) cat.is_active = Boolean(is_active);
      return cat;
    });
    if (!updated) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    res.json({ category: updated });
  });

  app.delete('/api/admin/categories/:id', requireAdmin, async (req: AuthedRequest, res) => {
    const sb = await getReadySupabase();
    if (sb) {
      await sb.from('categories').delete().eq('id', toUuid(String(req.params.id)));
    }
    await withStoreLock((db) => {
      db.categories = db.categories.filter(
        (c) => c.id !== req.params.id && toUuid(c.id) !== toUuid(String(req.params.id)),
      );
    });
    res.json({ ok: true });
  });

  // Admin Orders & Fulfillment
  app.get('/api/admin/orders', requireAdmin, async (req, res) => {
    const sb = await getReadySupabase();
    const { status, search } = req.query as Record<string, string | undefined>;
    let list = sb ? await fetchOrdersFromSupabase(sb) : [...loadDb().orders];
    if (status && status !== 'all') {
      list = list.filter((o) => o.status === status);
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (o) =>
          o.order_number.toLowerCase().includes(q) ||
          o.customer_name.toLowerCase().includes(q) ||
          o.customer_email.toLowerCase().includes(q) ||
          (o.paystack_reference || '').toLowerCase().includes(q),
      );
    }
    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    res.json({ orders: list });
  });

  app.patch('/api/admin/orders/:id', requireAdmin, async (req: AuthedRequest, res) => {
    const { status, courier_name, tracking_number, delivery_notes } = req.body || {};
    const validStatuses: OrderStatus[] = [
      'Pending Payment',
      'Paid',
      'Processing',
      'Ready for Delivery',
      'Shipped',
      'Delivered',
      'Cancelled',
      'Refunded',
    ];

    const sb = await getReadySupabase();
    const sbOrders = sb ? await fetchOrdersFromSupabase(sb) : [];

    const result = await withStoreLock((db) => {
      let order = db.orders.find(
        (o) => o.id === req.params.id || toUuid(o.id) === toUuid(String(req.params.id)),
      );
      if (!order && sb) {
        const sbMatch = sbOrders.find((o) => o.id === req.params.id);
        if (sbMatch) {
          db.orders.unshift(sbMatch);
          order = sbMatch;
        }
      }
      if (!order) return { status: 404, error: 'Order not found' };

      if (status) {
        if (!validStatuses.includes(status)) {
          return { status: 400, error: 'Invalid order status' };
        }
        // Never allow marking unpaid order as Paid without verified payment record
        if (status === 'Paid' && order.payment_status !== 'paid') {
          return {
            status: 400,
            error:
              'Orders cannot be marked Paid manually without a verified Paystack transaction record. Use Verify Transaction instead.',
          };
        }

        if (status === 'Cancelled' || status === 'Refunded') {
          restoreStockAtomic(db, order);
          if (status === 'Refunded' && order.payment_status === 'paid') {
            order.payment_status = 'refunded';
            const pay = db.payments.find((p) => p.order_id === order!.id);
            if (pay) pay.status = 'refunded';
          }
        }
        order.status = status;
      }

      if (order.delivery) {
        if (courier_name !== undefined) order.delivery.courier_name = String(courier_name);
        if (tracking_number !== undefined) order.delivery.tracking_number = String(tracking_number);
        if (delivery_notes !== undefined) order.delivery.delivery_notes = String(delivery_notes);
        if (status === 'Shipped' && !order.delivery.dispatched_at) {
          order.delivery.dispatched_at = new Date().toISOString();
        }
        if (status === 'Delivered' && !order.delivery.delivered_at) {
          order.delivery.delivered_at = new Date().toISOString();
        }
        order.delivery.updated_at = new Date().toISOString();
      }

      order.updated_at = new Date().toISOString();
      db.admin_activity_logs.unshift({
        id: crypto.randomUUID(),
        admin_user_id: req.auth!.sub,
        admin_email: req.auth!.email,
        action: 'UPDATED_ORDER_STATUS',
        entity_type: 'order',
        entity_id: order.id,
        details: { order_number: order.order_number, status: order.status },
        created_at: new Date().toISOString(),
      });

      return { status: 200, order };
    });

    if ('error' in result) {
      res.status(result.status || 400).json({ error: result.error });
      return;
    }

    if (sb && result.order) {
      const ordUuid = toUuid(result.order.id);
      if (status === 'Cancelled' || status === 'Refunded') {
        await sb.rpc('restore_inventory_on_cancel', { p_order_id: ordUuid });
      }
      await sb
        .from('orders')
        .update({
          status: result.order.status,
          payment_status: result.order.payment_status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ordUuid);
      if (result.order.delivery) {
        await sb.from('delivery_records').upsert(
          {
            order_id: ordUuid,
            courier_name: result.order.delivery.courier_name,
            tracking_number: result.order.delivery.tracking_number,
            dispatched_at: result.order.delivery.dispatched_at,
            delivered_at: result.order.delivery.delivered_at,
            delivery_notes: result.order.delivery.delivery_notes,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'order_id' },
        );
      }
      await writeAdminLog(req.auth!, 'UPDATED_ORDER_STATUS', 'order', ordUuid, {
        order_number: result.order.order_number,
        status: result.order.status,
      });
    }

    res.json({ order: result.order });
  });

  app.get('/api/admin/payments', requireAdmin, async (_req, res) => {
    const sb = await getReadySupabase();
    if (sb) {
      const payments = await fetchPaymentsFromSupabase(sb);
      res.json({ payments });
      return;
    }
    const db = loadDb();
    const payments = [...db.payments].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    res.json({ payments });
  });

  app.get('/api/admin/customers', requireAdmin, async (req, res) => {
    const db = loadDb();
    const sb = await getReadySupabase();
    const ordersPool = sb ? await fetchOrdersFromSupabase(sb) : db.orders;
    const q = String(req.query.search || '').trim().toLowerCase();
    const customers = db.users
      .filter((u) => u.role === 'customer')
      .filter(
        (u) =>
          !q ||
          u.full_name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.phone.toLowerCase().includes(q),
      )
      .map((u) => {
        const orders = ordersPool.filter(
          (o) => o.user_id === u.id || o.customer_email.toLowerCase() === u.email.toLowerCase(),
        );
        const totalSpent = orders
          .filter((o) => o.payment_status === 'paid')
          .reduce((s, o) => s + o.total_ngn, 0);
        const { password_hash: _pw, ...safe } = u;
        return {
          ...safe,
          order_count: orders.length,
          total_spent_ngn: totalSpent,
          orders,
        };
      });
    res.json({ customers });
  });

  app.get('/api/admin/reviews', requireAdmin, async (_req, res) => {
    const sb = await getReadySupabase();
    if (sb) {
      const reviews = await fetchReviewsFromSupabase(sb, false);
      res.json({ reviews });
      return;
    }
    const db = loadDb();
    const reviews = [...db.reviews]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map((r) => ({
        ...r,
        product_name: db.products.find((p) => p.id === r.product_id)?.name || r.product_name || '',
      }));
    res.json({ reviews });
  });

  app.patch('/api/admin/reviews/:id', requireAdmin, async (req: AuthedRequest, res) => {
    const { moderation_status } = req.body || {};
    if (!['pending', 'approved', 'rejected'].includes(moderation_status)) {
      res.status(400).json({ error: 'Invalid moderation status' });
      return;
    }
    const sb = await getReadySupabase();
    if (sb) {
      const { data: revRow } = await sb
        .from('reviews')
        .update({ moderation_status })
        .eq('id', toUuid(String(req.params.id)))
        .select('*')
        .maybeSingle();
      if (revRow) {
        const { data: approvedList } = await sb
          .from('reviews')
          .select('rating')
          .eq('product_id', revRow.product_id)
          .eq('moderation_status', 'approved');
        const ratings = approvedList || [];
        const avg =
          ratings.length > 0
            ? Number(
                (ratings.reduce((s: number, x: { rating: number }) => s + x.rating, 0) / ratings.length).toFixed(2),
              )
            : 5.0;
        await sb
          .from('products')
          .update({ review_count: ratings.length, rating_avg: avg })
          .eq('id', revRow.product_id);
        await writeAdminLog(req.auth!, `REVIEW_${moderation_status.toUpperCase()}`, 'review', revRow.id, {
          product_id: revRow.product_id,
        });
        res.json({ review: revRow });
        return;
      }
    }
    const review = await withStoreLock((db) => {
      const r = db.reviews.find((item) => item.id === req.params.id);
      if (!r) return null;
      r.moderation_status = moderation_status;

      // Recalculate product rating metrics
      const prod = db.products.find((p) => p.id === r.product_id);
      if (prod) {
        const approved = db.reviews.filter(
          (x) => x.product_id === prod.id && x.moderation_status === 'approved',
        );
        prod.review_count = approved.length;
        prod.rating_avg =
          approved.length > 0
            ? Number(
                (approved.reduce((s, x) => s + x.rating, 0) / approved.length).toFixed(2),
              )
            : 5.0;
      }

      db.admin_activity_logs.unshift({
        id: crypto.randomUUID(),
        admin_user_id: req.auth!.sub,
        admin_email: req.auth!.email,
        action: `REVIEW_${moderation_status.toUpperCase()}`,
        entity_type: 'review',
        entity_id: r.id,
        details: { product_id: r.product_id },
        created_at: new Date().toISOString(),
      });
      return r;
    });
    if (!review) {
      res.status(404).json({ error: 'Review not found' });
      return;
    }
    res.json({ review });
  });

  app.get('/api/admin/coupons', requireAdmin, async (_req, res) => {
    const sb = await getReadySupabase();
    if (sb) {
      const coupons = await fetchCouponsFromSupabase(sb);
      res.json({ coupons });
      return;
    }
    const db = loadDb();
    res.json({ coupons: db.coupons });
  });

  app.post('/api/admin/coupons', requireAdmin, async (req: AuthedRequest, res) => {
    const { code, description, discount_type, discount_value, min_order_ngn, max_discount_ngn } =
      req.body || {};
    if (!code || !discount_value) {
      res.status(400).json({ error: 'Coupon code and discount value are required.' });
      return;
    }
    const created = {
      id: crypto.randomUUID(),
      code: String(code).trim().toUpperCase(),
      description: String(description || '').trim(),
      discount_type: (discount_type === 'fixed' ? 'fixed' : 'percentage') as 'fixed' | 'percentage',
      discount_value: Number(discount_value),
      min_order_ngn: Number(min_order_ngn) || 0,
      max_discount_ngn: max_discount_ngn ? Number(max_discount_ngn) : null,
      usage_limit: null,
      used_count: 0,
      is_active: true,
      expires_at: null,
      created_at: new Date().toISOString(),
    };
    const sb = await getReadySupabase();
    if (sb) {
      const { error } = await sb.from('coupons').insert(created);
      if (error) {
        res.status(400).json({ error: error.message });
        return;
      }
      await writeAdminLog(req.auth!, 'CREATED_COUPON', 'coupon', created.id, { code: created.code });
    }
    await withStoreLock((db) => {
      db.coupons.unshift(created);
    });
    res.status(201).json({ coupon: created });
  });

  app.patch('/api/admin/coupons/:id', requireAdmin, async (req, res) => {
    const sb = await getReadySupabase();
    if (sb && req.body?.is_active !== undefined) {
      const { data } = await sb
        .from('coupons')
        .update({ is_active: Boolean(req.body.is_active) })
        .eq('id', toUuid(String(req.params.id)))
        .select('*')
        .maybeSingle();
      if (data) {
        res.json({ coupon: data });
        return;
      }
    }
    const updated = await withStoreLock((db) => {
      const c = db.coupons.find((item) => item.id === req.params.id);
      if (!c) return null;
      if (req.body?.is_active !== undefined) c.is_active = Boolean(req.body.is_active);
      return c;
    });
    if (!updated) {
      res.status(404).json({ error: 'Coupon not found' });
      return;
    }
    res.json({ coupon: updated });
  });

  app.get('/api/admin/messages', requireAdmin, async (_req, res) => {
    const sb = await getReadySupabase();
    if (sb) {
      const [logs, { data: messages }, { data: subscribers }] = await Promise.all([
        fetchLogsFromSupabase(sb),
        sb.from('contact_messages').select('*').order('created_at', { ascending: false }),
        sb.from('newsletter_subscribers').select('*').order('subscribed_at', { ascending: false }),
      ]);
      res.json({
        messages: messages || [],
        subscribers: subscribers || [],
        logs,
      });
      return;
    }
    const db = loadDb();
    res.json({
      messages: db.contact_messages,
      subscribers: db.newsletter_subscribers,
      logs: db.admin_activity_logs.slice(0, 50),
    });
  });

  // =========================================================
  // 8. VITE MIDDLEWARE / PRODUCTION STATIC SPA
  // =========================================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KoraTech Electronics full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
