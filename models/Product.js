const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    // ── Multi-Tenancy Link ────────────────────────────────────────────────────
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
      index: true,
    },

    // ── Core Details ──────────────────────────────────────────────────────────
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [120, 'Product name cannot exceed 120 characters'],
    },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
    },
    compareAtPrice: {
      // Crossed-out "was" price for sale items
      type: Number,
      default: null,
    },
    currency: { type: String, default: 'NGN' },

    // ── Media ─────────────────────────────────────────────────────────────────
    images: [
      {
        url: { type: String, required: true },
        altText: { type: String, default: '' },
        isPrimary: { type: Boolean, default: false },
      },
    ],

    // ── Categorisation ────────────────────────────────────────────────────────
    category: { type: String, trim: true, default: 'Uncategorised' },
    tags: [{ type: String, lowercase: true, trim: true }],

    // ── Variants (e.g., sizes, colours) ──────────────────────────────────────
    variants: [
      {
        label: { type: String, required: true }, // e.g., "Size" or "Colour"
        options: [{ type: String }],             // e.g., ["S", "M", "L"]
      },
    ],

    // ── Inventory ─────────────────────────────────────────────────────────────
    stockStatus: {
      type: String,
      enum: ['in_stock', 'sold_out', 'pre_order'],
      default: 'in_stock',
    },
    quantity: { type: Number, default: null }, // null = unlimited / untracked
    trackQuantity: { type: Boolean, default: false },

    // ── Visibility & Ordering ─────────────────────────────────────────────────
    isPublished: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 }, // lower = higher on storefront

    // ── Analytics ─────────────────────────────────────────────────────────────
    views: { type: Number, default: 0 },
    orderCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Virtuals ──────────────────────────────────────────────────────────────────
productSchema.virtual('primaryImage').get(function () {
  const primary = this.images.find((img) => img.isPrimary);
  return primary ? primary.url : (this.images[0]?.url ?? '/img/placeholder.png');
});

productSchema.virtual('isOnSale').get(function () {
  return this.compareAtPrice && this.compareAtPrice > this.price;
});

productSchema.virtual('discountPercent').get(function () {
  if (!this.isOnSale) return 0;
  return Math.round(((this.compareAtPrice - this.price) / this.compareAtPrice) * 100);
});

// ── Middleware: auto-decrement quantity on order ───────────────────────────────
productSchema.methods.decrementStock = async function (qty = 1) {
  if (!this.trackQuantity) return;
  this.quantity = Math.max(0, (this.quantity ?? 0) - qty);
  if (this.quantity === 0) this.stockStatus = 'sold_out';
  await this.save();
};

// ── Indexes ───────────────────────────────────────────────────────────────────
productSchema.index({ vendor: 1, isPublished: 1, displayOrder: 1 });
productSchema.index({ vendor: 1, stockStatus: 1 });
productSchema.index({ tags: 1 });

module.exports = mongoose.model('Product', productSchema);