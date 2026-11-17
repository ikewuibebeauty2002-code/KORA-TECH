import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Copy,
  CreditCard,
  Database,
  Download,
  ExternalLink,
  FolderTree,
  Lock,
  MessageSquare,
  Package,
  Plus,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { apiRequest } from '../lib/api';
import type {
  AdminActivityLog,
  Category,
  Coupon,
  Order,
  OrderStatus,
  PaymentRecord,
  Product,
  Review,
} from '../types/ecommerce';
import { formatDateTime, formatNaira, sanitizeWhatsappNumber } from '../utils/format';
import { AdminProductModal } from '../components/admin/AdminProductModal';

interface GatewayHealthResponse {
  supabase: {
    configured: boolean;
    tablesReady: boolean;
    categoryCount: number;
    productCount: number;
    keyRole?: string;
    error?: string;
  };
  paystack: {
    reachable: boolean;
    validKey: boolean;
    mode: 'live' | 'test' | 'unconfigured';
    message: string;
  };
  whatsappBusinessNumber: string;
}

type AdminTab =
  | 'overview'
  | 'upload'
  | 'products'
  | 'categories'
  | 'orders'
  | 'payments'
  | 'customers'
  | 'reviews'
  | 'settings';

interface OverviewResponse {
  metrics: {
    totalSales: number;
    totalOrders: number;
    pendingOrders: number;
    completedOrders: number;
    totalCustomers: number;
    totalProducts: number;
    lowStockCount: number;
    outOfStockCount: number;
    dailySales: number;
    weeklySales: number;
    monthlySales: number;
  };
  lowStockProducts: Product[];
  outOfStockProducts: Product[];
  recentOrders: Order[];
  salesByCategory: Array<{ category: string; revenue: number }>;
  bestSellers: Product[];
}

interface CustomerRow {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  whatsapp_number: string;
  order_count: number;
  total_spent_ngn: number;
  orders: Order[];
  created_at: string;
}

const ORDER_STATUSES: OrderStatus[] = [
  'Pending Payment',
  'Paid',
  'Processing',
  'Ready for Delivery',
  'Shipped',
  'Delivered',
  'Cancelled',
  'Refunded',
];

