import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Heart,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Star,
  Truck,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { Product, Review } from '../types/ecommerce';
import { formatDateShort, formatNaira, getDiscountPercent } from '../utils/format';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { ProductCard } from '../components/ProductCard';
import { ImageWithFallback } from '../components/ImageWithFallback';

export function ProductDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    addToCart,
    wishlistIds,
    toggleWishlist,
    recentlyViewed,
    recordViewedProduct,
    notify,
  } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [related, setRelated] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [submittingAction, setSubmittingAction] = useState(false);

  // Review submission state
  const [rating, setRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setActiveImageIdx(0);
    setQuantity(1);
    apiRequest<{ product: Product; reviews: Review[]; related: Product[] }>(
      `/api/products/${slug}`,
    )
      .then((res) => {
        setProduct(res.product);
        setReviews(res.reviews || []);
        setRelated(res.related || []);
        setSelectedColor(res.product.colors[0] || '');
        const firstAvailVar =
          res.product.variants.find((v) => v.stock_quantity > 0) ||
          res.product.variants[0] ||
          null;
        setSelectedVariantId(firstAvailVar ? firstAvailVar.id : null);
        recordViewedProduct(res.product);
        document.title = `${res.product.name} | KoraTech Electronics`;
      })
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [slug, recordViewedProduct]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-6 aspect-[4/3] bg-slate-100 rounded-2xl animate-pulse" />
        <div className="lg:col-span-6 space-y-4">
          <div className="h-8 bg-slate-100 rounded w-3/4 animate-pulse" />
          <div className="h-6 bg-slate-100 rounded w-1/3 animate-pulse" />
          <div className="h-32 bg-slate-100 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">Product Not Found</h1>
        <p className="text-sm text-slate-600">
          This item may have been removed or unpublished.
        </p>
        <Link
          to="/category/all"
          className="inline-flex px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 rounded-lg"
        >
          Browse All Products
        </Link>
      </div>
    );
  }

  const activeVariant = selectedVariantId
    ? product.variants.find((v) => v.id === selectedVariantId) || null
    : null;
  const activePrice = activeVariant ? activeVariant.price_ngn : product.price_ngn;
  const activeOriginal = activeVariant
    ? activeVariant.original_price_ngn
    : product.original_price_ngn;
  const activeStock = activeVariant ? activeVariant.stock_quantity : product.stock_quantity;
  const discountPct = getDiscountPercent(activePrice, activeOriginal);
  const inStock = activeStock > 0;
  const isWishlisted = wishlistIds.includes(product.id);

  const handleAddToCart = async () => {
    if (!inStock || submittingAction) return;
    setSubmittingAction(true);
    try {
      await addToCart({
        productId: product.id,
        variantId: activeVariant?.id || null,
        selectedColor,
        quantity,
        openDrawer: true,
      });
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleBuyNow = async () => {
    if (!inStock || submittingAction) return;
    setSubmittingAction(true);
    try {
      await addToCart({
        productId: product.id,
        variantId: activeVariant?.id || null,
        selectedColor,
        quantity,
        openDrawer: false,
      });
      navigate('/checkout');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingReview(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          productId: product.id,
          rating,
          title: reviewTitle,
          comment: reviewComment,
        }),
      });
      notify(res.message, 'success');
      setReviewTitle('');
      setReviewComment('');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to submit review', 'error');
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-16">
      {/* Breadcrumb */}
      <nav className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
        <Link to="/" className="hover:text-blue-700">Home</Link>
        <span>/</span>
        {product.category_slug && (
          <>
            <Link to={`/category/${product.category_slug}`} className="hover:text-blue-700">
              {product.category_name}
            </Link>
            <span>/</span>
          </>
        )}
        <span className="text-slate-800 font-medium">{product.name}</span>
      </nav>

      {/* Main Contiguous Purchase Module */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left: Sticky Multi-Image Gallery */}
        <div className="lg:col-span-6 lg:sticky lg:top-24 space-y-3">
          <div className="aspect-[4/3] rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
            <ImageWithFallback
              src={product.images[activeImageIdx]?.image_url}
              alt={product.name}
              loading="eager"
              className="w-full h-full object-cover"
            />
          </div>

          {product.images.length > 1 && (
            <div className="flex items-center gap-3 overflow-x-auto pb-1">
              {product.images.map((img, idx) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setActiveImageIdx(idx)}
                  className={`w-20 h-16 rounded-lg overflow-hidden border-2 shrink-0 transition-all ${
                    activeImageIdx === idx
                      ? 'border-blue-700 ring-2 ring-sky-200'
                      : 'border-slate-200 opacity-75 hover:opacity-100'
                  }`}
                >
                  <ImageWithFallback
                    src={img.image_url}
                    alt={`${product.name} view ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Contiguous Purchase Details */}
        <div className="lg:col-span-6 space-y-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-700 mb-2">
              <span>{product.brand}</span>
              <span aria-hidden="true">·</span>
              <span>SKU {product.sku}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 text-slate-700 normal-case">
                <Star className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
                {product.rating_avg.toFixed(1)} ({reviews.length} reviews)
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">
              {product.name}
            </h1>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              {product.short_description}
            </p>
          </div>

          {/* Pricing Block */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-baseline justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-extrabold text-slate-900 font-mono tabular-nums">
                {formatNaira(activePrice)}
              </span>
              {activeOriginal && activeOriginal > activePrice && (
                <span className="text-base text-slate-400 line-through font-mono tabular-nums">
                  {formatNaira(activeOriginal)}
                </span>
              )}
              {discountPct > 0 && (
                <span className="text-xs font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded">
                  Save {discountPct}%
                </span>
              )}
            </div>

            {inStock ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700">
                <CheckCircle2 className="w-4 h-4" />
                In Stock ({activeStock} available)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600">
                <AlertCircle className="w-4 h-4" />
                OUT OF STOCK
              </span>
            )}
          </div>

          {/* Variation Selector */}
          {product.variants.length > 0 && (
            <div className="space-y-2.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Select Variation
              </label>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    disabled={v.stock_quantity <= 0}
                    onClick={() => {
                      setSelectedVariantId(v.id);
                      setQuantity((q) => Math.min(q, Math.max(1, v.stock_quantity)));
                    }}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                      selectedVariantId === v.id
                        ? 'border-blue-700 bg-sky-50 text-blue-800'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                    } disabled:opacity-40 disabled:line-through`}
                  >
                    {v.name} — {formatNaira(v.price_ngn)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Colour Selector */}
          {product.colors.length > 0 && (
            <div className="space-y-2.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Colour: <span className="text-slate-900">{selectedColor}</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {product.colors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setSelectedColor(color)}
                    className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors ${
                      selectedColor === color
                        ? 'border-blue-700 bg-blue-700 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                    }`}
                  >
                    {color}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quantity + Primary CTAs */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-4">
              <div className="inline-flex items-center border border-slate-300 rounded-lg bg-white">
                <button
                  type="button"
                  disabled={!inStock || quantity <= 1}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  aria-label="Decrease quantity"
                  className="w-11 h-11 flex items-center justify-center text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-12 text-center text-sm font-bold tabular-nums">{quantity}</span>
                <button
                  type="button"
                  disabled={!inStock || quantity >= activeStock}
                  onClick={() => setQuantity((q) => Math.min(activeStock, q + 1))}
                  aria-label="Increase quantity"
                  className="w-11 h-11 flex items-center justify-center text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => toggleWishlist(product.id)}
                className={`inline-flex items-center gap-2 px-4 h-11 text-sm font-semibold border rounded-lg transition-colors ${
                  isWishlisted
                    ? 'border-orange-500 text-orange-600 bg-orange-50'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-current' : ''}`} />
                {isWishlisted ? 'Saved' : 'Wishlist'}
              </button>
            </div>

            {!inStock ? (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 font-medium">
                OUT OF STOCK — This configuration is currently sold out. Check back soon or explore similar models below.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={submittingAction}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
                >
                  <ShoppingBag className="w-4 h-4" />
                  {submittingAction ? 'Adding...' : 'ADD TO CART'}
                </button>
                <button
                  type="button"
                  onClick={handleBuyNow}
                  disabled={submittingAction}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg transition-colors"
                >
                  <CreditCard className="w-4 h-4" />
                  {submittingAction ? 'Preparing Checkout...' : 'PAY NOW'}
                </button>
              </div>
            )}
          </div>

          {/* Delivery Info Box */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-2.5 text-xs text-slate-600 bg-sky-50/30">
            <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
              <Truck className="w-4 h-4 text-blue-700" />
              Nationwide Nigerian Delivery
            </div>
            <p>• Lagos same-day or next-day courier dispatch (₦3,500; free on orders ₦500,000+).</p>
            <p>• Abuja, Port Harcourt, Ibadan & Nationwide tracked air/express delivery (1–4 business days).</p>
            <div className="flex items-center gap-2 pt-1 text-green-700 font-medium">
              <ShieldCheck className="w-4 h-4" />
              Verified Paystack payment + direct WhatsApp order dispatch confirmation.
            </div>
          </div>
        </div>
      </div>

      {/* Description & Technical Specifications */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 pt-8 border-t border-slate-200">
        <div className="lg:col-span-6 space-y-3">
          <h2 className="text-xl font-bold text-slate-900">Product Overview</h2>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
            {product.description}
          </p>
        </div>

        <div className="lg:col-span-6 space-y-3">
          <h2 className="text-xl font-bold text-slate-900">Technical Specifications</h2>
          <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-200 text-sm">
            {Object.entries(product.specifications || {}).map(([key, val]) => (
              <div key={key} className="grid grid-cols-3 px-4 py-3 bg-white">
                <span className="font-medium text-slate-500">{key}</span>
                <span className="col-span-2 text-slate-900 font-medium">{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Customer Reviews + Verified Purchase Review Form */}
      <section className="pt-8 border-t border-slate-200 grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-7 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">
            Customer Reviews ({reviews.length})
          </h2>

          {reviews.length === 0 ? (
            <div className="p-6 border border-slate-200 rounded-xl text-sm text-slate-500">
              No approved reviews yet for this product. Verified buyers can leave the first review.
            </div>
          ) : (
            <div className="space-y-4">
              {reviews.map((rev) => (
                <div key={rev.id} className="p-5 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex text-orange-500">
                        {Array.from({ length: rev.rating }).map((_, i) => (
                          <Star key={i} className="w-4 h-4 fill-current" />
                        ))}
                      </div>
                      <span className="text-sm font-semibold text-slate-900">{rev.title}</span>
                    </div>
                    {rev.verified_purchase && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Verified Purchase
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">{rev.comment}</p>
                  <p className="text-xs text-slate-500">
                    {rev.reviewer_name} · {formatDateShort(rev.created_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5">
          <div className="border border-slate-200 rounded-xl p-6 bg-slate-50/70 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Write a Verified Review</h3>
            <p className="text-xs text-slate-600">
              Only verified customers who have completed a paid order for this product can submit a review.
            </p>
            {!user ? (
              <Link
                to="/login"
                className="inline-flex px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 rounded-lg"
              >
                Sign In to Submit Review
              </Link>
            ) : (
              <form onSubmit={handleSubmitReview} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Rating</label>
                  <select
                    value={rating}
                    onChange={(e) => setRating(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value={5}>5 Stars — Excellent</option>
                    <option value={4}>4 Stars — Very Good</option>
                    <option value={3}>3 Stars — Good</option>
                    <option value={2}>2 Stars — Fair</option>
                    <option value={1}>1 Star — Poor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Headline</label>
                  <input
                    type="text"
                    required
                    value={reviewTitle}
                    onChange={(e) => setReviewTitle(e.target.value)}
                    placeholder="Summary of your experience"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Review</label>
                  <textarea
                    rows={3}
                    required
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="Share quality, battery, and delivery notes..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submittingReview}
                  className="w-full py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
                >
                  {submittingReview ? 'Submitting...' : 'Submit Verified Review'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Related Products */}
      {related.length > 0 && (
        <section className="pt-8 border-t border-slate-200">
          <h2 className="text-xl font-bold text-slate-900 mb-6">Related Gadgets</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {/* Recently Viewed */}
      {recentlyViewed.filter((p) => p.id !== product.id).length > 0 && (
        <section className="pt-8 border-t border-slate-200">
          <h2 className="text-xl font-bold text-slate-900 mb-6">Recently Viewed</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {recentlyViewed
              .filter((p) => p.id !== product.id)
              .slice(0, 4)
              .map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
