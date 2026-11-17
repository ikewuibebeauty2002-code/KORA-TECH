import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Minus, Plus, ShoppingBag, Tag, Trash2 } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { formatNaira } from '../utils/format';
import { calculateDeliveryFeeNgn, NIGERIAN_STATES } from '../config/storeConfig';
import { ImageWithFallback } from '../components/ImageWithFallback';

export function CartPage() {
  const {
    items,
    subtotalNgn,
    discountNgn,
    appliedCoupon,
    applyCoupon,
    clearCoupon,
    updateItemQuantity,
    updateItemVariant,
    removeItem,
    notify,
  } = useCart();
  const navigate = useNavigate();

  const [couponInput, setCouponInput] = useState('');
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [estimateState, setEstimateState] = useState('Lagos');

  const deliveryFee = items.length > 0 ? calculateDeliveryFeeNgn(estimateState, subtotalNgn) : 0;
  const totalPayable = Math.max(0, subtotalNgn + deliveryFee - discountNgn);

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponInput.trim()) return;
    setApplyingCoupon(true);
    try {
      await applyCoupon(couponInput.trim());
      setCouponInput('');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Invalid coupon code', 'error');
    } finally {
      setApplyingCoupon(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center space-y-5">
        <div className="w-16 h-16 mx-auto rounded-full bg-sky-50 text-blue-700 flex items-center justify-center">
          <ShoppingBag className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Your Shopping Cart is Empty</h1>
        <p className="text-sm text-slate-600 max-w-md mx-auto">
          Add smartphones, laptops, tablets, or accessories to your cart to proceed to Paystack checkout.
        </p>
        <Link
          to="/category/all"
          className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
        >
          Explore Products
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-3xl font-bold text-slate-900 mb-8">Shopping Cart</h1>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Cart Items */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl divide-y divide-slate-200">
          {items.map((item) => {
            const unitPrice = item.variant ? item.variant.price_ngn : item.product.price_ngn;
            const maxStock = item.variant
              ? item.variant.stock_quantity
              : item.product.stock_quantity;

            return (
              <div key={item.id} className="p-5 flex flex-col sm:flex-row gap-5">
                <Link
                  to={`/product/${item.product.slug}`}
                  className="w-28 h-24 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden shrink-0"
                >
                  <ImageWithFallback
                    src={item.product.images[0]?.image_url}
                    alt={item.product.name}
                    className="w-full h-full object-cover"
                  />
                </Link>

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider">
                        {item.product.brand}
                      </p>
                      <Link
                        to={`/product/${item.product.slug}`}
                        className="text-base font-semibold text-slate-900 hover:text-blue-700"
                      >
                        {item.product.name}
                      </Link>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="text-slate-400 hover:text-red-600 p-1.5"
                      aria-label="Remove item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Allow changing variations or colour directly in cart */}
                  <div className="flex flex-wrap gap-2">
                    {item.product.variants.length > 0 && (
                      <select
                        value={item.variant_id || ''}
                        onChange={(e) =>
                          updateItemVariant(item.id, e.target.value || null, item.selected_color)
                        }
                        className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        {item.product.variants.map((v) => (
                          <option key={v.id} value={v.id} disabled={v.stock_quantity <= 0}>
                            {v.name} ({formatNaira(v.price_ngn)})
                          </option>
                        ))}
                      </select>
                    )}

                    {item.product.colors.length > 0 && (
                      <select
                        value={item.selected_color}
                        onChange={(e) =>
                          updateItemVariant(item.id, item.variant_id, e.target.value)
                        }
                        className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        {item.product.colors.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                    <div className="inline-flex items-center border border-slate-300 rounded-lg">
                      <button
                        type="button"
                        onClick={() => updateItemQuantity(item.id, item.quantity - 1)}
                        className="w-9 h-9 flex items-center justify-center text-slate-700 hover:bg-slate-50"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-10 text-center text-sm font-semibold tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        disabled={item.quantity >= maxStock}
                        onClick={() => updateItemQuantity(item.id, item.quantity + 1)}
                        className="w-9 h-9 flex items-center justify-center text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="text-right">
                      <p className="text-base font-bold text-slate-900 font-mono tabular-nums">
                        {formatNaira(unitPrice * item.quantity)}
                      </p>
                      <p className="text-xs text-slate-500 font-mono tabular-nums">
                        {formatNaira(unitPrice)} each
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary Sidebar */}
        <aside className="lg:col-span-4 bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-5">
          <h2 className="text-lg font-bold text-slate-900">Order Summary</h2>

          {/* Coupon Form */}
          {appliedCoupon ? (
            <div className="flex items-center justify-between px-3.5 py-2.5 bg-green-50 border border-green-200 rounded-lg text-xs">
              <span className="font-semibold text-green-800">
                Code <span className="font-mono">{appliedCoupon.code}</span> applied (-{formatNaira(discountNgn)})
              </span>
              <button
                type="button"
                onClick={clearCoupon}
                className="text-red-600 font-semibold hover:underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <form onSubmit={handleApplyCoupon} className="flex gap-2">
              <div className="relative flex-1">
                <Tag className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  placeholder="Coupon (e.g. KORA5)"
                  className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-lg bg-white uppercase"
                />
              </div>
              <button
                type="submit"
                disabled={applyingCoupon}
                className="px-4 py-2 text-xs font-semibold text-blue-700 bg-white border border-blue-200 hover:bg-sky-50 rounded-lg"
              >
                Apply
              </button>
            </form>
          )}

          {/* Delivery Estimator */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Estimate Delivery by State
            </label>
            <select
              value={estimateState}
              onChange={(e) => setEstimateState(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {NIGERIAN_STATES.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2.5 pt-3 border-t border-slate-200 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="font-semibold text-slate-900 font-mono tabular-nums">
                {formatNaira(subtotalNgn)}
              </span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Estimated Delivery ({estimateState})</span>
              <span className="font-semibold text-slate-900 font-mono tabular-nums">
                {deliveryFee === 0 ? 'FREE' : formatNaira(deliveryFee)}
              </span>
            </div>
            {discountNgn > 0 && (
              <div className="flex justify-between text-green-700">
                <span>Discount</span>
                <span className="font-semibold font-mono tabular-nums">
                  -{formatNaira(discountNgn)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-slate-900 pt-2.5 border-t border-slate-200">
              <span>Estimated Total</span>
              <span className="font-mono tabular-nums">{formatNaira(totalPayable)}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/checkout')}
            className="w-full py-3.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg inline-flex items-center justify-center gap-2"
          >
            Proceed to Checkout
            <ArrowRight className="w-4 h-4" />
          </button>
        </aside>
      </div>
    </div>
  );
}
