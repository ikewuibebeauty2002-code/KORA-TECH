import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { Product } from '../types/ecommerce';
import { ProductCard } from '../components/ProductCard';

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [queryInput, setQueryInput] = useState(initialQuery);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setQueryInput(initialQuery);
    document.title = initialQuery
      ? `Search: ${initialQuery} | KoraTech Electronics`
      : 'Search Gadgets | KoraTech Electronics';

    setLoading(true);
    apiRequest<{ products: Product[] }>(
      `/api/products?search=${encodeURIComponent(initialQuery)}&limit=36`,
    )
      .then((res) => setProducts(res.products || []))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [initialQuery]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchParams(queryInput.trim() ? { q: queryInput.trim() } : {});
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold text-slate-900">Search Products</h1>
        <p className="text-sm text-slate-600 mt-1">
          Search across product names, brands, categories, descriptions, and technical specifications.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="e.g. Titanium, M3, 20000mAh, Tripod, ITEL..."
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
          >
            Search
          </button>
        </form>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-80 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="border border-slate-200 rounded-xl p-12 text-center space-y-3">
          <p className="text-lg font-semibold text-slate-900">
            No products matched "{initialQuery}"
          </p>
          <p className="text-sm text-slate-500">
            Try searching for broader terms like iPhone, MacBook, Samsung, Anker, ITEL, or Tripod.
          </p>
          <Link
            to="/category/all"
            className="inline-flex px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 rounded-lg"
          >
            Browse All Gadgets
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-slate-500 tabular-nums">
            Found {products.length} matching product{products.length === 1 ? '' : 's'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
