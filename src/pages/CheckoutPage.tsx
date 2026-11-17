import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ExternalLink, Lock, ShieldCheck, Tag } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { calculateDeliveryFeeNgn, NIGERIAN_STATES } from '../config/storeConfig';
import { formatNaira } from '../utils/format';
import type { Address, Order, Product, ProductVariant } from '../types/ecommerce';
import { ImageWithFallback } from '../components/ImageWithFallback';

interface DirectBuyItem {
  product: Product;
  variant: ProductVariant | null;
  selectedColor: string;
  quantity: number;
}

export function CheckoutPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, gatewayConfig } = useAuth();
  const { items, appliedCoupon, discountNgn, applyCoupon, clearCoupon, notify } = useCart();

  const directItem = (location.state as { directItem?: DirectBuyItem } | null)?.directItem;

  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [whatsapp, setWhatsapp] = useState(user?.whatsapp_number || '');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('Lagos');
  const [notes, setNotes] = useState('');
  const [couponInput, setCouponInput] = useState('');

  const [reviewStep, setReviewStep] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [createdOrderUnconfigured, setCreatedOrderUnconfigured] = useState<Order | null>(null);
  const [pendingPaystack, setPendingPaystack] = useState<{
    order: Order;
    authorizationUrl: string;
    reference: string;
    mode: 'live' | 'test';
  } | null>(null);

  useEffect(() => {
    document.title = 'Secure Checkout | KoraTech Electronics';
    if (user) {
      setFullName((prev) => prev || user.full_name);
      setEmail((prev) => prev || user.email);
      setPhone((prev) => prev || user.phone);
      setWhatsapp((prev) => prev || user.whatsapp_number);
      apiRequest<{ addresses: Address[] }>('/api/addresses')
        .then((res) => {
          const list = res.addresses || [];
          setSavedAddresses(list);
          const def = list.find((a) => a.is_default) || list[0];
          if (def) {
            setAddress((prev) => prev || def.street_address);
            setCity((prev) => prev || def.city);
            setStateName(def.state || 'Lagos');
          }
        })
        .catch(() => {});
    }
  }, [user]);

  const checkoutLines = directItem
    ? [
        {
          key: 'direct',
          name: directItem.product.name,
          image: directItem.product.images[0]?.image_url || '',
          variant: directItem.variant?.name || '',
          color: directItem.selectedColor,
          quantity: directItem.quantity,
          unitPrice: directItem.variant
            ? directItem.variant.price_ngn
            : directItem.product.price_ngn,
        },
      ]
    : items.map((i) => ({
        key: i.id,
        name: i.product.name,
        image: i.product.images[0]?.image_url || '',
        variant: i.variant?.name || '',
        color: i.selected_color,
        quantity: i.quantity,
        unitPrice: i.variant ? i.variant.price_ngn : i.product.price_ngn,
      }));

  const subtotal = checkoutLines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const deliveryFee = calculateDeliveryFeeNgn(stateName, subtotal);
  const activeDiscount = directItem ? 0 : discountNgn;
  const totalPayable = Math.max(0, subtotal + deliveryFee - activeDiscount);

  if (checkoutLines.length === 0 && !createdOrderUnconfigured) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">No items to check out</h1>
        <p className="text-sm text-slate-600">Add a gadget to your cart before checking out.</p>
        <Link
          to="/category/all"
          className="inline-flex px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 rounded-lg"
        >
          Shop Gadgets
        </Link>
      </div>
    );
  }

  const handleReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (
      !fullName.trim() ||
      !email.trim() ||
      !phone.trim() ||
      !whatsapp.trim() ||
      !address.trim() ||
      !city.trim() ||
      !stateName.trim()
    ) {
      setErrorMsg('Please fill in all compulsory delivery and contact fields.');
      return;
    }
    setReviewStep(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePayWithPaystack = async () => {
    setErrorMsg('');
    setSubmitting(true);
    try {
      const orderRes = await apiRequest<{ order: Order }>('/api/checkout/create-order', {
        method: 'POST',
        body: JSON.stringify({
          customer_name: fullName,
          customer_email: email,
          customer_phone: phone,
          customer_whatsapp: whatsapp,
          delivery_address: address,
          delivery_city: city,
          delivery_state: stateName,
          delivery_notes: notes,
          coupon_code: appliedCoupon?.code || null,
          direct_item: directItem
            ? {
                productId: directItem.product.id,
                variantId: directItem.variant?.id || null,
                selectedColor: directItem.selectedColor,
                quantity: directItem.quantity,
              }
            : null,
        }),
      });

      const order = orderRes.order;
      const callbackUrl = `${window.location.origin}/payment/callback`;

      try {
        const initRes = await apiRequest<{
          configured: boolean;
          mode?: 'live' | 'test';
          authorization_url: string;
          reference: string;
        }>('/api/paystack/initialize', {
          method: 'POST',
          body: JSON.stringify({ orderId: order.id, callbackUrl }),
        });

        const inIframe = typeof window !== 'undefined' && window.self !== window.top;
        if (inIframe) {
          // Opening Paystack Checkout at top-level/new tab avoids iframe 3DS & Fraud Check blocks
          setPendingPaystack({
            order,
            authorizationUrl: initRes.authorization_url,
            reference: initRes.reference,
            mode: initRes.mode || 'live',
          });
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          window.location.href = initRes.authorization_url;
        }
      } catch (psErr) {
        const errObj = psErr as Error & { data?: { configured?: boolean; error?: string } };
        if (errObj.data && errObj.data.configured === false) {
          setCreatedOrderUnconfigured(order);
        } else {
          setErrorMsg(errObj.message || 'Could not initialize Paystack payment.');
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Order creation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (pendingPaystack) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-14 space-y-6">
        <div className="border border-blue-200 bg-sky-50/70 rounded-2xl p-6 sm:p-8 space-y-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-7 h-7 text-blue-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                Paystack {pendingPaystack.mode.toUpperCase()} Checkout Ready
              </p>
              <h1 className="text-2xl font-bold text-slate-900 mt-1">
                Order {pendingPaystack.order.order_number} Created
              </h1>
              <p className="text-sm text-slate-700 mt-1">
                Total Payable:{' '}
                <span className="font-mono font-bold text-slate-900">
                  {formatNaira(pendingPaystack.order.total_ngn)}
                </span>{' '}
                · Ref: <span className="font-mono text-xs">{pendingPaystack.reference}</span>
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-1.5">
            <p className="font-semibold text-slate-900">
              Complete payment safely outside the preview frame:
            </p>
            <p>
              • Opening Paystack in a full browser tab ensures bank 3D Secure OTPs and Paystack anti-fraud verification pass smoothly.
            </p>
            <p>
              • Tip: In Nigeria, if a card triggers a bank/fraud block, choose <strong>Pay with Bank Transfer</strong> inside Paystack — it clears instantly.
            </p>
            {pendingPaystack.mode === 'live' && (
              <p className="text-orange-700 font-medium">
                • Your Paystack key is in <strong>LIVE MODE</strong>: use a real Nigerian card/Bank Transfer (test cards or placeholder emails like @example.ng will fail live fraud checks). For free testing, use Paystack <code>sk_test_</code> / <code>pk_test_</code> keys.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href={pendingPaystack.authorizationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-xl shadow-sm"
            >
              <ExternalLink className="w-4 h-4" />
              Open Paystack Secure Payment Page
            </a>
            <button
              type="button"
              onClick={() =>
                navigate(`/payment/callback?reference=${encodeURIComponent(pendingPaystack.reference)}`)
              }
              className="inline-flex items-center gap-2 px-5 py-3.5 text-sm font-semibold text-green-800 bg-green-100 hover:bg-green-200 border border-green-300 rounded-xl"
            >
              <CheckCircle2 className="w-4 h-4" />
              I&apos;ve Paid — Verify Now
            </button>
            <button
              type="button"
              onClick={() => setPendingPaystack(null)}
              className="px-4 py-3.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Edit Order Details
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (createdOrderUnconfigured) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-14 space-y-6">
        <div className="border border-orange-200 bg-orange-50 rounded-2xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-orange-600 shrink-0 mt-0.5" />
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Order Created — Paystack Key Needed to Launch Payment
              </h1>
              <p className="text-sm text-slate-700 mt-1">
                Order <span className="font-mono font-bold">{createdOrderUnconfigured.order_number}</span>{' '}
                for <span className="font-mono font-bold">{formatNaira(createdOrderUnconfigured.total_ngn)}</span>{' '}
                has been securely saved in the database with status{' '}
                <span className="font-semibold">Pending Payment</span>.
              </p>
            </div>
          </div>

          <div className="bg-white border border-orange-200 rounded-xl p-4 text-xs text-slate-700 space-y-2">
            <p className="font-semibold text-slate-900">
              To complete real Paystack payment & automatic verification:
            </p>
            <p>
              1. Add <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">PAYSTACK_SECRET_KEY</code>{' '}
              (e.g. <code className="font-mono">sk_test_...</code>) and{' '}
              <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">PAYSTACK_PUBLIC_KEY</code> in your server environment secrets.
            </p>
            <p>
              2. Payment status remains <strong>pending</strong> — orders are never marked paid or redirected to WhatsApp without real Paystack API verification.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate(`/track-order?order=${createdOrderUnconfigured.order_number}`)}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 rounded-lg"
            >
              View Pending Order Status
            </button>
            <button
              type="button"
              onClick={() => setCreatedOrderUnconfigured(null)}
              className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Back to Checkout
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Checkout</h1>
          <p className="text-sm text-slate-600 mt-1">
            All prices and stock are verified on the server prior to Paystack initialization.
          </p>
        </div>
        {!user && (
          <Link to="/login" className="text-sm font-semibold text-blue-700 hover:underline">
            Have an account? Sign in to use saved addresses
          </Link>
        )}
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex items-center gap-2.5">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Delivery Form or Review Screen */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
          {!reviewStep ? (
            <form onSubmit={handleReviewSubmit} className="space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <h2 className="text-lg font-bold text-slate-900">1. Customer & Delivery Details</h2>
                {savedAddresses.length > 0 && (
                  <select
                    onChange={(e) => {
                      const found = savedAddresses.find((a) => a.id === e.target.value);
                      if (found) {
                        setFullName(found.full_name);
                        setPhone(found.phone);
                        setWhatsapp(found.whatsapp_number);
                        setAddress(found.street_address);
                        setCity(found.city);
                        setStateName(found.state);
                        setNotes(found.additional_info || '');
                      }
                    }}
                    className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50"
                    defaultValue=""
                  >
                    <option value="" disabled>Fill from saved address...</option>
                    {savedAddresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label} — {a.city}, {a.state}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Tunde Adebayo"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+234 803 000 0000"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    WhatsApp Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="+234 803 000 0000"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Street Delivery Address *
                </label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="House/Suite number, street name, estate or landmark"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    State *
                  </label>
                  <select
                    value={stateName}
                    onChange={(e) => setStateName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {NIGERIAN_STATES.map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    City / LGA *
                  </label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Lekki, Ikeja, Wuse II"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Additional Delivery Information (Optional)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Gate instructions, preferred delivery hours..."
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
              >
                Review Order & Continue to Payment
              </button>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <h2 className="text-lg font-bold text-slate-900">2. Review & Pay via Paystack</h2>
                <button
                  type="button"
                  onClick={() => setReviewStep(false)}
                  className="text-xs font-semibold text-blue-700 hover:underline"
                >
                  Edit Delivery Details
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase">Contact</p>
                  <p className="font-semibold text-slate-900 mt-1">{fullName}</p>
                  <p className="text-slate-600">{email}</p>
                  <p className="text-slate-600">Phone: {phone}</p>
                  <p className="text-slate-600">WhatsApp: {whatsapp}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase">Delivery Destination</p>
                  <p className="text-slate-800 mt-1">{address}</p>
                  <p className="text-slate-800">{city}, {stateName}</p>
                  {notes && <p className="text-xs text-slate-500 mt-1">Note: {notes}</p>}
                </div>
              </div>

              <div className="p-4 rounded-xl border border-sky-200 bg-sky-50/50 text-xs text-slate-700 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-slate-900 text-sm">
                  <ShieldCheck className="w-4 h-4 text-green-700" />
                  Paystack Verification & WhatsApp Order Confirmation
                </div>
                <p>
                  You will be redirected to Paystack’s encrypted checkout ({gatewayConfig?.paystackMode === 'live' ? 'Live' : 'Test Mode'}).
                  After Paystack confirms your payment, we verify the reference on our server and open your WhatsApp chat with your complete order receipt.
                </p>
              </div>

              <button
                type="button"
                disabled={submitting}
                onClick={handlePayWithPaystack}
                className="w-full py-4 text-sm font-bold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-xl inline-flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4" />
                {submitting
                  ? 'Connecting to Paystack...'
                  : `Pay ${formatNaira(totalPayable)} Securely with Paystack`}
              </button>
            </div>
          )}
        </div>

        {/* Right: Order Summary */}
        <aside className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-5">
          <h2 className="text-lg font-bold text-slate-900">Order Summary</h2>

          <div className="divide-y divide-slate-200 max-h-80 overflow-y-auto pr-1">
            {checkoutLines.map((line) => (
              <div key={line.key} className="py-3 flex gap-3">
                <div className="w-14 h-14 rounded-lg bg-white border border-slate-200 overflow-hidden shrink-0">
                  <ImageWithFallback
                    src={line.image}
                    alt={line.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 line-clamp-1">{line.name}</p>
                  {(line.variant || line.color) && (
                    <p className="text-xs text-slate-500">
                      {[line.variant, line.color].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  <p className="text-xs text-slate-600 mt-0.5 tabular-nums">
                    Qty: {line.quantity} × {formatNaira(line.unitPrice)}
                  </p>
                </div>
                <span className="text-sm font-bold text-slate-900 font-mono tabular-nums shrink-0">
                  {formatNaira(line.unitPrice * line.quantity)}
                </span>
              </div>
            ))}
          </div>

          {!directItem && (
            appliedCoupon ? (
              <div className="flex items-center justify-between px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold text-green-800">
                  <CheckCircle2 className="w-4 h-4" />
                  Coupon {appliedCoupon.code} (-{formatNaira(activeDiscount)})
                </span>
                <button
                  type="button"
                  onClick={clearCoupon}
                  className="text-red-600 font-semibold"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    placeholder="Coupon code (e.g. KORA5)"
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-lg bg-white uppercase"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    applyCoupon(couponInput).catch((err) =>
                      notify(err instanceof Error ? err.message : 'Invalid coupon', 'error'),
                    )
                  }
                  className="px-4 py-2 text-xs font-semibold text-blue-700 bg-white border border-blue-200 rounded-lg"
                >
                  Apply
                </button>
              </div>
            )
          )}

          <div className="space-y-2.5 pt-3 border-t border-slate-200 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="font-semibold text-slate-900 font-mono tabular-nums">
                {formatNaira(subtotal)}
              </span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Delivery Fee ({stateName})</span>
              <span className="font-semibold text-slate-900 font-mono tabular-nums">
                {deliveryFee === 0 ? 'FREE' : formatNaira(deliveryFee)}
              </span>
            </div>
            {activeDiscount > 0 && (
              <div className="flex justify-between text-green-700">
                <span>Discount</span>
                <span className="font-semibold font-mono tabular-nums">
                  -{formatNaira(activeDiscount)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-lg font-extrabold text-slate-900 pt-3 border-t border-slate-200">
              <span>Total Payable</span>
              <span className="font-mono tabular-nums">{formatNaira(totalPayable)}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
