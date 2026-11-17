import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, ShoppingBag, Star, CheckCircle2, AlertCircle, CreditCard } from 'lucide-react';
import type { Product } from '../types/ecommerce';
import { formatNaira, getDiscountPercent } from '../utils/format';
import { useCart } from '../context/CartContext';
import { ImageWithFallback } from './ImageWithFallback';

export function ProductCard({ product }: { product: Product }) {
  const navigate = useNavigate();
  const { addToCart, wishlistIds, toggleWishlist } = useCart();
  const [adding, setAdding] = useState(false);
  const [payingNow, setPayingNow] = useState(false);

  const primaryImage = product.images[0]?.image_url || '';
  const discountPct = getDiscountPercent(product.price_ngn, product.original_price_ngn);
  const inStock = product.stock_quantity > 0;
  const isLowStock = inStock && product.stock_quantity <= product.low_stock_threshold;
  const isWishlisted = wishlistIds.includes(product.id);

  const handleQuickAdd = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!inStock || adding || payingNow) return;
    setAdding(true);
    try {
      const defaultVariant = product.variants.find((v) => v.stock_quantity > 0) || null;
      await addToCart({
        productId: product.id,
        variantId: defaultVariant?.id || null,
        selectedColor: product.colors[0] || '',
        quantity: 1,
        openDrawer: true,
      });
    } finally {
      setAdding(false);
    }
  };

  const handlePayNow = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!inStock || adding || payingNow) return;
    setPayingNow(true);
    try {
      const defaultVariant = product.variants.find((v) => v.stock_quantity > 0) || null;
      await addToCart({
        productId: product.id,
        variantId: defaultVariant?.id || null,
        selectedColor: product.colors[0] || '',
        quantity: 1,
        openDrawer: false,
      });
      navigate('/checkout');
    } finally {
      setPayingNow(false);
    }
  };

  return (
    <article className="group bg-white border border-slate-200/80 rounded-xl overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/5">
      {/* Studio Image Area (65–70% visual weight) */}
      <Link
        to={`/product/${product.slug}`}
        className="relative block aspect-[4/3] bg-slate-50 overflow-hidden"
      >
        <ImageWithFallback
          src={primaryImage}
          alt={product.name}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleWishlist(product.id);
          }}
          aria-label={isWishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
          className={`absolute top-3 right-3 w-9 h-9 rounded-lg flex items-center justify-center border transition-colors ${
            isWishlisted
              ? 'bg-orange-500 border-orange-500 text-white'
              : 'bg-white/90 border-slate-200 text-slate-600 hover:text-orange-600'
          }`}
        >
          <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-current' : ''}`} />
        </button>

        {discountPct > 0 && (
          <span className="absolute top-3 left-3 bg-orange-600 text-white text-xs font-semibold px-2.5 py-1 rounded-md tabular-nums">
            -{discountPct}%
          </span>
        )}
      </Link>

      {/* Clean Metadata + Price + Action */}
      <div className="p-4 flex flex-col flex-1 justify-between gap-3">
        <div>
          {/* Clean Unboxed Metadata */}
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1.5">
            <span className="uppercase tracking-wider font-medium truncate">
              {product.brand}
              {product.subcategory_name
                ? ` · ${product.subcategory_name}`
                : product.category_name
                  ? ` · ${product.category_name}`
                  : ''}
            </span>
            <span className="flex items-center gap-1 text-slate-700 font-medium shrink-0 tabular-nums">
              <Star className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
              {product.rating_avg.toFixed(1)}
            </span>
          </div>

          <Link to={`/product/${product.slug}`}>
            <h3 className="text-[15px] font-semibold text-slate-900 leading-snug line-clamp-2 group-hover:text-blue-700 transition-colors">
              {product.name}
            </h3>
          </Link>
        </div>

        <div className="pt-2 border-t border-slate-100 space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-base font-bold text-slate-900 font-mono tabular-nums">
                {formatNaira(product.price_ngn)}
              </span>
              {product.original_price_ngn && product.original_price_ngn > product.price_ngn && (
                <span className="text-xs text-slate-400 line-through font-mono tabular-nums">
                  {formatNaira(product.original_price_ngn)}
                </span>
              )}
            </div>

            {inStock ? (
              <span
                className={`inline-flex items-center gap-1 text-xs font-medium shrink-0 ${
                  isLowStock ? 'text-orange-600' : 'text-green-700'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {isLowStock ? `${product.stock_quantity} left` : 'In Stock'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 shrink-0">
                <AlertCircle className="w-3.5 h-3.5" />
                Out of Stock
              </span>
            )}
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Link
                to={`/product/${product.slug}`}
                className="inline-flex items-center justify-center px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
              >
                View Product
              </Link>
              <button
                type="button"
                disabled={!inStock || adding || payingNow}
                onClick={handleQuickAdd}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 bg-sky-50 hover:bg-sky-100 border border-blue-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                {!inStock ? 'Sold Out' : adding ? 'Adding...' : 'Add to Cart'}
              </button>
            </div>
            <button
              type="button"
              disabled={!inStock || adding || payingNow}
              onClick={handlePayNow}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap"
            >
              <CreditCard className="w-3.5 h-3.5" />
              {!inStock ? 'Out of Stock' : payingNow ? 'Going to Checkout...' : 'Pay Now'}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
