import { useState } from 'react';
import { Plus, Trash2, Upload, X } from 'lucide-react';
import type { Category, Product } from '../../types/ecommerce';
import { apiRequest } from '../../lib/api';

interface VariantDraft {
  id?: string;
  name: string;
  sku_suffix: string;
  price_ngn: number;
  original_price_ngn: string;
  stock_quantity: number;
}

interface AdminProductModalProps {
  product: Product | null;
  categories: Category[];
  inline?: boolean;
  onClose: () => void;
  onSaved: (savedProduct?: Product) => void;
}

export function AdminProductModal({
  product,
  categories,
  inline = false,
  onClose,
  onSaved,
}: AdminProductModalProps) {
  const mainCats = categories.filter((c) => !c.parent_id);
  const subCats = categories.filter((c) => c.parent_id);

  const [name, setName] = useState(product?.name || '');
  const [sku, setSku] = useState(product?.sku || '');
  const [brand, setBrand] = useState(product?.brand || '');
  const [categoryId, setCategoryId] = useState(product?.category_id || mainCats[0]?.id || '');
  const [subcategoryId, setSubcategoryId] = useState(product?.subcategory_id || '');
  const [priceNgn, setPriceNgn] = useState(String(product?.price_ngn ?? ''));
  const [originalPriceNgn, setOriginalPriceNgn] = useState(
    product?.original_price_ngn ? String(product.original_price_ngn) : '',
  );
  const [stockQty, setStockQty] = useState(String(product?.stock_quantity ?? 10));
  const [lowStockThreshold, setLowStockThreshold] = useState(
    String(product?.low_stock_threshold ?? 5),
  );
  const [shortDesc, setShortDesc] = useState(product?.short_description || '');
  const [description, setDescription] = useState(product?.description || '');
  const [colorsText, setColorsText] = useState((product?.colors || []).join(', '));
  const [featuresText, setFeaturesText] = useState((product?.features || []).join(', '));
  const [images, setImages] = useState<string[]>(
    product?.images.map((i) => i.image_url) || [],
  );
  const [specs, setSpecs] = useState<Array<{ key: string; value: string }>>(
    product
      ? Object.entries(product.specifications || {}).map(([key, value]) => ({ key, value }))
      : [{ key: 'Warranty', value: '12 Months Official Warranty' }],
  );
  const [variants, setVariants] = useState<VariantDraft[]>(
    product?.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku_suffix: v.sku_suffix,
      price_ngn: v.price_ngn,
      original_price_ngn: v.original_price_ngn ? String(v.original_price_ngn) : '',
      stock_quantity: v.stock_quantity,
    })) || [],
  );

  const [isFeatured, setIsFeatured] = useState(Boolean(product?.is_featured));
  const [isBestSeller, setIsBestSeller] = useState(Boolean(product?.is_best_seller));
  const [isTrending, setIsTrending] = useState(Boolean(product?.is_trending));
  const [isNewArrival, setIsNewArrival] = useState(product ? product.is_new_arrival : true);
  const [isRecommended, setIsRecommended] = useState(Boolean(product?.is_recommended));
  const [isPublished, setIsPublished] = useState(product ? product.is_published : true);

  const [uploading, setUploading] = useState(false);
  const [imageUrlDraft, setImageUrlDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('bucket', 'product-images');
      Array.from(files).forEach((f) => formData.append('images', f));
      const res = await apiRequest<{ urls: string[] }>('/api/admin/upload', {
        method: 'POST',
        body: formData,
      });
      setImages((prev) => [...prev, ...(res.urls || [])]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const specObj: Record<string, string> = {};
      specs.forEach((s) => {
        if (s.key.trim() && s.value.trim()) specObj[s.key.trim()] = s.value.trim();
      });

      const payload = {
        name,
        sku: sku || undefined,
        brand,
        category_id: categoryId,
        subcategory_id: subcategoryId || null,
        price_ngn: Number(priceNgn),
        original_price_ngn: originalPriceNgn ? Number(originalPriceNgn) : null,
        stock_quantity: Number(stockQty) || 0,
        low_stock_threshold: Number(lowStockThreshold) || 5,
        short_description: shortDesc,
        description,
        colors: colorsText
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
        features: featuresText
          .split(',')
          .map((f) => f.trim())
          .filter(Boolean),
        images:
          images.length > 0
            ? images
            : ['/src/assets/images/promo_deals_bundle_1794811188657.jpg'],
        specifications: specObj,
        variants: variants.map((v) => ({
          ...v,
          price_ngn: Number(v.price_ngn),
          original_price_ngn: v.original_price_ngn ? Number(v.original_price_ngn) : null,
          stock_quantity: Number(v.stock_quantity) || 0,
        })),
        is_featured: isFeatured,
        is_best_seller: isBestSeller,
        is_trending: isTrending,
        is_new_arrival: isNewArrival,
        is_recommended: isRecommended,
        is_published: isPublished,
      };

      let savedRes: { product?: Product } = {};
      if (product) {
        savedRes = await apiRequest<{ product?: Product }>(`/api/admin/products/${product.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        savedRes = await apiRequest<{ product?: Product }>('/api/admin/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      if (inline && !product) {
        setName('');
        setSku('');
        setBrand('');
        setPriceNgn('');
        setOriginalPriceNgn('');
        setShortDesc('');
        setDescription('');
        setImages([]);
        setVariants([]);
      }
      onSaved(savedRes.product);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  const selectedMainCat = mainCats.find((c) => c.id === categoryId);
  const selectedSubCat = subCats.find((c) => c.id === subcategoryId);
  const isDeal = Boolean(originalPriceNgn && Number(originalPriceNgn) > Number(priceNgn || 0));

  const targetPages: string[] = [];
  if (isPublished) {
    targetPages.push('All Products (/category/all)');
    if (selectedMainCat) targetPages.push(`${selectedMainCat.name} (/category/${selectedMainCat.slug})`);
    if (selectedSubCat) targetPages.push(`${selectedSubCat.name} (/category/${selectedSubCat.slug})`);
    if (isNewArrival) targetPages.push('New Arrivals (/category/new-arrivals)');
    if (isDeal) targetPages.push('Deals & Offers (/category/deals)');
    if (isFeatured || isBestSeller || isTrending || isRecommended) targetPages.push('Homepage Showcase');
  }

  const wrapperClass = inline
    ? 'bg-white border border-slate-200 rounded-xl p-6 space-y-5'
    : 'bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto p-6 space-y-5 shadow-2xl';

  const content = (
    <div className={wrapperClass}>
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {product ? `Edit Product: ${product.name}` : 'Upload New Product / Item'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Choose the category and page sections below to publish directly onto your website pages.
            </p>
          </div>
          {!inline && (
            <button type="button" onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-900">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Product Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Brand *</label>
                <input
                  type="text"
                  required
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">SKU</label>
                <input
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="Auto"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Primary Website Page (Category) *
              </label>
              <select
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {mainCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (/category/{c.slug})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Subcategory Page (Optional)
              </label>
              <select
                value={subcategoryId}
                onChange={(e) => setSubcategoryId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="">None</option>
                {subCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (/category/{c.slug})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Selling Price (₦) *</label>
              <input
                type="number"
                required
                min={0}
                value={priceNgn}
                onChange={(e) => setPriceNgn(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Original Price (₦)</label>
              <input
                type="number"
                min={0}
                value={originalPriceNgn}
                onChange={(e) => setOriginalPriceNgn(e.target.value)}
                placeholder="Optional"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Stock Qty *</label>
              <input
                type="number"
                min={0}
                value={stockQty}
                onChange={(e) => setStockQty(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Low Stock Alert</label>
              <input
                type="number"
                min={1}
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Short Summary</label>
            <input
              type="text"
              value={shortDesc}
              onChange={(e) => setShortDesc(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Full Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Colours (comma-separated)</label>
              <input
                type="text"
                value={colorsText}
                onChange={(e) => setColorsText(e.target.value)}
                placeholder="Space Black, Titanium Silver"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Features (comma-separated)</label>
              <input
                type="text"
                value={featuresText}
                onChange={(e) => setFeaturesText(e.target.value)}
                placeholder="5G Ready, Fast Charging"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {/* Multi-image Upload & Direct Image URL */}
          <div className="space-y-2.5">
            <label className="block text-xs font-semibold text-slate-700">
              Product Images (Upload from device or paste image URL)
            </label>
            <div className="flex flex-wrap items-center gap-3">
              {images.map((url, idx) => (
                <div key={`${url}-${idx}`} className="relative w-20 h-20 rounded-lg border border-slate-200 overflow-hidden">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                    className="absolute top-1 right-1 bg-slate-900/75 text-white rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <label className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-300 hover:border-blue-600 flex flex-col items-center justify-center text-xs text-slate-500 cursor-pointer">
                <Upload className="w-4 h-4 mb-1" />
                <span>{uploading ? '...' : 'Upload'}</span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <input
                type="url"
                value={imageUrlDraft}
                onChange={(e) => setImageUrlDraft(e.target.value)}
                placeholder="Or paste image URL (https://...)"
                className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
              <button
                type="button"
                onClick={() => {
                  const clean = imageUrlDraft.trim();
                  if (!clean) return;
                  setImages((prev) => [...prev, clean]);
                  setImageUrlDraft('');
                }}
                className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-sky-50 hover:bg-sky-100 border border-blue-200 rounded-lg whitespace-nowrap"
              >
                + Add Image URL
              </button>
            </div>
          </div>

          {/* Variations Builder */}
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">Product Variations (Optional)</label>
              <button
                type="button"
                onClick={() =>
                  setVariants((prev) => [
                    ...prev,
                    {
                      name: '',
                      sku_suffix: String(prev.length + 1),
                      price_ngn: Number(priceNgn) || 0,
                      original_price_ngn: '',
                      stock_quantity: 5,
                    },
                  ])
                }
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700"
              >
                <Plus className="w-3.5 h-3.5" /> Add Variation
              </button>
            </div>
            {variants.map((v, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <input
                  type="text"
                  placeholder="e.g. 256GB"
                  value={v.name}
                  onChange={(e) => {
                    const next = [...variants];
                    next[idx].name = e.target.value;
                    setVariants(next);
                  }}
                  className="col-span-4 px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                />
                <input
                  type="number"
                  placeholder="Price ₦"
                  value={v.price_ngn}
                  onChange={(e) => {
                    const next = [...variants];
                    next[idx].price_ngn = Number(e.target.value);
                    setVariants(next);
                  }}
                  className="col-span-3 px-2.5 py-1.5 text-xs border border-slate-300 rounded font-mono"
                />
                <input
                  type="number"
                  placeholder="Stock"
                  value={v.stock_quantity}
                  onChange={(e) => {
                    const next = [...variants];
                    next[idx].stock_quantity = Number(e.target.value);
                    setVariants(next);
                  }}
                  className="col-span-3 px-2.5 py-1.5 text-xs border border-slate-300 rounded font-mono"
                />
                <button
                  type="button"
                  onClick={() => setVariants((prev) => prev.filter((_, i) => i !== idx))}
                  className="col-span-2 text-red-600 flex justify-center"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Specifications Builder */}
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">Specifications</label>
              <button
                type="button"
                onClick={() => setSpecs((prev) => [...prev, { key: '', value: '' }])}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700"
              >
                <Plus className="w-3.5 h-3.5" /> Add Spec
              </button>
            </div>
            {specs.map((s, idx) => (
              <div key={idx} className="grid grid-cols-11 gap-2 items-center">
                <input
                  type="text"
                  placeholder="Spec (e.g. Display)"
                  value={s.key}
                  onChange={(e) => {
                    const next = [...specs];
                    next[idx].key = e.target.value;
                    setSpecs(next);
                  }}
                  className="col-span-4 px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                />
                <input
                  type="text"
                  placeholder="Value"
                  value={s.value}
                  onChange={(e) => {
                    const next = [...specs];
                    next[idx].value = e.target.value;
                    setSpecs(next);
                  }}
                  className="col-span-6 px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                />
                <button
                  type="button"
                  onClick={() => setSpecs((prev) => prev.filter((_, i) => i !== idx))}
                  className="col-span-1 text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Website Page Placement & Merchandising Toggles */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Select Website Pages & Sections Where This Item Should Appear
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              {[
                { label: 'Published (Live on Website & Search)', val: isPublished, set: setIsPublished },
                { label: 'New Arrivals Page (/category/new-arrivals)', val: isNewArrival, set: setIsNewArrival },
                { label: 'Homepage — Featured Gadgets', val: isFeatured, set: setIsFeatured },
                { label: 'Homepage — Best Sellers', val: isBestSeller, set: setIsBestSeller },
                { label: 'Homepage — Trending Now', val: isTrending, set: setIsTrending },
                { label: 'Homepage — Recommended For You', val: isRecommended, set: setIsRecommended },
              ].map((toggle) => (
                <label key={toggle.label} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={toggle.val}
                    onChange={(e) => toggle.set(e.target.checked)}
                    className="w-4 h-4 text-blue-700 rounded"
                  />
                  <span>{toggle.label}</span>
                </label>
              ))}
            </div>
            <div className="p-3 rounded-lg bg-sky-50/70 border border-blue-100 text-[11px] text-slate-700">
              <strong className="text-blue-800">Website Placement Preview:</strong>{' '}
              {isPublished
                ? targetPages.join(' · ')
                : 'Saved as Draft (hidden from storefront until Published is checked)'}
              {!isDeal && ' · Tip: Set Original Price higher than Selling Price to also display on Deals & Offers (/category/deals).'}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            {!inline && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
            >
              {saving ? 'Uploading & Publishing...' : product ? 'Save Changes' : 'Upload & Publish Item'}
            </button>
          </div>
        </form>
      </div>
  );

  if (inline) return content;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
      {content}
    </div>
  );
}
