import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Mail, MapPin, MessageCircle, Phone, ShieldCheck, Truck } from 'lucide-react';
import { DEFAULT_STORE_CONFIG } from '../config/storeConfig';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { ImageWithFallback } from '../components/ImageWithFallback';
import { sanitizeWhatsappNumber } from '../utils/format';

export function AboutPage() {
  useEffect(() => {
    document.title = 'About Us | KoraTech Electronics';
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-16">
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
        <div className="lg:col-span-6 flex flex-col justify-center space-y-4">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
            About KoraTech Electronics
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 leading-tight">
            Built to Make Authentic Technology Effortless Across Nigeria.
          </h1>
          <p className="text-base text-slate-600 leading-relaxed">
            KoraTech Electronics is a Nigerian retail electronics company headquartered in Lekki Phase 1, Lagos.
            We eliminate counterfeit anxiety by sourcing factory-sealed smartphones, pro laptops, tablets,
            audio hardware, and power solutions directly from verified distributors.
          </p>
        </div>
        <div className="lg:col-span-6 rounded-2xl overflow-hidden border border-slate-200 min-h-[280px]">
          <ImageWithFallback
            src="/src/assets/images/about_retail_showroom_1794811189520.jpg"
            alt="KoraTech Electronics Retail Showroom"
            className="w-full h-full object-cover"
          />
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="border border-slate-200 rounded-2xl p-6 space-y-2.5 bg-slate-50/60">
          <h2 className="text-lg font-bold text-slate-900">Our Story</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Founded by hardware engineers and retail specialists who grew tired of refurbished devices being sold as brand-new, KoraTech enforces strict serial-number verification on every device shipped.
          </p>
        </div>
        <div className="border border-slate-200 rounded-2xl p-6 space-y-2.5 bg-slate-50/60">
          <h2 className="text-lg font-bold text-slate-900">Our Mission</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Deliver genuine laptops, smartphones, and backup power gear to creators, developers, families, and enterprises across all 36 Nigerian states with transparent pricing and dependable after-sales support.
          </p>
        </div>
        <div className="border border-slate-200 rounded-2xl p-6 space-y-2.5 bg-slate-50/60">
          <h2 className="text-lg font-bold text-slate-900">Our Vision</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            To be West Africa’s benchmark electronics merchant—combining instant Paystack verification, live inventory transparency, and human WhatsApp concierge service.
          </p>
        </div>
      </section>

      <section className="border-t border-slate-200 pt-10 grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-3">
          <h2 className="text-2xl font-bold text-slate-900">Why Shop With Us</h2>
          <ul className="space-y-2.5 text-sm text-slate-700">
            <li className="flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
              <span>Official manufacturer warranty and serial verification on all flagship gadgets.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Truck className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
              <span>Same-day courier dispatch in Lagos and 1–4 day insured nationwide shipping.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-green-700 shrink-0 mt-0.5" />
              <span>Bank-grade Paystack payments with instant WhatsApp order confirmation.</span>
            </li>
          </ul>
        </div>
        <div className="bg-blue-700 text-white rounded-2xl p-8 flex flex-col justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold">Our Customer Commitment</h3>
            <p className="text-sm text-sky-100 mt-2 leading-relaxed">
              Every order is backed by our 7-day hardware inspection window and responsive Lagos support engineers. Need help choosing a laptop or power bank? Reach our team anytime.
            </p>
          </div>
          <Link
            to="/contact"
            className="inline-flex w-fit px-5 py-2.5 text-sm font-semibold text-blue-900 bg-white hover:bg-sky-50 rounded-lg"
          >
            Contact Support
          </Link>
        </div>
      </section>
    </div>
  );
}

export function ContactPage() {
  const { gatewayConfig } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    document.title = 'Contact Us | KoraTech Electronics';
  }, []);

  const whatsapp = sanitizeWhatsappNumber(
    gatewayConfig?.whatsappBusinessNumber || DEFAULT_STORE_CONFIG.whatsappNumber,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      const res = await apiRequest<{ message: string }>('/api/contact', {
        method: 'POST',
        body: JSON.stringify({ full_name: fullName, email, phone, subject, message }),
      });
      setSuccessMsg(res.message);
      setFullName('');
      setEmail('');
      setPhone('');
      setSubject('');
      setMessage('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to send message');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 lg:grid-cols-12 gap-10">
      <div className="lg:col-span-5 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Contact Us</h1>
          <p className="text-sm text-slate-600 mt-2">
            Speak with our Nigerian electronics specialists for corporate bulk orders, warranty enquiries, or delivery updates.
          </p>
        </div>

        <div className="space-y-4 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-2xl p-6">
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900">Showroom & Dispatch Hub</p>
              <p>{gatewayConfig?.storeAddress || DEFAULT_STORE_CONFIG.address}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Phone className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900">Phone Support</p>
              <p>{gatewayConfig?.storePhone || DEFAULT_STORE_CONFIG.phone}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900">Business Email</p>
              <p>{gatewayConfig?.storeEmail || DEFAULT_STORE_CONFIG.email}</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 pt-2 border-t border-slate-200">
            Hours: {DEFAULT_STORE_CONFIG.hours}
          </p>
        </div>

        <a
          href={`https://wa.me/${whatsapp}?text=${encodeURIComponent('Hello KoraTech Electronics, I would like to make an enquiry.')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-green-700 hover:bg-green-800 rounded-xl"
        >
          <MessageCircle className="w-4 h-4" />
          Chat Directly on WhatsApp
        </a>
      </div>

      <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Send a Message</h2>

        {successMsg && (
          <div className="mb-4 p-4 rounded-xl bg-green-50 border border-green-200 text-sm text-green-800">
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Subject *</label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Message *</label>
            <textarea
              rows={4}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
          >
            {submitting ? 'Sending...' : 'Send Message'}
          </button>
        </form>
      </div>
    </div>
  );
}

export function PolicyPage() {
  const { type = 'privacy' } = useParams();
  const policies: Record<string, { title: string; sections: Array<{ heading: string; body: string }> }> = {
    privacy: {
      title: 'Privacy Policy',
      sections: [
        {
          heading: 'Data Collection & Security',
          body: 'KoraTech Electronics collects only the contact, delivery, and order information required to fulfill your gadget purchase and provide warranty support. Passwords are encrypted and payment card details are handled exclusively by Paystack.',
        },
        {
          heading: 'Your Rights',
          body: 'You may update your profile, manage saved delivery addresses, or request deletion of your customer account at any time by contacting orders@koratech.ng.',
        },
      ],
    },
    terms: {
      title: 'Terms & Conditions',
      sections: [
        {
          heading: 'Pricing & Stock Availability',
          body: 'All prices are displayed in Nigerian Naira (₦). Orders are confirmed and stock is deducted only after backend verification of a successful Paystack transaction.',
        },
        {
          heading: 'Warranty Coverage',
          body: 'Brand-new devices include official manufacturer warranties alongside our 7-day hardware inspection guarantee against factory defects.',
        },
      ],
    },
    shipping: {
      title: 'Shipping & Delivery Policy',
      sections: [
        {
          heading: 'Lagos & South-West Dispatch',
          body: 'Verified orders placed before 2:00 PM WAT in Lagos qualify for same-day or next-business-day rider delivery (₦3,500; free on orders ₦500,000+).',
        },
        {
          heading: 'Nationwide Nigerian States',
          body: 'Deliveries to Abuja, Port Harcourt, Enugu, Kano, and all 36 states ship via insured express air/road courier within 1–4 business days.',
        },
      ],
    },
    returns: {
      title: 'Return & Refund Policy',
      sections: [
        {
          heading: '7-Day Inspection Window',
          body: 'Hardware items with verified manufacturing defects may be returned within 7 days of delivery in original packaging with all accessories and seals.',
        },
        {
          heading: 'Refund Processing',
          body: 'Approved refunds are processed back to your original Paystack payment channel or Nigerian bank account within 3–5 business days, and inventory is restored cleanly.',
        },
      ],
    },
  };

  const doc = policies[type] || policies.privacy;

  useEffect(() => {
    document.title = `${doc.title} | KoraTech Electronics`;
  }, [doc.title]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-6">
      <h1 className="text-3xl font-bold text-slate-900">{doc.title}</h1>
      <div className="space-y-6 border-t border-slate-200 pt-6">
        {doc.sections.map((s) => (
          <div key={s.heading} className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900">{s.heading}</h2>
            <p className="text-sm text-slate-600 leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="max-w-xl mx-auto px-4 py-24 text-center space-y-4">
      <p className="text-sm font-mono font-bold text-blue-700">404</p>
      <h1 className="text-3xl font-extrabold text-slate-900">Page Not Found</h1>
      <p className="text-sm text-slate-600">
        The page or gadget you are looking for could not be found.
      </p>
      <Link
        to="/"
        className="inline-flex px-6 py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
      >
        Return Home
      </Link>
    </div>
  );
}
