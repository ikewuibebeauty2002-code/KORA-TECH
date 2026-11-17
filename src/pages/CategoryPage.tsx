import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Filter, SlidersHorizontal, X } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { Category, Product } from '../types/ecommerce';
import { ImageWithFallback } from '../components/ImageWithFallback';
import { ProductCard } from '../components/ProductCard';

export function CategoryPage() {
  const { slug = 'all' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [features, setFeatures] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const selectedBrand = searchParams.get('brand') || 'all';
  const selectedFeature = searchParams.get('feature') || 'all';
  const minPrice = searchParams.get('minPrice') || '';
  const maxPrice = searchParams.get('maxPrice') || '';
  const inStockOnly = searchParams.get('inStock') === 'true';
  const sort = searchParams.get('sort') || 'newest';
  const page = Number(searchParams.get('page') || '1');

  useEffect(() => {
    apiRequest<{ categories: Category[] }>('/api/categories')
      .then((res) => setCategories(res.categories || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    qs.set('category', slug);
    if (selectedBrand !== 'all') qs.set('brand', selectedBrand);
    if (selectedFeature !== 'all') qs.set('feature', selectedFeature);
    if (minPrice) qs.set('minPrice', minPrice);
    if (maxPrice) qs.set('maxPrice', maxPrice);
    if (inStockOnly) qs.set('inStock', 'true');
    qs.set('sort', sort);
    qs.set('page', String(page));
    qs.set('limit', '12');

    apiRequest<{
      products: Product[];
      total: number;
      totalPages: number;
      brands: string[];
      features: string[];
    }>(`/api/products?${qs.toString()}`)
      .then((res) => {
        setProducts(res.products || []);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 1);
        setBrands(res.brands || []);
        setFeatures(res.features || []);
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [slug, selectedBrand, selectedFeature, minPrice, maxPrice, inStockOnly, sort, page]);

  const currentCat = categories.find((c) => c.slug === slug);
  const pageTitle =
    slug === 'all'
      ? 'All Gadgets & Electronics'
      : slug === 'deals'
        ? 'Deals & Special Offers'
        : currentCat?.name || slug.replace(/-/g, ' ');

  const pageDescription =
    slug === 'all'
      ? 'Browse all authentic smartphones, laptops, tablets, audio gear, and power accessories in Nigeria.'
      : slug === 'deals'
        ? 'Verified price markdowns and seasonal offers across KoraTech Electronics.'
        : currentCat?.description || 'Authentic gadgets backed by Nigerian warranty and fast delivery.';

  useEffect(() => {
    document.title = `${pageTitle} | KoraTech Electronics`;
  }, [pageTitle]);

  const updateFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    next.delete('page');
    setSearchParams(next);
  };

  const resetFilters = () => {
    setSearchParams({});
  };

  const mainCategories = categories.filter((c) => !c.parent_id);
  const subCategories = categories.filter((c) => c.parent_id);

  const FilterControls = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
          Categories
        </h3>
        <div className="space-y-1 text-sm">
          <Link
            to="/category/all"
            className={`block px-2.5 py-1.5 rounded-lg ${
              slug === 'all' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            All Products
          </Link>
          {mainCategories.map((c) => (
            <Link
              key={c.id}
              to={`/category/${c.slug}`}
              className={`block px-2.5 py-1.5 rounded-lg ${
                slug === c.slug
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {c.name}
            </Link>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
          Accessories & Subcategories
        </h3>
        <div className="space-y-1 text-xs">
          {subCategories.map((c) => (
            <Link
              key={c.id}
              to={`/category/${c.slug}`}
              className={`block px-2.5 py-1.5 rounded-lg ${
                slug === c.slug
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {c.name}
            </Link>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
          Price Range (₦)
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            min={0}
            placeholder="Min ₦"
            value={minPrice}
            onChange={(e) => updateFilter('minPrice', e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
          />
          <input
            type="number"
            min={0}
            placeholder="Max ₦"
            value={maxPrice}
            onChange={(e) => updateFilter('maxPrice', e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
          />
        </div>
      </div>

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
          Brand
        </h3>
        <select
          value={selectedBrand}
          onChange={(e) => updateFilter('brand', e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
        >
          <option value="all">All Brands</option>
          {brands.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </div>

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
          Key Features
        </h3>
        <select
          value={selectedFeature}
          onChange={(e) => updateFilter('feature', e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
        >
          <option value="all">Any Feature</option>
          {features.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
        <input
          type="checkbox"
          checked={inStockOnly}
          onChange={(e) => updateFilter('inStock', e.target.checked ? 'true' : null)}
          className="w-4 h-4 rounded border-slate-300 text-blue-700"
        />
        <span>In Stock Only</span>
      </label>

      <button
        type="button"
        onClick={resetFilters}
        className="w-full py-2 text-xs font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-lg"
      >
        Reset All Filters
      </button>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      {/* Category Header */}
      <div className="border-b border-slate-200 pb-6 mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500 mb-1.5">
            <Link to="/" className="hover:text-blue-700">Home</Link> · Category
          </p>
          <h1 className="text-3xl font-bold text-slate-900 capitalize">{pageTitle}</h1>
          <p className="text-sm text-slate-600 mt-1.5 max-w-2xl">{pageDescription}</p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(true)}
            className="lg:hidden inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-slate-300 rounded-lg bg-white"
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>

          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-slate-500" />
            <select
              value={sort}
              onChange={(e) => updateFilter('sort', e.target.value)}
              aria-label="Sort products"
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium"
            >
              <option value="popular">Most Popular</option>
              <option value="newest">Newest Arrivals</option>
              <option value="best_selling">Best Selling</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
            </select>
          </div>
        </div>
      </div>

      {slug === 'laptops' && (
        <div className="mb-8 rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 shadow-sm">
          <ImageWithFallback
            src="https://i.ibb.co/6G0mj7m/288d4adb-450c-486f-96e2-4f06c6b361dc.jpg"
            alt="Laptops collection showcase"
            loading="eager"
            className="w-full h-56 sm:h-72 lg:h-80 object-cover"
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Desktop Sidebar Filters */}
        <aside className="hidden lg:block lg:col-span-3 border-r border-slate-200 pr-6">
          <FilterControls />
        </aside>

        {/* Product Grid */}
        <div className="lg:col-span-9">
          <p className="text-xs text-slate-500 mb-4 tabular-nums">
            Showing {products.length} of {total} product{total === 1 ? '' : 's'}
          </p>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-slate-100 rounded-xl h-80 animate-pulse" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="border border-slate-200 rounded-xl p-12 text-center space-y-3">
              <p className="text-lg font-semibold text-slate-900">No matching products found</p>
              <p className="text-sm text-slate-500">
                Try clearing your price range or brand filters to view available inventory.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 rounded-lg"
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="mt-10 flex items-center justify-center gap-2">
                  {Array.from({ length: totalPages }).map((_, idx) => {
                    const p = idx + 1;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          const next = new URLSearchParams(searchParams);
                          next.set('page', String(p));
                          setSearchParams(next);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className={`w-10 h-10 rounded-lg text-sm font-semibold tabular-nums ${
                          page === p
                            ? 'bg-blue-700 text-white'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mobile Filters Modal */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileFiltersOpen(false)}
          />
          <div className="relative w-80 max-w-full bg-white h-full overflow-y-auto p-5 z-10 shadow-xl">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">Filter Products</h2>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="p-1.5 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <FilterControls />
          </div>
        </div>
      )}
    </div>
  );
}
