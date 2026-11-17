import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2, MessageCircle } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import type { Order } from '../types/ecommerce';
import { buildOrderWhatsAppMessage, buildOrderWhatsAppUrl, formatNaira } from '../utils/format';

export function PaymentCallbackPage() {
  const [searchParams] = useSearchParams();
  const reference = searchParams.get('reference') || searchParams.get('trxref') || '';
  const { refreshCart } = useCart();
  const { gatewayConfig } = useAuth();

  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [autoRedirectAttempted, setAutoRedirectAttempted] = useState(false);

  useEffect(() => {
    document.title = 'Verifying Payment | KoraTech Electronics';
    if (!reference) {
      setVerifying(false);
      setErrorMsg('No Paystack transaction reference was found in the callback URL.');
      return;
    }

    apiRequest<{
      verified: boolean;
      paymentStatus?: string;
      order?: Order;
      error?: string;
    }>('/api/paystack/verify', {
      method: 'POST',
      body: JSON.stringify({ reference }),
    })
      .then((res) => {
        setOrder(res.order || null);
        if (res.verified && res.order) {
          setVerified(true);
          refreshCart();
        } else {
          setVerified(false);
          setErrorMsg(res.error || 'Payment verification failed or transaction was cancelled.');
        }
      })
      .catch((err) => {
        setVerified(false);
        setErrorMsg(err instanceof Error ? err.message : 'Unable to verify transaction.');
      })
      .finally(() => setVerifying(false));
  }, [reference, refreshCart]);

  const whatsappUrl = order
    ? buildOrderWhatsAppUrl(order, gatewayConfig?.whatsappBusinessNumber)
    : '';

  // Automatically open WhatsApp conversation ONLY after verified backend payment (when top-level window)
  useEffect(() => {
    if (
      verified &&
      order &&
      whatsappUrl &&
      !autoRedirectAttempted &&
      typeof window !== 'undefined' &&
      window.self === window.top
    ) {
      setAutoRedirectAttempted(true);
      const timer = setTimeout(() => {
        try {
          window.location.assign(whatsappUrl);
        } catch {
          // User can click CONTINUE TO WHATSAPP
        }
      }, 1400);
      return () => clearTimeout(timer);
    }
  }, [verified, order, whatsappUrl, autoRedirectAttempted]);

  if (verifying) {
    return (
      <div className="max-w-xl mx-auto px-4 py-24 text-center space-y-4">
        <Loader2 className="w-10 h-10 text-blue-700 animate-spin mx-auto" />
        <h1 className="text-2xl font-bold text-slate-900">Verifying Your Paystack Payment</h1>
        <p className="text-sm text-slate-600">
          Confirming transaction <span className="font-mono font-semibold">{reference}</span> directly with Paystack...
        </p>
      </div>
    );
  }

  if (!verified || !order) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 space-y-6">
        <div className="border border-red-200 bg-red-50 rounded-2xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h1 className="text-xl font-bold text-slate-900">Payment Not Confirmed</h1>
              <p className="text-sm text-red-800 mt-1">{errorMsg}</p>
              {reference && (
                <p className="text-xs text-slate-600 mt-2 font-mono">Reference: {reference}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              to="/checkout"
              className="px-5 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg"
            >
              Retry Checkout
            </Link>
            <Link
              to="/cart"
              className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Return to Cart
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-6">
      {/* Verified Green Confirmation Banner */}
      <div className="border border-green-200 bg-green-50 rounded-2xl p-6 sm:p-8 space-y-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-7 h-7 text-green-700 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-green-800">
              Payment Verified · Order Confirmed
            </p>
            <h1 className="text-2xl font-extrabold text-slate-900 mt-1">
              Thank you, {order.customer_name}!
            </h1>
            <p className="text-sm text-slate-700 mt-1">
              Order <span className="font-mono font-bold">{order.order_number}</span> has been paid
              and saved. We are redirecting you to WhatsApp so you can send your confirmation message to our dispatch desk.
            </p>
          </div>
        </div>

        <div className="pt-2 flex flex-wrap gap-3">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-bold text-white bg-green-700 hover:bg-green-800 rounded-xl shadow-sm"
          >
            <MessageCircle className="w-5 h-5" />
            CONTINUE TO WHATSAPP
          </a>
          <Link
            to={`/track-order?order=${encodeURIComponent(order.order_number)}&email=${encodeURIComponent(order.customer_email)}`}
            className="inline-flex items-center px-5 py-3.5 text-sm font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl"
          >
            Track Order Status
          </Link>
        </div>
        <p className="text-xs text-slate-600">
          Note: Once WhatsApp opens with your pre-filled order summary, tap <strong>Send</strong> inside WhatsApp to complete your direct chat.
        </p>
      </div>

      {/* Receipt & Message Preview */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
          <div>
            <p className="text-xs text-slate-500">Order Number</p>
            <p className="font-mono font-bold text-slate-900">{order.order_number}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Paystack Reference</p>
            <p className="font-mono font-semibold text-slate-900">{order.paystack_reference}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Total Paid</p>
            <p className="font-mono font-extrabold text-green-700 text-lg">
              {formatNaira(order.total_ngn)}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-bold text-slate-900">Items Purchased</h2>
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm text-slate-700">
              <span>
                {item.product_name} × {item.quantity}
              </span>
              <span className="font-mono font-semibold">{formatNaira(item.line_total_ngn)}</span>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-slate-100">
          <p className="text-xs font-semibold text-slate-500 mb-2">
            Pre-filled WhatsApp Confirmation Message
          </p>
          <pre className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3.5 whitespace-pre-wrap text-slate-700 font-sans">
            {buildOrderWhatsAppMessage(order)}
          </pre>
        </div>
      </div>
    </div>
  );
}
