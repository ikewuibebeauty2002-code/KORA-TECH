import { Link } from 'react-router-dom';
import { MessageCircle, Mail, MapPin, Phone } from 'lucide-react';
import { DEFAULT_STORE_CONFIG } from '../config/storeConfig';
import { useAuth } from '../context/AuthContext';
import { sanitizeWhatsappNumber } from '../utils/format';

export function Footer() {
  const { gatewayConfig } = useAuth();
  const whatsapp = sanitizeWhatsappNumber(
    gatewayConfig?.whatsappBusinessNumber || DEFAULT_STORE_CONFIG.whatsappNumber,
  );
  const storeEmail = gatewayConfig?.storeEmail || DEFAULT_STORE_CONFIG.email;
  const storePhone = gatewayConfig?.storePhone || DEFAULT_STORE_CONFIG.phone;
  const storeAddress = gatewayConfig?.storeAddress || DEFAULT_STORE_CONFIG.address;

  return (
    <footer className="bg-slate-900 text-slate-300 border-t border-slate-800 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
        {/* Brand & Description */}
        <div className="space-y-4">
          <Link to="/" className="text-xl font-extrabold tracking-tight text-white inline-flex items-center gap-1">
            <span className="text-sky-400">Kora</span>
            <span>Tech</span>
          </Link>
          <p className="text-sm text-slate-400 leading-relaxed">
            Nigeria’s trusted retail destination for factory-sealed smartphones, pro laptops, tablets,
            audio gear, and power solutions with verified Paystack checkout and instant WhatsApp order support.
          </p>
          <a
            href={`https://wa.me/${whatsapp}?text=${encodeURIComponent('Hello KoraTech Electronics, I have a question about a gadget.')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-green-700 hover:bg-green-600 rounded-lg transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            Chat on WhatsApp
          </a>
        </div>

        {/* Quick Navigation */}
        <div>
          <h3 className="text-sm font-semibold text-white mb-4">Quick Links</h3>
          <ul className="space-y-2.5 text-sm">
            <li><Link to="/" className="hover:text-sky-400 transition-colors">Home</Link></li>
            <li><Link to="/category/new-arrivals" className="hover:text-sky-400 transition-colors">New Arrivals</Link></li>
            <li><Link to="/category/deals" className="hover:text-sky-400 transition-colors">Deals & Offers</Link></li>
            <li><Link to="/track-order" className="hover:text-sky-400 transition-colors">Track Your Order</Link></li>
            <li><Link to="/about" className="hover:text-sky-400 transition-colors">About Us</Link></li>
            <li><Link to="/contact" className="hover:text-sky-400 transition-colors">Contact Us</Link></li>
            <li><Link to="/account" className="hover:text-sky-400 transition-colors">Customer Account</Link></li>
            <li><Link to="/admin" className="hover:text-sky-400 transition-colors">Admin Dashboard</Link></li>
          </ul>
        </div>

        {/* Product Categories */}
        <div>
          <h3 className="text-sm font-semibold text-white mb-4">Shop Categories</h3>
          <ul className="space-y-2.5 text-sm">
            <li><Link to="/category/smartphones" className="hover:text-sky-400 transition-colors">Smartphones</Link></li>
            <li><Link to="/category/laptops" className="hover:text-sky-400 transition-colors">Laptops</Link></li>
            <li><Link to="/category/tablets" className="hover:text-sky-400 transition-colors">Tablets & iPads</Link></li>
            <li><Link to="/category/airpods" className="hover:text-sky-400 transition-colors">AirPods & Audio</Link></li>
            <li><Link to="/category/power-banks" className="hover:text-sky-400 transition-colors">Power Banks & ITEL PowerGo</Link></li>
            <li><Link to="/category/smartwatches" className="hover:text-sky-400 transition-colors">Smartwatches</Link></li>
            <li><Link to="/category/tripods" className="hover:text-sky-400 transition-colors">Tripods & Creator Gear</Link></li>
          </ul>
        </div>

        {/* Contact & Policies */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-white">Contact & Policies</h3>
          <ul className="space-y-2.5 text-sm text-slate-400">
            <li className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <span>{storeAddress}</span>
            </li>
            <li className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-sky-400 shrink-0" />
              <span>{storePhone}</span>
            </li>
            <li className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-sky-400 shrink-0" />
              <span>{storeEmail}</span>
            </li>
          </ul>

          <div className="pt-2 flex items-center gap-4 text-xs text-slate-400">
            <a href={DEFAULT_STORE_CONFIG.socials.instagram} target="_blank" rel="noopener noreferrer" className="hover:text-white">Instagram</a>
            <a href={DEFAULT_STORE_CONFIG.socials.x} target="_blank" rel="noopener noreferrer" className="hover:text-white">X (Twitter)</a>
            <a href={DEFAULT_STORE_CONFIG.socials.facebook} target="_blank" rel="noopener noreferrer" className="hover:text-white">Facebook</a>
          </div>
        </div>
      </div>

      {/* Policies & Copyright Row */}
      <div className="border-t border-slate-800 bg-slate-950/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <p>© {new Date().getFullYear()} KoraTech Electronics Nigeria. All rights reserved.</p>
          <div className="flex flex-wrap items-center justify-center gap-5">
            <Link to="/policy/privacy" className="hover:text-white">Privacy Policy</Link>
            <Link to="/policy/terms" className="hover:text-white">Terms & Conditions</Link>
            <Link to="/policy/shipping" className="hover:text-white">Shipping & Delivery Policy</Link>
            <Link to="/policy/returns" className="hover:text-white">Return & Refund Policy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
