import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, MessageCircle, Package, Search, Truck } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { Order } from '../types/ecommerce';
import { buildOrderWhatsAppUrl, formatDateTime, formatNaira } from '../utils/format';
import { useAuth } from '../context/AuthContext';

const TRACKING_STEPS = ['Paid', 'Processing', 'Ready for Delivery', 'Shipped', 'Delivered'];

export function OrderTrackingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { gatewayConfig } = useAuth();
  const [orderInput, setOrderInput] = useState(searchParams.get('order') || '');
  const [emailInput, setEmailInput] = useState(searchParams.get('email') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [orderData, setOrderData] = useState<Order | null>(null);
  const [maskedSummary, setMaskedSummary] = useState<{
    order_number: string;
    status: string;
    payment_status: string;
    delivery_state: string;
    created_at: string;
  } | null>(null);

  const runLookup = async (ordNum: string, email: string) => {
    if (!ordNum.trim()) return;
    setLoading(true);
    setError('');
    setOrderData(null);
    setMaskedSummary(null);
    try {
      const qs = email.trim() ? `?email=${encodeURIComponent(email.trim())}` : '';
      const res = await apiRequest<{
        masked: boolean;
        order?: Order;
        order_number?: string;
        status?: string;
        payment_status?: string;
        delivery_state?: string;
        created_at?: string;
      }>(`/api/orders/track/${encodeURIComponent(ordNum.trim())}${qs}`);

      if (res.masked) {
        setMaskedSummary({
          order_number: res.order_number || ordNum,
          status: res.status || 'Pending',
          payment_status: res.payment_status || 'pending',
          delivery_state: res.delivery_state || '',
          created_at: res.created_at || '',
        });
      } else if (res.order) {
        setOrderData(res.order);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order not found');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = 'Track Your Order | KoraTech Electronics';
    const o = searchParams.get('order');
    const e = searchParams.get('email') || '';
    if (o) runLookup(o, e);
  }, [searchParams]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderInput.trim()) return;
    const next: Record<string, string> = { order: orderInput.trim() };
    if (emailInput.trim()) next.email = emailInput.trim();
    setSearchParams(next);
  };

  const activeStatus = orderData?.status || maskedSummary?.status || '';
  const stepIndex = TRACKING_STEPS.indexOf(activeStatus);

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Track Your Order</h1>
        <p className="text-sm text-slate-600 mt-1">
          Enter your KoraTech order number and checkout email to inspect real-time fulfillment and dispatch updates.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Order Number *
            </label>
            <input
              type="text"
              required
              value={orderInput}
              onChange={(e) => setOrderInput(e.target.value)}
              placeholder="e.g. KT-20261113-7390"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Checkout Email (for full receipt)
            </label>
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
        >
          <Search className="w-4 h-4" />
          {loading ? 'Searching...' : 'Track Order'}
        </button>
      </form>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      {(orderData || maskedSummary) && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <p className="text-xs text-slate-500">Order Number</p>
              <p className="text-lg font-bold font-mono text-slate-900">
                {orderData?.order_number || maskedSummary?.order_number}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Current Status</p>
              <p className="text-sm font-bold text-blue-700">{activeStatus}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Payment</p>
              <p
                className={`text-sm font-bold uppercase ${
                  (orderData?.payment_status || maskedSummary?.payment_status) === 'paid'
                    ? 'text-green-700'
                    : 'text-orange-600'
                }`}
              >
                {orderData?.payment_status || maskedSummary?.payment_status}
              </p>
            </div>
          </div>

          {/* Fulfillment Progress */}
          <div className="grid grid-cols-5 gap-2 text-center">
            {TRACKING_STEPS.map((step, idx) => {
              const done = stepIndex >= idx;
              return (
                <div key={step} className="space-y-1.5">
                  <div
                    className={`h-2 rounded-full ${
                      done ? 'bg-green-600' : 'bg-slate-200'
                    }`}
                  />
                  <p className={`text-[11px] font-medium ${done ? 'text-slate-900' : 'text-slate-400'}`}>
                    {step}
                  </p>
                </div>
              );
            })}
          </div>

          {orderData && (
            <>
              {orderData.delivery?.tracking_number && (
                <div className="p-4 rounded-xl bg-sky-50 border border-sky-200 text-sm flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Truck className="w-5 h-5 text-blue-700" />
                    <div>
                      <p className="font-semibold text-slate-900">
                        {orderData.delivery.courier_name}
                      </p>
                      <p className="text-xs text-slate-600 font-mono">
                        Tracking ID: {orderData.delivery.tracking_number}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-slate-500">
                    {formatDateTime(orderData.delivery.updated_at)}
                  </span>
                </div>
              )}

              <div className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-blue-700" />
                  Items Ordered
                </h3>
                {orderData.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm py-1.5 border-b border-slate-100">
                    <span className="text-slate-800">
                      {item.product_name} × {item.quantity}
                    </span>
                    <span className="font-mono font-semibold">{formatNaira(item.line_total_ngn)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-base font-bold text-slate-900 pt-2">
                  <span>Total</span>
                  <span className="font-mono">{formatNaira(orderData.total_ngn)}</span>
                </div>
              </div>

              {orderData.payment_status === 'paid' && (
                <div className="pt-2">
                  <a
                    href={buildOrderWhatsAppUrl(orderData, gatewayConfig?.whatsappBusinessNumber)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-green-700 hover:bg-green-800 rounded-lg"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Message Dispatch on WhatsApp
                  </a>
                </div>
              )}
            </>
          )}

          {maskedSummary && (
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-blue-700" />
              Enter the checkout email address above to unlock itemized order details and tracking numbers.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
