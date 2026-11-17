import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  Menu,
  Search,
  ShoppingBag,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import type { Product } from '../types/ecommerce';
import { formatNaira } from '../utils/format';

const ACCESSORIES_LINKS = [
  { label: 'Tripods', slug: 'tripods' },
  { label: 'Earpieces', slug: 'earpieces' },
  { label: 'AirPods', slug: 'airpods' },
  { label: 'Headphones', slug: 'headphones' },
  { label: 'Chargers', slug: 'chargers' },
  { label: 'Power Banks', slug: 'power-banks' },
  { label: 'Smartwatches', slug: 'smartwatches' },
  { label: 'Bluetooth Speakers', slug: 'bluetooth-speakers' },
  { label: 'Phone Accessories', slug: 'phone-accessories' },
  { label: 'Computer Accessories', slug: 'computer-accessories' },
  { label: 'ITEL PowerGo', slug: 'itel-powergo' },
  { label: 'Other Electronic Gadgets', slug: 'other-electronic-gadgets' },
];

export function Navbar() {
  const { totalQuantity, setDrawerOpen } = useCart();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileAccOpen, setMobileAccOpen] = useState(false);
  const [accOpen, setAccOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMobileOpen(false);
    setAccOpen(false);
    setSearchOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setAccOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 60);
    }
  }, [searchOpen]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || q.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      apiRequest<{ products: Product[] }>(
        `/api/products?search=${encodeURIComponent(q)}&limit=5`,
      )
        .then((data) => setSuggestions(data.products || []))
        .catch(() => setSuggestions([]));
    }, 180);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSearchOpen(false);
    navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Zone 1: Single-line Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            className="lg:hidden p-2 -ml-2 text-slate-700 hover:text-blue-700 rounded-lg"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <Link
            to="/"
            className="text-xl font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <span className="text-blue-700">Kora</span>
            <span>Tech</span>
          </Link>
        </div>

        {/* Zone 2: Clean Single-Line Navigation Links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden lg:flex items-center gap-5 text-[13px] font-medium text-slate-700"
        >
          <Link to="/" className="hover:text-blue-700 transition-colors whitespace-nowrap shrink-0">
            Home
          </Link>
          <Link
            to="/category/new-arrivals"
            className="hover:text-blue-700 transition-colors whitespace-nowrap shrink-0"
          >
            New Arrivals
          </Link>
          <Link
            to="/category/smartphones"
            className="hover:text-blue-700 transition-colors whitespace-nowrap shrink-0"
          >
            Phones
          </Link>
          <Link
            to="/category/laptops"
            className="hover:text-blue-700 transition-colors whitespace-nowrap shrink-0"
          >
            Laptops
          </Link>
          <Link
            to="/category/tablets"
            className="hover:text-blue-700 transition-colors whitespace-nowrap shrink-0"
          >
            Tablets
          </Link>

          {/* Accessories Dropdown */}
          <div className="relative shrink-0" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setAccOpen((v) => !v)}
              aria-expanded={accOpen}
              className="inline-flex items-center gap-1 hover:text-blue-700 transition-colors whitespace-nowrap shrink-0 py-2"
            >
              Accessories
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${accOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {accOpen && (
              <div className="absolute left-0 top-full mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-3 grid grid-cols-1 gap-0.5 z-50">
                <Link
                  to="/category/accessories"
                  className="px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-sky-50 rounded-lg border-b border-slate-100 mb-1"
                >
                  All Accessories & Gadgets
                </Link>
                <div className="grid grid-cols-2 gap-1">
                  {ACCESSORIES_LINKS.map((item) => (
                    <Link
                      key={item.slug}
                      to={`/category/${item.slug}`}
                      className="px-2.5 py-1.5 text-xs text-slate-700 hover:text-blue-700 hover:bg-sky-50/70 rounded-md truncate"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Link
            to="/category/deals"
            className="text-orange-600 hover:text-orange-700 font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            Deals & Offers
          </Link>
          <Link
            to="/about"
            className="hover:text-blue-700 transition-colors whitespace-nowrap shrink-0"
          >
            About Us
          </Link>
          <Link
            to="/contact"
            className="hover:text-blue-700 transition-colors whitespace-nowrap shrink-0"
          >
            Contact Us
          </Link>
        </nav>

        {/* Zone 3: Search, Account, Cart Icons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            aria-label="Search gadgets"
            className="w-10 h-10 inline-flex items-center justify-center text-slate-700 hover:text-blue-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Search className="w-[18px] h-[18px]" />
          </button>

          {(!user || isAdmin) && (
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Admin
            </Link>
          )}

          <Link
            to={user ? '/account' : '/login'}
            aria-label={user ? 'Customer account' : 'Sign in'}
            className="w-10 h-10 inline-flex items-center justify-center text-slate-700 hover:text-blue-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <User className="w-[18px] h-[18px]" />
          </Link>

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={`Shopping cart with ${totalQuantity} items`}
            className="relative inline-flex items-center gap-2 px-3 h-10 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <ShoppingBag className="w-4 h-4" />
            <span className="tabular-nums">{totalQuantity}</span>
          </button>
        </div>
      </div>

      {/* Expandable Live Search Bar + Suggestions */}
      {searchOpen && (
        <div className="border-t border-slate-200 bg-white px-4 sm:px-6 py-4 shadow-lg">
          <div className="max-w-3xl mx-auto">
            <form onSubmit={handleSearchSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search iPhone, MacBook, ITEL PowerGo, AirPods, Tripod..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg whitespace-nowrap"
              >
                Search
              </button>
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="px-3 py-2.5 text-sm text-slate-600 hover:text-slate-900"
              >
                Close
              </button>
            </form>

            {suggestions.length > 0 && (
              <div className="mt-3 divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {suggestions.map((p) => (
                  <Link
                    key={p.id}
                    to={`/product/${p.slug}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-sky-50/60 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={p.images[0]?.image_url || ''}
                        alt={p.name}
                        className="w-10 h-10 rounded object-cover bg-slate-100 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
                        <p className="text-xs text-slate-500">
                          {p.brand} · {p.category_name}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-slate-900 font-mono tabular-nums shrink-0">
                      {formatNaira(p.price_ngn)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile Navigation Drawer */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-slate-200 bg-white max-h-[80vh] overflow-y-auto px-4 py-4 space-y-1">
          <Link to="/" className="block px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 rounded-lg">
            Home
          </Link>
          <Link to="/category/new-arrivals" className="block px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 rounded-lg">
            New Arrivals
          </Link>
          <Link to="/category/smartphones" className="block px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 rounded-lg">
            Phones
          </Link>
          <Link to="/category/laptops" className="block px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 rounded-lg">
            Laptops
          </Link>
          <Link to="/category/tablets" className="block px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 rounded-lg">
            Tablets & iPads
          </Link>

          <div>
            <button
              type="button"
              onClick={() => setMobileAccOpen((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 rounded-lg"
            >
              <span>Accessories</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${mobileAccOpen ? 'rotate-180' : ''}`} />
            </button>
            {mobileAccOpen && (
              <div className="pl-4 pr-2 py-1 grid grid-cols-2 gap-1">
                <Link
                  to="/category/accessories"
                  className="col-span-2 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-sky-50 rounded-md"
                >
                  All Accessories
                </Link>
                {ACCESSORIES_LINKS.map((item) => (
                  <Link
                    key={item.slug}
                    to={`/category/${item.slug}`}
                    className="px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 rounded-md"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <Link to="/category/deals" className="block px-3 py-2.5 text-sm font-semibold text-orange-600 hover:bg-orange-50 rounded-lg">
            Deals & Offers
          </Link>
          <Link to="/track-order" className="block px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 rounded-lg">
            Track Order
          </Link>
          <Link to="/about" className="block px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 rounded-lg">
            About Us
          </Link>
          <Link to="/contact" className="block px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 rounded-lg">
            Contact Us
          </Link>

          <div className="pt-3 mt-2 border-t border-slate-100 flex flex-col gap-2">
            {(!user || isAdmin) && (
              <Link
                to="/admin"
                className="px-3 py-2.5 text-sm font-semibold text-blue-700 bg-sky-50 rounded-lg"
              >
                Admin Dashboard
              </Link>
            )}
            <Link
              to={user ? '/account' : '/login'}
              className="px-3 py-2.5 text-sm font-semibold text-white bg-blue-700 rounded-lg text-center"
            >
              {user ? `Account (${user.full_name.split(' ')[0]})` : 'Sign In / Create Account'}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
