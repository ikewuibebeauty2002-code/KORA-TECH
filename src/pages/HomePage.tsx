import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Headphones,
  ShieldCheck,
  ShoppingBag,
  Star,
  Truck,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { Category, Product, Review } from '../types/ecommerce';
import { ProductCard } from '../components/ProductCard';
import { ImageWithFallback } from '../components/ImageWithFallback';
import { getDiscountPercent } from '../utils/format';
import { useCart } from '../context/CartContext';

const POPULAR_CATEGORY_SLUGS = [
  { slug: 'smartphones', label: 'Smartphones', image: '/src/assets/images/cat_smartphones_1794811185877.jpg' },
  { slug: 'laptops', label: 'Laptops', image: '/src/assets/images/cat_laptops_1794811186663.jpg' },
  { slug: 'tablets', label: 'Tablets', image: '/src/assets/images/cat_tablets_ipads_1794811187089.jpg' },
  { slug: 'smartwatches', label: 'Smartwatches', image: '/src/assets/images/cat_smartwatches_1794811188374.jpg' },
  { slug: 'airpods', label: 'Earphones & AirPods', image: '/src/assets/images/cat_audio_airpods_1794811187517.jpg' },
  { slug: 'accessories', label: 'Accessories', image: '/src/assets/images/promo_deals_bundle_1794811188657.jpg' },
  { slug: 'power-banks', label: 'Power Banks', image: '/src/assets/images/cat_powerbanks_chargers_1794811188107.jpg' },
  { slug: 'tripods', label: 'Tripods', image: '/src/assets/images/cat_speakers_accessories_1794811188640.jpg' },
];

type CollectionTab = 'featured' | 'new-arrivals' | 'best-sellers' | 'trending' | 'recommended';

