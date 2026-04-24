const mongoose = require('mongoose');

// ── Sub-schemas ───────────────────────────────────────────────────────────────

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },     // Snapshot at time of order
    price: { type: Number, required: true },    // Snapshot at time of order
    quantity: { type: Number, required: true, min: 1, default: 1 },
    selectedVariants: { type: Map, of: String, default: {} }, // e.g., { Size: 'M', Colour: 'Red' }
    imageUrl: { type: String, default: null },
  },
  { _id: false }
);

const deliveryAddressSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    addressLine1: { type: String, required: true },
    addressLine2: { type: String, default: '' },
    city: { type: String, required: true },
    state: { type: String, required: true },
    additionalNotes: { type: String, default: '' },
  },
  { _id: false }
);

const paymentInfoSchema = new mongoose.Schema(
  {
    method: { type: String, enum: ['paystack', 'whatsapp', 'bank_transfer', 'cash'], default: 'whatsapp' },
    status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
    reference: { type: String, default: null },   // Paystack/Flutterwave transaction reference
    paidAt: { type: Date, default: null },
    amount: { type: Number, default: 0 },          // Amount actually confirmed paid
  },
  { _id: false }
);

// ── Main Order Schema ─────────────────────────────────────────────────────────

const orderSchema = new mongoose.Schema(
  {
    // ── Multi-Tenancy Link ──────────────────────────────────────────────────
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
      index: true,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,   // Will be set after customer record is upserted
    },

    // ── Human-readable Order Number ─────────────────────────────────────────
    orderNumber: {
      type: String,
      unique: true,
      // Generated in pre-save: WA-20240901-XXXX
    },

    // ── Items ───────────────────────────────────────────────────────────────
    items: { type: [orderItemSchema], required: true },

    // ── Totals ──────────────────────────────────────────────────────────────
    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true },

    // ── Delivery ────────────────────────────────────────────────────────────
    deliveryAddress: { type: deliveryAddressSchema, required: true },

    // ── Checkout Method (Hybrid Engine) ─────────────────────────────────────
    checkoutMethod: {
      type: String,
      enum: ['online_payment', 'whatsapp'],
      required: true,
    },

    // ── Payment ─────────────────────────────────────────────────────────────
    payment: { type: paymentInfoSchema, default: () => ({}) },

    // ── Fulfilment Status ────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
      default: 'pending',
      index: true,
    },

    statusHistory: [
      {
        status: String,
        note: String,
        changedAt: { type: Date, default: Date.now },
      },
    ],

    // ── WhatsApp Specific ────────────────────────────────────────────────────
    whatsappMessageSent: { type: Boolean, default: false },
    whatsappRedirectUrl: { type: String, default: null },

    // ── Internal Notes ───────────────────────────────────────────────────────
    vendorNote: { type: String, default: '' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Pre-save: generate orderNumber ────────────────────────────────────────────
orderSchema.pre('save', async function (next) {
  if (!this.orderNumber) {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await mongoose.model('Order').countDocuments({ vendor: this.vendor });
    const seq = String(count + 1).padStart(4, '0');
    this.orderNumber = `WA-${datePart}-${seq}`;
  }

  // Track status changes
  if (this.isModified('status')) {
    this.statusHistory.push({ status: this.status });
  }

  next();
});

// ── Virtuals ──────────────────────────────────────────────────────────────────
orderSchema.virtual('itemCount').get(function () {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

// ── Indexes ───────────────────────────────────────────────────────────────────
orderSchema.index({ vendor: 1, status: 1, createdAt: -1 });
orderSchema.index({ vendor: 1, customer: 1 });
orderSchema.index({ 'payment.reference': 1 });

module.exports = mongoose.model('Order', orderSchema);