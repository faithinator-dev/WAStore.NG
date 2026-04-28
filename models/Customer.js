const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * Customer — scoped to a single vendor (multi-tenant CRM).
 * One buyer can have separate Customer records across multiple vendor stores.
 * The compound index (vendor + phone) enforces uniqueness per-tenant.
 */
const customerSchema = new mongoose.Schema(
  {
    // ── Multi-Tenancy Link ────────────────────────────────────────────────────
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
      index: true,
    },

    // ── Identity ──────────────────────────────────────────────────────────────
    fullName: { type: String, trim: true, default: '' },
    email: { type: String, lowercase: true, trim: true, default: null },
    phone: {
      type: String,
      required: [true, 'Customer phone number is required'],
      trim: true,
    },
    passwordHash: { type: String, select: false },
    lastLoginAt: { type: Date, default: null },
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },

    // ── Address Book (last-used shown first for checkout convenience) ─────────
    addresses: [
      {
        label: { type: String, default: 'Home' }, // 'Home', 'Office', etc.
        addressLine1: String,
        addressLine2: String,
        city: String,
        state: String,
        isDefault: { type: Boolean, default: false },
        lastUsedAt: { type: Date, default: Date.now },
      },
    ],

    // ── Purchase History (denormalised for CRM speed) ─────────────────────────
    totalOrders: { type: Number, default: 0 },
    totalSpend: { type: Number, default: 0 },           // in NGN
    lastOrderAt: { type: Date, default: null },
    averageOrderValue: { type: Number, default: 0 },

    // ── CRM / Remarketing Tags ────────────────────────────────────────────────
    tags: [{ type: String, lowercase: true, trim: true }],  // e.g., ['vip', 'repeat-buyer']
    notes: { type: String, default: '' },                    // Vendor's private notes

    // ── Consent ───────────────────────────────────────────────────────────────
    marketingConsent: { type: Boolean, default: false },
    consentTimestamp: { type: Date, default: null },

    // ── Source Tracking ───────────────────────────────────────────────────────
    acquisitionChannel: {
      type: String,
      enum: ['whatsapp_checkout', 'online_payment', 'manual', 'instagram'],
      default: 'whatsapp_checkout',
    },
    firstOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Virtuals ──────────────────────────────────────────────────────────────────
customerSchema.virtual('whatsappLink').get(function () {
  if (!this.phone) return null;
  const cleaned = this.phone.replace(/\D/g, '');
  return `https://wa.me/${cleaned}`;
});

customerSchema.virtual('tier').get(function () {
  if (this.totalOrders >= 10 || this.totalSpend >= 100000) return 'vip';
  if (this.totalOrders >= 3) return 'returning';
  return 'new';
});

// ── Pre-save hooks ────────────────────────────────────────────────────────────
customerSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash') || !this.passwordHash) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  next();
});

// ── Instance Methods ──────────────────────────────────────────────────────────

/**
 * Called after every completed order to keep CRM stats fresh.
 */
customerSchema.methods.recordPurchase = async function (orderTotal) {
  this.totalOrders += 1;
  this.totalSpend += orderTotal;
  this.lastOrderAt = new Date();
  this.averageOrderValue = Math.round(this.totalSpend / this.totalOrders);
  await this.save();
};

customerSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// ── Indexes ───────────────────────────────────────────────────────────────────

// Core uniqueness: one customer record per phone number per vendor
customerSchema.index({ vendor: 1, phone: 1 }, { unique: true });
customerSchema.index({ vendor: 1, email: 1 }, { sparse: true });
customerSchema.index({ vendor: 1, totalSpend: -1 }); // for leaderboard / VIP queries
customerSchema.index({ vendor: 1, lastOrderAt: -1 }); // for recent-buyer campaigns

module.exports = mongoose.model('Customer', customerSchema);
