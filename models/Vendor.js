const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const vendorSchema = new mongoose.Schema(
  {
    // --- Identity ---
    businessName: {
      type: String,
      required: [true, 'Business name is required'],
      trim: true,
      maxlength: [80, 'Business name cannot exceed 80 characters'],
    },
    slug: {
      // wastore.com/store/:slug  (unique, URL-safe identifier)
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'],
    },
    ownerName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'WhatsApp phone number is required'],
      trim: true,
    },
    passwordHash: { type: String, required: true, select: false },

    // --- Storefront Appearance ---
    storefront: {
      logoUrl: { type: String, default: null },
      bannerUrl: { type: String, default: null },
      tagline: { type: String, maxlength: 160, default: '' },
      themeColor: { type: String, default: '#0052FF' }, // Kuda-style brand colour
      category: {
        type: String,
        enum: [
          'Fashion & Apparel',
          'Beauty & Skincare',
          'Food & Beverages',
          'Groceries & Supermarket',
          'Electronics & Gadgets',
          'Computers & Accessories',
          'Home & Living',
          'Health & Wellness',
          'Automobiles & Parts',
          'Baby & Kids',
          'Arts & Crafts',
          'Books & Stationery',
          'Services & Digital',
          'Real Estate',
          'Jewelry & Accessories',
          'Sports & Outdoors',
          'Other',
        ],
        default: 'Other',
      },
      socialLinks: {
        instagram: { type: String, default: '' },
        twitter: { type: String, default: '' },
      },
    },

    // --- Trust & Verification ---
    isVerified: { type: Boolean, default: false },      // Admin-granted 'Verified Vendor' badge
    verifiedAt: { type: Date, default: null },
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
    },

    // --- SaaS Plan / Billing ---
    role: {
      type: String,
      enum: ['vendor', 'admin'],
      default: 'vendor',
    },
    plan: {
      type: String,
      enum: ['free', 'starter', 'growth', 'pro'],
      default: 'free',
    },
    planExpiresAt: { type: Date, default: null },

    // --- Account Status ---
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },

    // --- Payment Credentials (encrypted / server-side only) ---
    paystackSubAccountCode: { type: String, default: null, select: false },
  },
  {
    timestamps: true, // createdAt, updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Virtuals ──────────────────────────────────────────────────────────────────
vendorSchema.virtual('storeUrl').get(function () {
  return `/store/${this.slug}`;
});

vendorSchema.virtual('whatsappLink').get(function () {
  const cleaned = this.phone.replace(/\D/g, '');
  return `https://wa.me/${cleaned}`;
});

// ── Pre-save hooks ────────────────────────────────────────────────────────────
vendorSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  next();
});

// ── Instance Methods ──────────────────────────────────────────────────────────
vendorSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

vendorSchema.methods.isOnActivePlan = function () {
  if (this.plan === 'free') return true;
  return this.planExpiresAt && this.planExpiresAt > new Date();
};

// ── Indexes ───────────────────────────────────────────────────────────────────
vendorSchema.index({ isActive: 1, isVerified: 1 });

module.exports = mongoose.model('Vendor', vendorSchema);