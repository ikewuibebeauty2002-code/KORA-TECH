import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { useAuth } from './AuthContext';
import type { CartItem, Coupon, Product } from '../types/ecommerce';

interface ToastMessage {
  id: string;
  text: string;
  type: 'success' | 'error' | 'info';
}

interface CartContextValue {
  items: CartItem[];
  totalQuantity: number;
  subtotalNgn: number;
  isDrawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  appliedCoupon: Coupon | null;
  discountNgn: number;
  applyCoupon: (code: string) => Promise<void>;
  clearCoupon: () => void;
  refreshCart: () => Promise<void>;
  addToCart: (payload: {
    productId: string;
    variantId?: string | null;
    selectedColor?: string;
    quantity?: number;
    openDrawer?: boolean;
  }) => Promise<void>;
  updateItemQuantity: (itemId: string, quantity: number) => Promise<void>;
  updateItemVariant: (itemId: string, variantId: string | null, selectedColor?: string) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  wishlistIds: string[];
  toggleWishlist: (productId: string) => Promise<void>;
  recentlyViewed: Product[];
  recordViewedProduct: (product: Product) => void;
  toasts: ToastMessage[];
  notify: (text: string, type?: 'success' | 'error' | 'info') => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const RECENT_KEY = 'koratech_recently_viewed';

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [discountNgn, setDiscountNgn] = useState(0);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<Product[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      return raw ? (JSON.parse(raw) as Product[]) : [];
    } catch {
      return [];
    }
  });

  const notify = useCallback((text: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const refreshCart = useCallback(async () => {
    try {
      const data = await apiRequest<{ items: CartItem[] }>('/api/cart');
      setItems(data.items || []);
    } catch {
      // Ignore transient errors
    }
  }, []);

  const refreshWishlist = useCallback(async () => {
    if (!user) {
      setWishlistIds([]);
      return;
    }
    try {
      const data = await apiRequest<{ productIds: string[] }>('/api/wishlist');
      setWishlistIds(data.productIds || []);
    } catch {
      setWishlistIds([]);
    }
  }, [user]);

  useEffect(() => {
    refreshCart();
    refreshWishlist();
  }, [refreshCart, refreshWishlist, user?.id]);

  const subtotalNgn = items.reduce((sum, item) => {
    const unit = item.variant ? item.variant.price_ngn : item.product.price_ngn;
    return sum + unit * item.quantity;
  }, 0);

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  // Re-evaluate coupon discount when subtotal changes
  useEffect(() => {
    if (!appliedCoupon || subtotalNgn <= 0) {
      if (subtotalNgn <= 0) {
        setDiscountNgn(0);
      }
      return;
    }
    if (subtotalNgn < appliedCoupon.min_order_ngn) {
      setDiscountNgn(0);
      return;
    }
    let d =
      appliedCoupon.discount_type === 'percentage'
        ? (subtotalNgn * appliedCoupon.discount_value) / 100
        : appliedCoupon.discount_value;
    if (appliedCoupon.max_discount_ngn) {
      d = Math.min(d, appliedCoupon.max_discount_ngn);
    }
    setDiscountNgn(Math.round(Math.min(d, subtotalNgn)));
  }, [appliedCoupon, subtotalNgn]);

  const addToCart = async ({
    productId,
    variantId = null,
    selectedColor = '',
    quantity = 1,
    openDrawer = true,
  }: {
    productId: string;
    variantId?: string | null;
    selectedColor?: string;
    quantity?: number;
    openDrawer?: boolean;
  }) => {
    try {
      const data = await apiRequest<{ items: CartItem[] }>('/api/cart/items', {
        method: 'POST',
        body: JSON.stringify({ productId, variantId, selectedColor, quantity }),
      });
      setItems(data.items);
      notify('Added to your shopping cart', 'success');
      if (openDrawer) setDrawerOpen(true);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to add item', 'error');
      throw err;
    }
  };

  const updateItemQuantity = async (itemId: string, quantity: number) => {
    try {
      const data = await apiRequest<{ items: CartItem[] }>(`/api/cart/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity }),
      });
      setItems(data.items);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update quantity', 'error');
    }
  };

  const updateItemVariant = async (
    itemId: string,
    variantId: string | null,
    selectedColor?: string,
  ) => {
    try {
      const data = await apiRequest<{ items: CartItem[] }>(`/api/cart/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ variantId, selectedColor }),
      });
      setItems(data.items);
      notify('Updated item option', 'info');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update variant', 'error');
    }
  };

  const removeItem = async (itemId: string) => {
    try {
      const data = await apiRequest<{ items: CartItem[] }>(`/api/cart/items/${itemId}`, {
        method: 'DELETE',
      });
      setItems(data.items);
      notify('Item removed from cart', 'info');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not remove item', 'error');
    }
  };

  const applyCoupon = async (code: string) => {
    const data = await apiRequest<{ coupon: Coupon; discount_ngn: number }>(
      '/api/coupons/validate',
      {
        method: 'POST',
        body: JSON.stringify({ code, subtotal: subtotalNgn }),
      },
    );
    setAppliedCoupon(data.coupon);
    setDiscountNgn(data.discount_ngn);
    notify(`Coupon ${data.coupon.code} applied!`, 'success');
  };

  const clearCoupon = () => {
    setAppliedCoupon(null);
    setDiscountNgn(0);
  };

  const toggleWishlist = async (productId: string) => {
    if (!user) {
      notify('Sign in to save items to your wishlist', 'info');
      return;
    }
    try {
      const data = await apiRequest<{ wishlisted: boolean }>('/api/wishlist/toggle', {
        method: 'POST',
        body: JSON.stringify({ productId }),
      });
      setWishlistIds((prev) =>
        data.wishlisted ? [...prev, productId] : prev.filter((id) => id !== productId),
      );
      notify(data.wishlisted ? 'Saved to wishlist' : 'Removed from wishlist', 'info');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Wishlist update failed', 'error');
    }
  };

  const recordViewedProduct = useCallback((product: Product) => {
    setRecentlyViewed((prev) => {
      const next = [product, ...prev.filter((p) => p.id !== product.id)].slice(0, 6);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage error
      }
      return next;
    });
  }, []);

  return (
    <CartContext.Provider
      value={{
        items,
        totalQuantity,
        subtotalNgn,
        isDrawerOpen,
        setDrawerOpen,
        appliedCoupon,
        discountNgn,
        applyCoupon,
        clearCoupon,
        refreshCart,
        addToCart,
        updateItemQuantity,
        updateItemVariant,
        removeItem,
        wishlistIds,
        toggleWishlist,
        recentlyViewed,
        recordViewedProduct,
        toasts,
        notify,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
