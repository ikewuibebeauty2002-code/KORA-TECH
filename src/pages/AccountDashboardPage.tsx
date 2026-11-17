import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  Heart,
  LogOut,
  MapPin,
  MessageCircle,
  Package,
  Plus,
  Trash2,
  User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { apiRequest } from '../lib/api';
import { NIGERIAN_STATES } from '../config/storeConfig';
import type { Address, Order, Product } from '../types/ecommerce';
import { buildOrderWhatsAppUrl, formatDateShort, formatNaira } from '../utils/format';
import { ProductCard } from '../components/ProductCard';

type AccountTab = 'orders' | 'profile' | 'addresses' | 'wishlist';

export function AccountDashboardPage() {
  const { user, loading, logout, updateProfile, gatewayConfig } = useAuth();
  const { notify } = useCart();

  const [tab, setTab] = useState<AccountTab>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [wishlistProducts, setWishlistProducts] = useState<Product[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Profile edit
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // New Address
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [addrLabel, setAddrLabel] = useState('Home');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrCity, setAddrCity] = useState('');
  const [addrState, setAddrState] = useState('Lagos');
  const [addrNotes, setAddrNotes] = useState('');

  useEffect(() => {
    if (!user) return;
    document.title = 'My Account | KoraTech Electronics';
    setFullName(user.full_name);
    setPhone(user.phone);
    setWhatsapp(user.whatsapp_number);

    apiRequest<{ orders: Order[] }>('/api/orders/my')
      .then((res) => setOrders(res.orders || []))
      .catch(() => {});
    apiRequest<{ addresses: Address[] }>('/api/addresses')
      .then((res) => setAddresses(res.addresses || []))
      .catch(() => {});
    apiRequest<{ products: Product[] }>('/api/wishlist')
      .then((res) => setWishlistProducts(res.products || []))
      .catch(() => {});
  }, [user]);

  if (loading) {
    return <div className="max-w-5xl mx-auto px-4 py-16 text-sm text-slate-500">Loading account...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await updateProfile({ full_name: fullName, phone, whatsapp_number: whatsapp });
      notify('Profile updated', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Update failed', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCreateAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest<{ address: Address }>('/api/addresses', {
        method: 'POST',
        body: JSON.stringify({
          label: addrLabel,
          full_name: user.full_name,
          phone: user.phone,
          whatsapp_number: user.whatsapp_number || user.phone,
          street_address: addrStreet,
          city: addrCity,
          state: addrState,
          additional_info: addrNotes,
          is_default: addresses.length === 0,
        }),
      });
      setAddresses((prev) => [...prev, res.address]);
      setAddrStreet('');
      setAddrCity('');
      setAddrNotes('');
      setShowAddAddress(false);
      notify('Delivery address saved', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save address', 'error');
    }
  };

  const handleDeleteAddress = async (id: string) => {
    await apiRequest('/api/addresses/' + id, { method: 'DELETE' });
    setAddresses((prev) => prev.filter((a) => a.id !== id));
    notify('Address deleted', 'info');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{user.full_name}</h1>
          <p className="text-sm text-slate-600">{user.email}</p>
        </div>

        <div className="flex items-center gap-3">
          {(user.role === 'admin' || user.role === 'super_admin') && (
            <Link
              to="/admin"
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg"
            >
              Open Admin Dashboard
            </Link>
          )}
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-lg"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'orders', label: `Order History (${orders.length})`, icon: Package },
            { id: 'profile', label: 'Personal Information', icon: User },
            { id: 'addresses', label: `Saved Addresses (${addresses.length})`, icon: MapPin },
            { id: 'wishlist', label: `Wishlist (${wishlistProducts.length})`, icon: Heart },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg border transition-colors ${
              tab === item.id
                ? 'bg-blue-700 border-blue-700 text-white'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'orders' && (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="border border-slate-200 rounded-2xl p-10 text-center space-y-3">
              <p className="text-base font-semibold text-slate-900">No orders placed yet</p>
              <Link
                to="/category/all"
                className="inline-flex px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 rounded-lg"
              >
                Start Shopping
              </Link>
            </div>
          ) : (
            orders.map((order) => (
              <div
                key={order.id}
                className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono font-bold text-slate-900">
                      {order.order_number}
                    </span>
                    <span className="text-xs text-slate-500">
                      {formatDateShort(order.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700">
                    {order.items.map((i) => `${i.product_name} × ${i.quantity}`).join(', ')}
                  </p>
                  <p className="text-xs text-slate-500">
                    Payment:{' '}
                    <strong className={order.payment_status === 'paid' ? 'text-green-700' : 'text-orange-600'}>
                      {order.payment_status.toUpperCase()}
                    </strong>{' '}
                    · Delivery: <strong>{order.status}</strong>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <span className="text-base font-bold font-mono text-slate-900">
                    {formatNaira(order.total_ngn)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedOrder(order)}
                    className="px-3.5 py-2 text-xs font-semibold text-blue-700 bg-sky-50 hover:bg-sky-100 rounded-lg"
                  >
                    Order Details
                  </button>
                  {order.payment_status === 'paid' && (
                    <a
                      href={buildOrderWhatsAppUrl(order, gatewayConfig?.whatsappBusinessNumber)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-green-700 hover:bg-green-800 rounded-lg"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      WhatsApp
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'profile' && (
        <form
          onSubmit={handleSaveProfile}
          className="max-w-xl bg-white border border-slate-200 rounded-2xl p-6 space-y-4"
        >
          <h2 className="text-lg font-bold text-slate-900">Personal & Account Settings</h2>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              disabled
              value={user.email}
              className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-500"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">WhatsApp Number</label>
              <input
                type="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={savingProfile}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
          >
            {savingProfile ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      )}

      {tab === 'addresses' && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setShowAddAddress((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 rounded-lg"
          >
            <Plus className="w-4 h-4" />
            Add Delivery Address
          </button>

          {showAddAddress && (
            <form
              onSubmit={handleCreateAddress}
              className="max-w-xl bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  value={addrLabel}
                  onChange={(e) => setAddrLabel(e.target.value)}
                  placeholder="Label (Home, Office)"
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                />
                <select
                  value={addrState}
                  onChange={(e) => setAddrState(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {NIGERIAN_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <input
                type="text"
                required
                value={addrStreet}
                onChange={(e) => setAddrStreet(e.target.value)}
                placeholder="Street Address"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  value={addrCity}
                  onChange={(e) => setAddrCity(e.target.value)}
                  placeholder="City / LGA"
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                />
                <input
                  type="text"
                  value={addrNotes}
                  onChange={(e) => setAddrNotes(e.target.value)}
                  placeholder="Delivery notes"
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <button type="submit" className="px-5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg">
                Save Address
              </button>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {addresses.map((addr) => (
              <div
                key={addr.id}
                className="bg-white border border-slate-200 rounded-2xl p-5 flex justify-between gap-4"
              >
                <div className="space-y-1 text-sm">
                  <p className="font-bold text-slate-900">
                    {addr.label} {addr.is_default ? '· Default' : ''}
                  </p>
                  <p className="text-slate-700">{addr.street_address}</p>
                  <p className="text-slate-600">{addr.city}, {addr.state}</p>
                  <p className="text-xs text-slate-500">Phone: {addr.phone}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteAddress(addr.id)}
                  className="text-slate-400 hover:text-red-600 h-fit p-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'wishlist' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {wishlistProducts.length === 0 ? (
            <p className="text-sm text-slate-500 col-span-full">Your wishlist is empty.</p>
          ) : (
            wishlistProducts.map((p) => <ProductCard key={p.id} product={p} />)
          )}
        </div>
      )}

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold font-mono text-slate-900">
                {selectedOrder.order_number}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="text-sm font-semibold text-slate-500 hover:text-slate-900"
              >
                Close
              </button>
            </div>
            <div className="text-xs space-y-1 text-slate-600">
              <p>Status: <strong className="text-slate-900">{selectedOrder.status}</strong></p>
              <p>Payment Reference: <strong className="font-mono">{selectedOrder.paystack_reference}</strong></p>
              <p>Deliver to: {selectedOrder.delivery_address}, {selectedOrder.delivery_city}, {selectedOrder.delivery_state}</p>
            </div>
            <div className="divide-y divide-slate-100 border-t border-b border-slate-100">
              {selectedOrder.items.map((i) => (
                <div key={i.id} className="py-2.5 flex justify-between text-sm">
                  <span>{i.product_name} × {i.quantity}</span>
                  <span className="font-mono font-semibold">{formatNaira(i.line_total_ngn)}</span>
                </div>
              ))}
            </div>
            <div className="text-sm space-y-1">
              <div className="flex justify-between text-slate-600">
                <span>Delivery</span>
                <span className="font-mono">{formatNaira(selectedOrder.delivery_fee_ngn)}</span>
              </div>
              {selectedOrder.discount_ngn > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>Discount</span>
                  <span className="font-mono">-{formatNaira(selectedOrder.discount_ngn)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-slate-900 pt-1">
                <span>Total</span>
                <span className="font-mono">{formatNaira(selectedOrder.total_ngn)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
