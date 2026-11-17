import { Link, useNavigate } from 'react-router-dom';
import { Minus, Plus, ShoppingBag, Trash2, X, ArrowRight } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { formatNaira } from '../utils/format';
import { ImageWithFallback } from './ImageWithFallback';

export function CartDrawer() {
  const {
    items,
    subtotalNgn,
    discountNgn,
    isDrawerOpen,
    setDrawerOpen,
    updateItemQuantity,
    removeItem,
  } = useCart();
  const navigate = useNavigate();

  if (!isDrawerOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
        onClick={() => setDrawerOpen(false)}
      />

      <aside
        aria-label="Shopping Cart"
        className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col z-10"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-blue-700" />
            <h2 className="text-base font-bold text-slate-900">Your Shopping Cart</h2>
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close cart"
            className="p-2 text-slate-500 hover:text-slate-900 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 divide-y divide-slate-100">
          {items.length === 0 ? (
            <div className="py-16 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-sky-50 flex items-center justify-center text-blue-700">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div>
                <p className="text-base font-semibold text-slate-900">Your cart is empty</p>
                <p className="text-sm text-slate-500 mt-1">
                  Explore genuine smartphones, laptops, power banks, and audio accessories.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  navigate('/category/smartphones');
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
              >
                Browse Gadgets
              </button>
            </div>
          ) : (
            items.map((item) => {
              const unitPrice = item.variant ? item.variant.price_ngn : item.product.price_ngn;
              const maxStock = item.variant
                ? item.variant.stock_quantity
                : item.product.stock_quantity;
              return (
                <div key={item.id} className="py-4 flex gap-3.5">
                  <Link
                    to={`/product/${item.product.slug}`}
                    onClick={() => setDrawerOpen(false)}
                    className="w-20 h-20 rounded-lg bg-slate-50 border border-slate-200 overflow-hidden shrink-0"
                  >
                    <ImageWithFallback
                      src={item.product.images[0]?.image_url}
                      alt={item.product.name}
                      className="w-full h-full object-cover"
                    />
                  </Link>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        to={`/product/${item.product.slug}`}
                        onClick={() => setDrawerOpen(false)}
                        className="text-sm font-semibold text-slate-900 hover:text-blue-700 line-clamp-2"
                      >
                        {item.product.name}
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        aria-label="Remove item"
                        className="text-slate-400 hover:text-red-600 p-1 shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {(item.variant || item.selected_color) && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        {[item.variant?.name, item.selected_color].filter(Boolean).join(' · ')}
                      </p>
                    )}

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="inline-flex items-center border border-slate-200 rounded-lg">
                        <button
                          type="button"
                          onClick={() => updateItemQuantity(item.id, item.quantity - 1)}
                          aria-label="Decrease quantity"
                          className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-50"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-8 text-center text-xs font-semibold tabular-nums">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          disabled={item.quantity >= maxStock}
                          onClick={() => updateItemQuantity(item.id, item.quantity + 1)}
                          aria-label="Increase quantity"
                          className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <span className="text-sm font-bold text-slate-900 font-mono tabular-nums">
                        {formatNaira(unitPrice * item.quantity)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {items.length > 0 && (
          <div className="p-5 border-t border-slate-200 bg-slate-50 space-y-3">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Subtotal</span>
              <span className="font-semibold text-slate-900 font-mono tabular-nums">
                {formatNaira(subtotalNgn)}
              </span>
            </div>
            {discountNgn > 0 && (
              <div className="flex justify-between text-sm text-green-700">
                <span>Coupon Discount</span>
                <span className="font-semibold font-mono tabular-nums">
                  -{formatNaira(discountNgn)}
                </span>
              </div>
            )}
            <p className="text-xs text-slate-500">
              Delivery fee calculated at checkout based on your Nigerian state. Free shipping on orders ₦500,000+.
            </p>
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <Link
                to="/cart"
                onClick={() => setDrawerOpen(false)}
                className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg"
              >
                View Cart
              </Link>
              <Link
                to="/checkout"
                onClick={() => setDrawerOpen(false)}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg"
              >
                Checkout
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
