export const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT Abuja', 'Gombe',
  'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos',
  'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto',
  'Taraba', 'Yobe', 'Zamfara',
] as const;

export const DEFAULT_STORE_CONFIG = {
  brandName: 'KoraTech Electronics',
  shortBrand: 'KoraTech',
  tagline: 'Genuine Gadgets, Verified Warranty, Nationwide Delivery.',
  email: 'orders@koratech.ng',
  phone: '+234 800 567 2832',
  whatsappNumber:
    ((import.meta as unknown as { env?: Record<string, string> }).env
      ?.VITE_WHATSAPP_BUSINESS_NUMBER) || '2348005672832',
  address: '14 Admiralty Way, Lekki Phase 1, Lagos, Nigeria',
  hours: 'Mon – Sat: 8:30 AM – 7:00 PM WAT',
  socials: {
    instagram: 'https://instagram.com/koratechng',
    x: 'https://x.com/koratechng',
    facebook: 'https://facebook.com/koratechng',
    youtube: 'https://youtube.com/@koratechng',
  },
};

export function calculateDeliveryFeeNgn(state: string, subtotalNgn: number): number {
  if (subtotalNgn >= 500000) return 0; // Free express shipping on orders ₦500,000+
  const normalized = state.trim().toLowerCase();
  if (normalized === 'lagos') return 3500;
  if (['ogun', 'oyo', 'osun', 'ondo', 'ekiti', 'kwara'].includes(normalized)) return 5500;
  if (['fct abuja', 'abuja', 'rivers', 'edo', 'delta', 'enugu', 'anambra', 'imo'].includes(normalized)) return 6500;
  return 8000;
}