export function AdminDashboardPage() {
  const { user, loading, gatewayConfig, login, loginWithPasscode, logout } = useAuth();
  const { notify, refreshCart } = useCart();

  const [accessCode, setAccessCode] = useState('');
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');
  const [sqlScript, setSqlScript] = useState('');
  const [loadingSql, setLoadingSql] = useState(false);

  const [tab, setTab] = useState<AdminTab>('overview');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [logs, setLogs] = useState<AdminActivityLog[]>([]);
  const [gatewayHealth, setGatewayHealth] = useState<GatewayHealthResponse | null>(null);
  const [syncingSupabase, setSyncingSupabase] = useState(false);

  const [editingProduct, setEditingProduct] = useState<Product | null | undefined>(undefined);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<Order | null>(null);
  const [trackingDraft, setTrackingDraft] = useState('');
  const [courierDraft, setCourierDraft] = useState('');

  // Category creation state
  const [catName, setCatName] = useState('');
  const [catParent, setCatParent] = useState('');
  const [catDesc, setCatDesc] = useState('');

  // Coupon creation state
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponType, setNewCouponType] = useState<'percentage' | 'fixed'>('percentage');
  const [newCouponValue, setNewCouponValue] = useState('5');
  const [newCouponMin, setNewCouponMin] = useState('30000');

  const isAdmin = user && (user.role === 'admin' || user.role === 'super_admin');

  const loadAll = useCallback(async () => {
    if (!isAdmin) return;
    const qs = new URLSearchParams();
    if (startDate) qs.set('startDate', startDate);
    if (endDate) qs.set('endDate', endDate);

    const [ov, prods, cats, ords, pays, custs, revs, coups, msgs, health] = await Promise.all([
      apiRequest<OverviewResponse>(`/api/admin/overview?${qs.toString()}`),
      apiRequest<{ products: Product[] }>('/api/admin/products'),
      apiRequest<{ categories: Category[] }>('/api/admin/categories'),
      apiRequest<{ orders: Order[] }>(
        `/api/admin/orders?status=${encodeURIComponent(orderStatusFilter)}&search=${encodeURIComponent(orderSearch)}`,
      ),
      apiRequest<{ payments: PaymentRecord[] }>('/api/admin/payments'),
      apiRequest<{ customers: CustomerRow[] }>(
        `/api/admin/customers?search=${encodeURIComponent(customerSearch)}`,
      ),
      apiRequest<{ reviews: Review[] }>('/api/admin/reviews'),
      apiRequest<{ coupons: Coupon[] }>('/api/admin/coupons'),
      apiRequest<{ logs: AdminActivityLog[] }>('/api/admin/messages'),
      apiRequest<GatewayHealthResponse>('/api/admin/gateway-health').catch(() => null),
    ]);

    setOverview(ov);
    setProducts(prods.products || []);
    setCategories(cats.categories || []);
    setOrders(ords.orders || []);
    setPayments(pays.payments || []);
    setCustomers(custs.customers || []);
    setReviews(revs.reviews || []);
    setCoupons(coups.coupons || []);
    setLogs(msgs.logs || []);
    if (health) setGatewayHealth(health);
  }, [isAdmin, startDate, endDate, orderStatusFilter, orderSearch, customerSearch]);

  useEffect(() => {
    document.title = 'Admin Dashboard | KoraTech Electronics';
    loadAll().catch(() => {});
  }, [loadAll]);

  const handlePasscodeSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSubmitting(true);
    try {
      const signedIn = await loginWithPasscode(accessCode);
      await refreshCart();
      notify(`Welcome to Admin Dashboard, ${signedIn.full_name}`, 'success');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Invalid admin access code');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleAdminSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSubmitting(true);
    try {
      const signedIn = await login(adminEmail, adminPassword);
      await refreshCart();
      if (signedIn.role !== 'admin' && signedIn.role !== 'super_admin') {
        setAuthError('Signed-in account does not have administrator privileges.');
      } else {
        notify(`Signed in to Admin Dashboard as ${signedIn.full_name}`, 'success');
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Admin sign in failed');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLoadSql = async () => {
    setLoadingSql(true);
    try {
      const res = await apiRequest<{ sql: string }>('/api/admin/supabase-sql');
      setSqlScript(res.sql || '');
      return res.sql || '';
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to load SQL script', 'error');
      return '';
    } finally {
      setLoadingSql(false);
    }
  };

  const handleCopySql = async () => {
    const script = sqlScript || (await handleLoadSql());
    if (!script) return;
    try {
      await navigator.clipboard.writeText(script);
      notify('Supabase SQL migration script copied to clipboard!', 'success');
    } catch {
      notify('SQL script loaded below — copy it manually.', 'info');
    }
  };

  if (loading) {
    return <div className="max-w-7xl mx-auto px-4 py-16 text-sm text-slate-500">Verifying admin credentials...</div>;
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-14">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">KoraTech Admin Dashboard</h1>
              <p className="text-xs text-slate-500">
                Enter your admin access code to upload products, manage pages, and track orders.
              </p>
            </div>
          </div>

          {authError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
              {authError}
            </div>
          )}

          {!showEmailLogin ? (
            <form onSubmit={handlePasscodeSignIn} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Admin Access Code
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="Enter access code (e.g. CHINNY123)"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg font-mono tracking-wider"
                />
              </div>
              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg inline-flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4" />
                {authSubmitting ? 'Verifying...' : 'Unlock Admin Dashboard'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleAdminSignIn} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Admin Email</label>
                <input
                  type="email"
                  required
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@koratech.ng"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg inline-flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4" />
                {authSubmitting ? 'Signing in...' : 'Open Admin Dashboard'}
              </button>
            </form>
          )}

          <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setShowEmailLogin((v) => !v);
                setAuthError('');
              }}
              className="text-blue-700 font-semibold hover:underline"
            >
              {showEmailLogin ? 'Use Access Code instead' : 'Sign in with Email & Password'}
            </button>
            {showEmailLogin && (
              <button
                type="button"
                onClick={() => {
                  setAdminEmail('admin@koratech.ng');
                  setAdminPassword('CHINNY123');
                }}
                className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 rounded text-blue-800 font-semibold"
              >
                Fill Admin
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <AlertTriangle className="w-10 h-10 text-red-600 mx-auto" />
        <h1 className="text-2xl font-bold text-slate-900">Access Denied</h1>
        <p className="text-sm text-slate-600">
          This area is restricted to authorized KoraTech administrators. Customer accounts ({user.email}) cannot access store management tools.
        </p>
        <button
          type="button"
          onClick={() => logout()}
          className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
        >
          Sign Out & Switch to Admin Account
        </button>
      </div>
    );
  }

  const handleTogglePublish = async (p: Product) => {
    await apiRequest(`/api/admin/products/${p.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_published: !p.is_published }),
    });
    notify(p.is_published ? 'Product unpublished' : 'Product published', 'info');
    loadAll();
  };

  const handleDeleteProduct = async (p: Product) => {
    await apiRequest(`/api/admin/products/${p.id}`, { method: 'DELETE' });
    notify('Product deleted', 'info');
    loadAll();
  };

  const handleOrderStatusUpdate = async (orderId: string, status: OrderStatus) => {
    try {
      await apiRequest(`/api/admin/orders/${orderId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          courier_name: courierDraft || undefined,
          tracking_number: trackingDraft || undefined,
        }),
      });
      notify(`Order updated to ${status}`, 'success');
      setSelectedOrderDetail(null);
      loadAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Status update failed', 'error');
    }
  };

  const handleExportSalesCsv = () => {
    const rows = [
      ['Order Number', 'Customer', 'Email', 'State', 'Payment Status', 'Order Status', 'Total NGN', 'Paystack Ref', 'Date'],
      ...orders.map((o) => [
        o.order_number,
        o.customer_name,
        o.customer_email,
        o.delivery_state,
        o.payment_status,
        o.status,
        String(o.total_ngn),
        o.paystack_reference || '',
        o.created_at,
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `koratech-sales-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    await apiRequest('/api/admin/categories', {
      method: 'POST',
      body: JSON.stringify({ name: catName, parent_id: catParent || null, description: catDesc }),
    });
    setCatName('');
    setCatDesc('');
    setCatParent('');
    notify('Category created', 'success');
    loadAll();
  };

  const handleModerateReview = async (id: string, moderation_status: 'approved' | 'rejected') => {
    await apiRequest(`/api/admin/reviews/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ moderation_status }),
    });
    notify(`Review ${moderation_status}`, 'success');
    loadAll();
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest('/api/admin/coupons', {
      method: 'POST',
      body: JSON.stringify({
        code: newCouponCode,
        discount_type: newCouponType,
        discount_value: Number(newCouponValue),
        min_order_ngn: Number(newCouponMin) || 0,
        description: `${newCouponCode.toUpperCase()} promo discount`,
      }),
    });
    setNewCouponCode('');
    notify('Coupon created', 'success');
    loadAll();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6 mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
            KoraTech Store Administration
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            Operations & Inventory Dashboard
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExportSalesCsv}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
          >
            <Download className="w-4 h-4" />
            Export Sales CSV
          </button>
          <button
            type="button"
            onClick={() => setTab('upload')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
          >
            <Upload className="w-4 h-4" />
            Upload Item
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Sidebar Navigation */}
        <aside className="lg:col-span-3 flex lg:flex-col gap-1.5 overflow-x-auto pb-2 lg:pb-0">
          {(
            [
              { id: 'overview', label: 'Overview & Reports', icon: BarChart3 },
              { id: 'upload', label: 'Upload Products / Items', icon: Upload },
              { id: 'products', label: 'Products & Stock', icon: Package },
              { id: 'categories', label: 'Categories', icon: FolderTree },
              { id: 'orders', label: 'Orders & Fulfillment', icon: ShoppingCart },
              { id: 'payments', label: 'Payments', icon: CreditCard },
              { id: 'customers', label: 'Customers', icon: Users },
              { id: 'reviews', label: 'Reviews & Coupons', icon: MessageSquare },
              { id: 'settings', label: 'Gateway & Logs', icon: Settings },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                tab === item.id
                  ? 'bg-blue-700 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          ))}
        </aside>

        {/* Main Workspace */}
        <div className="lg:col-span-9 space-y-6">
          {tab === 'upload' && (
            <AdminProductModal
              product={null}
              categories={categories}
              inline
              onClose={() => setTab('products')}
              onSaved={(saved) => {
                notify(
                  saved
                    ? `"${saved.name}" uploaded & live on ${saved.category_name || 'storefront'}!`
                    : 'Item uploaded & published to website!',
                  'success',
                );
                loadAll();
                setTab('products');
              }}
            />
          )}
          {/* 1. OVERVIEW & SALES REPORTS */}
          {tab === 'overview' && overview && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
                <span className="text-xs font-semibold text-slate-700">Date Filter:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                />
                {(startDate || endDate) && (
                  <button
                    type="button"
                    onClick={() => {
                      setStartDate('');
                      setEndDate('');
                    }}
                    className="text-xs text-blue-700 font-semibold"
                  >
                    Reset
                  </button>
                )}
              </div>

              {/* Primary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Total Verified Sales', val: formatNaira(overview.metrics.totalSales) },
                  { label: 'Total Orders', val: String(overview.metrics.totalOrders) },
                  { label: 'Pending Fulfillment', val: String(overview.metrics.pendingOrders) },
                  { label: 'Completed Orders', val: String(overview.metrics.completedOrders) },
                  { label: 'Registered Customers', val: String(overview.metrics.totalCustomers) },
                  { label: 'Total Products', val: String(overview.metrics.totalProducts) },
                  { label: 'Low Stock Alerts', val: String(overview.metrics.lowStockCount) },
                  { label: 'Out of Stock', val: String(overview.metrics.outOfStockCount) },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-xs text-slate-500">{kpi.label}</p>
                    <p className="text-xl font-extrabold text-slate-900 font-mono tabular-nums mt-1">
                      {kpi.val}
                    </p>
                  </div>
                ))}
              </div>

              {/* Revenue Time Windows + Sales by Category */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                  <h2 className="text-sm font-bold text-slate-900">Sales Performance</h2>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-600">Daily Sales (24h)</span>
                      <span className="font-mono font-bold">{formatNaira(overview.metrics.dailySales)}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-600">Weekly Sales (7d)</span>
                      <span className="font-mono font-bold">{formatNaira(overview.metrics.weeklySales)}</span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-slate-600">Monthly Sales (30d)</span>
                      <span className="font-mono font-bold text-blue-700">{formatNaira(overview.metrics.monthlySales)}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                  <h2 className="text-sm font-bold text-slate-900">Sales by Category</h2>
                  {overview.salesByCategory.length === 0 ? (
                    <p className="text-xs text-slate-500">No verified sales recorded in this period.</p>
                  ) : (
                    <div className="space-y-2 text-sm">
                      {overview.salesByCategory.map((row) => (
                        <div key={row.category} className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-700">{row.category}</span>
                          <span className="font-mono font-semibold">{formatNaira(row.revenue)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Low Stock Alerts & Recent Orders */}
              {(overview.lowStockProducts.length > 0 || overview.outOfStockProducts.length > 0) && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 space-y-2">
                  <h3 className="text-sm font-bold text-orange-900">Inventory Alerts</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {overview.outOfStockProducts.map((p) => (
                      <div key={p.id} className="bg-white px-3 py-2 rounded border border-red-200 flex justify-between">
                        <span className="font-medium text-slate-900 truncate">{p.name}</span>
                        <span className="font-bold text-red-600 shrink-0">0 left</span>
                      </div>
                    ))}
                    {overview.lowStockProducts.map((p) => (
                      <div key={p.id} className="bg-white px-3 py-2 rounded border border-orange-200 flex justify-between">
                        <span className="font-medium text-slate-900 truncate">{p.name}</span>
                        <span className="font-bold text-orange-700 shrink-0">{p.stock_quantity} left</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 font-bold text-sm text-slate-900">
                  Recent Orders
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-500 uppercase">
                      <tr>
                        <th className="px-4 py-3">Order</th>
                        <th className="px-4 py-3">Customer</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {overview.recentOrders.map((o) => (
                        <tr key={o.id}>
                          <td className="px-4 py-3 font-mono font-semibold">{o.order_number}</td>
                          <td className="px-4 py-3">{o.customer_name}</td>
                          <td className="px-4 py-3">{o.status}</td>
                          <td className="px-4 py-3 text-right font-mono font-bold">{formatNaira(o.total_ngn)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 2. PRODUCTS & INVENTORY */}
          {tab === 'products' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900">
                  Product Catalog ({products.length})
                </h2>
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg"
                >
                  + New Product
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase">
                    <tr>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Price</th>
                      <th className="px-4 py-3">Stock</th>
                      <th className="px-4 py-3">Visibility</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {products.map((p) => (
                      <tr key={p.id}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <img
                              src={p.images[0]?.image_url || ''}
                              alt=""
                              className="w-10 h-10 rounded object-cover bg-slate-100 shrink-0"
                            />
                            <div>
                              <p className="font-semibold text-slate-900">{p.name}</p>
                              <p className="text-[11px] text-slate-500 font-mono">{p.sku}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {p.category_name}
                          {p.subcategory_name ? ` / ${p.subcategory_name}` : ''}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold">{formatNaira(p.price_ngn)}</td>
                        <td className="px-4 py-3 font-mono tabular-nums">
                          <span
                            className={
                              p.stock_quantity === 0
                                ? 'text-red-600 font-bold'
                                : p.stock_quantity <= p.low_stock_threshold
                                  ? 'text-orange-600 font-bold'
                                  : 'text-green-700 font-semibold'
                            }
                          >
                            {p.stock_quantity}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleTogglePublish(p)}
                            className={`px-2.5 py-1 rounded text-[11px] font-semibold ${
                              p.is_published
                                ? 'bg-green-50 text-green-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {p.is_published ? 'Published' : 'Draft'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                          <Link
                            to={`/product/${p.slug}`}
                            target="_blank"
                            className="inline-flex items-center gap-1 text-slate-600 hover:text-blue-700 font-semibold"
                          >
                            View <ExternalLink className="w-3 h-3" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => setEditingProduct(p)}
                            className="text-blue-700 font-semibold hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(p)}
                            className="text-red-600 font-semibold hover:underline"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. CATEGORIES */}
          {tab === 'categories' && (
            <div className="space-y-6">
              <form
                onSubmit={handleCreateCategory}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
              >
                <h2 className="text-sm font-bold text-slate-900">Create Category or Subcategory</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    required
                    value={catName}
                    onChange={(e) => setCatName(e.target.value)}
                    placeholder="Category Name"
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                  <select
                    value={catParent}
                    onChange={(e) => setCatParent(e.target.value)}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">Top-Level Main Category</option>
                    {categories
                      .filter((c) => !c.parent_id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          Subcategory of {c.name}
                        </option>
                      ))}
                  </select>
                  <input
                    type="text"
                    value={catDesc}
                    onChange={(e) => setCatDesc(e.target.value)}
                    placeholder="Short description"
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg"
                >
                  Save Category
                </button>
              </form>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                {categories.map((c) => (
                  <div key={c.id} className="px-5 py-3 flex items-center justify-between text-sm">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {c.parent_id ? '↳ ' : ''}
                        {c.name}
                      </p>
                      <p className="text-xs text-slate-500">/{c.slug}</p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiRequest(`/api/admin/categories/${c.id}`, { method: 'DELETE' });
                        loadAll();
                      }}
                      className="text-slate-400 hover:text-red-600 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. ORDERS & FULFILLMENT */}
          {tab === 'orders' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <input
                  type="search"
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  placeholder="Search order #, customer, email, Paystack ref..."
                  className="flex-1 min-w-[220px] px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <select
                  value={orderStatusFilter}
                  onChange={(e) => setOrderStatusFilter(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="all">All Statuses</option>
                  {ORDER_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-500 uppercase">
                      <tr>
                        <th className="px-4 py-3">Order #</th>
                        <th className="px-4 py-3">Customer</th>
                        <th className="px-4 py-3">Payment</th>
                        <th className="px-4 py-3">Fulfillment</th>
                        <th className="px-4 py-3 text-right">Total</th>
                        <th className="px-4 py-3 text-right">Manage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {orders.map((o) => (
                        <tr key={o.id}>
                          <td className="px-4 py-3 font-mono font-bold">{o.order_number}</td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900">{o.customer_name}</p>
                            <p className="text-[11px] text-slate-500">{o.delivery_city}, {o.delivery_state}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`font-bold uppercase ${
                                o.payment_status === 'paid'
                                  ? 'text-green-700'
                                  : o.payment_status === 'refunded'
                                    ? 'text-slate-600'
                                    : 'text-orange-600'
                              }`}
                            >
                              {o.payment_status}
                            </span>
                            <p className="text-[10px] font-mono text-slate-400">{o.paystack_reference}</p>
                          </td>
                          <td className="px-4 py-3 font-medium">{o.status}</td>
                          <td className="px-4 py-3 text-right font-mono font-bold">
                            {formatNaira(o.total_ngn)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOrderDetail(o);
                                setCourierDraft(o.delivery?.courier_name || 'KoraTech Express Dispatch');
                                setTrackingDraft(o.delivery?.tracking_number || '');
                              }}
                              className="text-blue-700 font-semibold hover:underline"
                            >
                              Inspect / Update
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 5. PAYMENTS */}
          {tab === 'payments' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 font-bold text-sm text-slate-900">
                Paystack Transaction Ledger ({payments.length})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase">
                    <tr>
                      <th className="px-4 py-3">Reference</th>
                      <th className="px-4 py-3">Order #</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Channel</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td className="px-4 py-3 font-mono font-semibold">{p.reference}</td>
                        <td className="px-4 py-3 font-mono">{p.order_number}</td>
                        <td className="px-4 py-3">{p.customer_name}</td>
                        <td className="px-4 py-3 font-mono font-bold">
                          {formatNaira(p.amount_kobo / 100)}
                        </td>
                        <td className="px-4 py-3 capitalize">{p.channel || p.payment_method}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`font-bold uppercase ${
                              p.status === 'success' ? 'text-green-700' : 'text-orange-600'
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{formatDateTime(p.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 6. CUSTOMERS */}
          {tab === 'customers' && (
            <div className="space-y-4">
              <input
                type="search"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Search customers by name, email, or phone..."
                className="w-full max-w-md px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase">
                    <tr>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Phone / WhatsApp</th>
                      <th className="px-4 py-3">Orders</th>
                      <th className="px-4 py-3 text-right">Total Spent</th>
                      <th className="px-4 py-3 text-right">History</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customers.map((c) => (
                      <tr key={c.id}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{c.full_name}</p>
                          <p className="text-slate-500">{c.email}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{c.phone}</td>
                        <td className="px-4 py-3 font-mono">{c.order_count}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold">
                          {formatNaira(c.total_spent_ngn)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedCustomer(c)}
                            className="text-blue-700 font-semibold hover:underline"
                          >
                            View Orders
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 7. REVIEWS & COUPONS */}
          {tab === 'reviews' && (
            <div className="space-y-8">
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <h2 className="text-sm font-bold text-slate-900">Customer Review Moderation</h2>
                <div className="divide-y divide-slate-100">
                  {reviews.map((r) => (
                    <div key={r.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="text-xs space-y-1">
                        <p className="font-semibold text-slate-900">
                          {r.product_name} · {r.rating}/5 ★ ({r.reviewer_name})
                        </p>
                        <p className="text-slate-600">{r.comment}</p>
                        <p className="text-[11px] font-semibold uppercase text-blue-700">
                          Status: {r.moderation_status}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleModerateReview(r.id, 'approved')}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-green-700 rounded"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleModerateReview(r.id, 'rejected')}
                          className="px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <h2 className="text-sm font-bold text-slate-900">Discount Coupons</h2>
                <form onSubmit={handleCreateCoupon} className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <input
                    type="text"
                    required
                    value={newCouponCode}
                    onChange={(e) => setNewCouponCode(e.target.value)}
                    placeholder="CODE"
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg uppercase font-mono"
                  />
                  <select
                    value={newCouponType}
                    onChange={(e) => setNewCouponType(e.target.value as 'percentage' | 'fixed')}
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="percentage">% Off</option>
                    <option value="fixed">Fixed ₦</option>
                  </select>
                  <input
                    type="number"
                    required
                    value={newCouponValue}
                    onChange={(e) => setNewCouponValue(e.target.value)}
                    placeholder="Value"
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                  <input
                    type="number"
                    value={newCouponMin}
                    onChange={(e) => setNewCouponMin(e.target.value)}
                    placeholder="Min Spend ₦"
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg"
                  >
                    Create Coupon
                  </button>
                </form>

                <div className="divide-y divide-slate-100 text-xs">
                  {coupons.map((c) => (
                    <div key={c.id} className="py-2.5 flex items-center justify-between">
                      <div>
                        <span className="font-mono font-bold text-slate-900">{c.code}</span>
                        <span className="text-slate-500 ml-2">
                          ({c.discount_type === 'percentage' ? `${c.discount_value}%` : formatNaira(c.discount_value)} off · Min {formatNaira(c.min_order_ngn)})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiRequest(`/api/admin/coupons/${c.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ is_active: !c.is_active }),
                          });
                          loadAll();
                        }}
                        className={`px-2.5 py-1 rounded font-semibold ${
                          c.is_active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {c.is_active ? 'Active' : 'Paused'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 8. GATEWAY CONFIGURATION & AUDIT LOGS */}
          {tab === 'settings' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-bold text-slate-900">Backend & Payment Integrations</h2>
                  <button
                    type="button"
                    disabled={syncingSupabase}
                    onClick={async () => {
                      setSyncingSupabase(true);
                      try {
                        const res = await apiRequest<{
                          probe: { tablesReady: boolean; productCount: number; categoryCount: number; keyRole?: string };
                          seeded: boolean;
                          error?: string;
                        }>('/api/admin/supabase-sync', { method: 'POST' });
                        if (res.probe.tablesReady && res.probe.productCount > 0 && !res.error) {
                          notify(
                            `Supabase synced (${res.probe.categoryCount} categories, ${res.probe.productCount} products).`,
                            'success',
                          );
                        } else if (res.probe.keyRole === 'anon') {
                          notify(
                            res.error || 'SUPABASE_SERVICE_ROLE_KEY is an anon key; set the service_role key in Secrets.',
                            'error',
                          );
                        } else {
                          notify(
                            res.error || 'Run supabase/migrations/001_initial_schema.sql in Supabase SQL Editor first.',
                            'error',
                          );
                        }
                        await loadAll();
                      } catch (err) {
                        notify(err instanceof Error ? err.message : 'Sync failed', 'error');
                      } finally {
                        setSyncingSupabase(false);
                      }
                    }}
                    className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50"
                  >
                    {syncingSupabase ? 'Checking & Syncing...' : 'Verify & Sync Supabase'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div className="p-4 rounded-xl border border-slate-200 space-y-1.5">
                    <p className="font-bold text-slate-900">Supabase Project</p>
                    <p
                      className={`inline-flex items-center gap-1 font-semibold ${
                        gatewayHealth?.supabase.tablesReady &&
                        gatewayHealth.supabase.productCount > 0
                          ? 'text-green-700'
                          : gatewayConfig?.supabaseConfigured
                            ? 'text-orange-600'
                            : 'text-blue-700'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      {gatewayHealth?.supabase.tablesReady && gatewayHealth.supabase.productCount > 0
                        ? `Postgres Live (${gatewayHealth.supabase.categoryCount} cats, ${gatewayHealth.supabase.productCount} products)`
                        : gatewayHealth?.supabase.tablesReady
                          ? 'Tables Ready — Fallback DB Serving Catalog (Needs Service Role Sync)'
                          : gatewayConfig?.supabaseConfigured
                            ? 'Connected — Run 001_initial_schema.sql in SQL Editor'
                            : 'Local Server DB Active'}
                    </p>
                    {gatewayHealth?.supabase.keyRole === 'anon' && (
                      <p className="text-[11px] text-orange-700 font-medium">
                        Warning: SUPABASE_SERVICE_ROLE_KEY is currently an anon key; replace with service_role secret key to enable writes.
                      </p>
                    )}
                    {gatewayHealth?.supabase.error && (
                      <p className="text-[11px] text-slate-500">{gatewayHealth.supabase.error}</p>
                    )}
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 space-y-1.5">
                    <p className="font-bold text-slate-900">Paystack Gateway</p>
                    <p
                      className={`font-semibold ${
                        gatewayHealth?.paystack.validKey
                          ? 'text-green-700'
                          : gatewayConfig?.paystackConfigured
                            ? 'text-blue-700'
                            : 'text-orange-600'
                      }`}
                    >
                      {gatewayHealth?.paystack.validKey
                        ? `Verified Active (${gatewayHealth.paystack.mode.toUpperCase()} MODE)`
                        : gatewayConfig?.paystackConfigured
                          ? `Configured (${gatewayConfig.paystackMode.toUpperCase()} MODE)`
                          : 'Pending PAYSTACK_SECRET_KEY'}
                    </p>
                    {gatewayHealth?.paystack.message && (
                      <p className="text-[11px] text-slate-500">{gatewayHealth.paystack.message}</p>
                    )}
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 space-y-1.5">
                    <p className="font-bold text-slate-900">WhatsApp Dispatch Number</p>
                    <p className="font-mono font-semibold text-slate-800">
                      +{sanitizeWhatsappNumber(gatewayConfig?.whatsappBusinessNumber || '')}
                    </p>
                    <p className="text-[11px] text-slate-500">Auto-normalized for Nigerian wa.me links</p>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Database className="w-4 h-4 text-blue-700" />
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">Supabase Schema SQL Script</h2>
                      <p className="text-xs text-slate-500">
                        Run this once in your Supabase SQL Editor, then click &ldquo;Verify &amp; Sync Supabase&rdquo; above.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={loadingSql}
                      onClick={handleLoadSql}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                    >
                      {loadingSql ? 'Loading...' : sqlScript ? 'Refresh SQL' : 'View SQL Script'}
                    </button>
                    <button
                      type="button"
                      disabled={loadingSql}
                      onClick={handleCopySql}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy SQL Script
                    </button>
                  </div>
                </div>
                {sqlScript && (
                  <pre className="p-4 rounded-lg bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto max-h-80 leading-relaxed">
                    {sqlScript}
                  </pre>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <h2 className="text-sm font-bold text-slate-900">Admin Activity Audit Log</h2>
                <div className="divide-y divide-slate-100 text-xs">
                  {logs.map((l) => (
                    <div key={l.id} className="py-2 flex justify-between gap-4">
                      <span>
                        <strong className="font-mono">{l.action}</strong> by {l.admin_email}
                      </span>
                      <span className="text-slate-500">{formatDateTime(l.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Product Modal */}
      {editingProduct !== undefined && (
        <AdminProductModal
          product={editingProduct}
          categories={categories}
          onClose={() => setEditingProduct(undefined)}
          onSaved={() => {
            setEditingProduct(undefined);
            notify('Product saved successfully', 'success');
            loadAll();
          }}
        />
      )}

      {/* Order Inspection & Fulfillment Modal */}
      {selectedOrderDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold font-mono text-slate-900">
                {selectedOrderDetail.order_number}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedOrderDetail(null)}
                className="text-sm text-slate-500 font-semibold"
              >
                Close
              </button>
            </div>
            <div className="text-xs space-y-1 text-slate-700">
              <p><strong>Customer:</strong> {selectedOrderDetail.customer_name} ({selectedOrderDetail.customer_email})</p>
              <p><strong>Phone / WhatsApp:</strong> {selectedOrderDetail.customer_phone} / {selectedOrderDetail.customer_whatsapp}</p>
              <p><strong>Address:</strong> {selectedOrderDetail.delivery_address}, {selectedOrderDetail.delivery_city}, {selectedOrderDetail.delivery_state}</p>
              <p><strong>Paystack Ref:</strong> <span className="font-mono">{selectedOrderDetail.paystack_reference}</span> ({selectedOrderDetail.payment_status.toUpperCase()})</p>
            </div>
            <div className="divide-y divide-slate-100 border-y border-slate-200 text-xs">
              {selectedOrderDetail.items.map((i) => (
                <div key={i.id} className="py-2 flex justify-between">
                  <span>{i.product_name} × {i.quantity}</span>
                  <span className="font-mono font-bold">{formatNaira(i.line_total_ngn)}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Courier</label>
                <input
                  type="text"
                  value={courierDraft}
                  onChange={(e) => setCourierDraft(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tracking Number</label>
                <input
                  type="text"
                  value={trackingDraft}
                  onChange={(e) => setTrackingDraft(e.target.value)}
                  placeholder="KT-..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2">Update Fulfillment Status</p>
              <div className="flex flex-wrap gap-2">
                {ORDER_STATUSES.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleOrderStatusUpdate(selectedOrderDetail.id, st)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                      selectedOrderDetail.status === st
                        ? 'bg-blue-700 text-white border-blue-700'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer History Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {selectedCustomer.full_name} — Order History
              </h3>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="text-xs font-semibold text-slate-500"
              >
                Close
              </button>
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              {selectedCustomer.orders.length === 0 ? (
                <p className="py-4 text-slate-500">No orders placed by this customer yet.</p>
              ) : (
                selectedCustomer.orders.map((o) => (
                  <div key={o.id} className="py-3 flex justify-between">
                    <div>
                      <p className="font-mono font-bold text-slate-900">{o.order_number}</p>
                      <p className="text-slate-500">{o.status} · {o.payment_status}</p>
                    </div>
                    <span className="font-mono font-bold">{formatNaira(o.total_ngn)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