export function HomePage() {
  const { notify } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<CollectionTab>('featured');

  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [submittingNews, setSubmittingNews] = useState(false);

  useEffect(() => {
    document.title = 'KoraTech Electronics — Genuine Gadgets & Electronics Store Nigeria';
    Promise.all([
      apiRequest<{ products: Product[] }>('/api/products?limit=48'),
      apiRequest<{ categories: Category[] }>('/api/categories'),
      apiRequest<{ reviews: Review[] }>('/api/reviews/featured'),
    ])
      .then(([prodRes, catRes, revRes]) => {
        setProducts(prodRes.products || []);
        setCategories(catRes.categories || []);
        setReviews(revRes.reviews || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const tabbedProducts = products
    .filter((p) => {
      if (activeTab === 'featured') return p.is_featured;
      if (activeTab === 'new-arrivals') return p.is_new_arrival;
      if (activeTab === 'best-sellers') return p.is_best_seller;
      if (activeTab === 'trending') return p.is_trending;
      return p.is_recommended;
    })
    .slice(0, 8);

  const dealProducts = products
    .filter((p) => p.original_price_ngn && p.original_price_ngn > p.price_ngn)
    .sort(
      (a, b) =>
        getDiscountPercent(b.price_ngn, b.original_price_ngn) -
        getDiscountPercent(a.price_ngn, a.original_price_ngn),
    )
    .slice(0, 4);

  const handleNewsletter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail.trim()) return;
    setSubmittingNews(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/newsletter', {
        method: 'POST',
        body: JSON.stringify({ email: newsletterEmail }),
      });
      notify(res.message, 'success');
      setNewsletterEmail('');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Subscription failed', 'error');
    } finally {
      setSubmittingNews(false);
    }
  };

  return (
    <div className="bg-white">
      {/* A. Hero Section */}
      <section className="border-b border-slate-200 bg-gradient-to-b from-sky-50/70 via-white to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">
              Authorized Electronics Retail · Lagos & Nationwide
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 leading-[1.12] tracking-tight">
              Flagship Gadgets, Built for Work & Everyday Life in Nigeria.
            </h1>
            <p className="text-base text-slate-600 leading-relaxed max-w-xl">
              Shop genuine smartphones, laptops, iPads, smartwatches, and high-capacity power banks
              backed by manufacturer warranty and fast nationwide delivery.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                to="/category/smartphones"
                className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap"
              >
                Shop Now
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/category/all"
                className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold text-blue-700 bg-white border border-blue-200 hover:bg-sky-50 rounded-lg transition-colors whitespace-nowrap"
              >
                Explore Products
              </Link>
            </div>

            <div className="pt-4 border-t border-slate-200/80 grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="font-bold text-slate-900 font-mono tabular-nums">100% Genuine</p>
                <p className="text-slate-500 mt-0.5">Factory-sealed stock</p>
              </div>
              <div>
                <p className="font-bold text-slate-900 font-mono tabular-nums">Paystack Verified</p>
                <p className="text-slate-500 mt-0.5">Card, Transfer, USSD</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="h-full min-h-[280px] sm:min-h-[380px] rounded-2xl overflow-hidden border border-slate-200 bg-slate-50">
              <ImageWithFallback
                src="/src/assets/images/hero_gadgets_flagship_1794811185456.jpg"
                alt="Flagship smartphone, aluminum laptop, wireless headphones, and smartwatch"
                loading="eager"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* B. Popular Categories */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
        <div className="flex items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Popular Categories</h2>
            <p className="text-sm text-slate-600 mt-1">
              Explore curated hardware and accessories across {categories.length || 18} categories.
            </p>
          </div>
          <Link
            to="/category/all"
            className="text-sm font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1 whitespace-nowrap"
          >
            View All
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-5">
          {POPULAR_CATEGORY_SLUGS.map((cat) => (
            <Link
              key={cat.slug}
              to={`/category/${cat.slug}`}
              className="group bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-blue-300 hover:shadow-md transition-all"
            >
              <div className="aspect-[4/3] bg-slate-50 overflow-hidden">
                <ImageWithFallback
                  src={cat.image}
                  alt={cat.label}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <div className="p-3.5 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900 group-hover:text-blue-700">
                  {cat.label}
                </span>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-700" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* C, D, E, G, H. Curated Product Showcase (Tabbed for Clean Editorial Pacing) */}
      <section className="border-t border-slate-200 bg-slate-50/50 py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Curated Gadgets</h2>
              <p className="text-sm text-slate-600 mt-1">
                Live inventory synced directly from our store catalog.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-200/70 rounded-xl">
              {(
                [
                  { id: 'featured', label: 'Featured' },
                  { id: 'new-arrivals', label: 'New Arrivals' },
                  { id: 'best-sellers', label: 'Best Sellers' },
                  { id: 'trending', label: 'Trending' },
                  { id: 'recommended', label: 'Recommended' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-xl h-80 animate-pulse" />
              ))}
            </div>
          ) : tabbedProducts.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-500">
              No products assigned to this section yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {tabbedProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}

          <div className="mt-8 text-center">
            <Link
              to={`/category/${activeTab === 'new-arrivals' ? 'new-arrivals' : 'all'}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-blue-700 bg-white border border-blue-200 hover:bg-sky-50 rounded-lg"
            >
              Browse Full Catalog
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* F. Special Offers & Deals */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
        <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 text-white grid grid-cols-1 lg:grid-cols-12 mb-8">
          <div className="lg:col-span-6 p-8 sm:p-10 flex flex-col justify-center space-y-4">
            <span className="text-xs font-semibold uppercase tracking-widest text-orange-400">
              Special Offers & Bundle Savings
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold leading-tight">
              Save up to 20% on Power Banks, Smartphones & Creator Kits
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Grab verified markdowns on flagship devices, ITEL PowerGo backup chargers, and audio
              gear.
            </p>
            <div className="pt-2">
              <Link
                to="/category/deals"
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg"
              >
                Shop All Deals
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
          <div className="lg:col-span-6 min-h-[240px]">
            <ImageWithFallback
              src="/src/assets/images/promo_deals_bundle_1794811188657.jpg"
              alt="Curated gadget deals bundle"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {dealProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      {/* I. Verified Customer Reviews */}
      <section className="border-t border-slate-200 bg-sky-50/40 py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Verified Customer Reviews
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Authentic feedback from Nigerian buyers after verified order delivery.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {reviews.slice(0, 4).map((rev) => (
              <div
                key={rev.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-0.5 text-orange-500">
                      {Array.from({ length: rev.rating }).map((_, idx) => (
                        <Star key={idx} className="w-4 h-4 fill-current" />
                      ))}
                    </div>
                    {rev.verified_purchase && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Verified Buyer
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900">{rev.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-4">{rev.comment}</p>
                </div>

                <div className="pt-3 border-t border-slate-100 text-xs">
                  <p className="font-semibold text-slate-900">{rev.reviewer_name}</p>
                  {rev.product_name && (
                    <p className="text-slate-500 truncate mt-0.5">{rev.product_name}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* J. Trust Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12 border-b border-slate-200">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
          {[
            { icon: CreditCard, title: 'Secure Paystack Payments', desc: 'Verified card, bank & USSD checkout' },
            { icon: ShieldCheck, title: 'Quality Gadgets', desc: '100% genuine factory-sealed devices' },
            { icon: Headphones, title: 'Customer Support', desc: 'Direct WhatsApp & Lagos phone team' },
            { icon: Truck, title: 'Reliable Delivery', desc: 'Tracked dispatch across 36 states + FCT' },
            { icon: ShoppingBag, title: 'Easy Ordering', desc: 'Guest or account checkout in minutes' },
          ].map((item) => (
            <div key={item.title} className="flex flex-col items-start gap-2">
              <div className="w-10 h-10 rounded-lg bg-sky-50 text-blue-700 flex items-center justify-center">
                <item.icon className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
              <p className="text-xs text-slate-600 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* K. Newsletter */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-12">
        <div className="bg-blue-700 rounded-2xl p-8 sm:p-10 text-white flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="max-w-xl">
            <h2 className="text-2xl font-bold">Get Restock Alerts & Exclusive Naira Deals</h2>
            <p className="text-sm text-sky-100 mt-1.5">
              Join our newsletter for early access to iPhone arrivals, MacBook drops, and seasonal gadget discounts.
            </p>
          </div>
          <form onSubmit={handleNewsletter} className="w-full lg:w-auto flex flex-col sm:flex-row gap-2.5">
            <input
              type="email"
              required
              value={newsletterEmail}
              onChange={(e) => setNewsletterEmail(e.target.value)}
              placeholder="Enter your email address"
              className="w-full sm:w-72 px-4 py-3 text-sm text-slate-900 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <button
              type="submit"
              disabled={submittingNews}
              className="px-6 py-3 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg whitespace-nowrap"
            >
              {submittingNews ? 'Subscribing...' : 'Subscribe'}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
