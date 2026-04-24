/**
 * routes/store.js
 * Public-facing dynamic storefront — wastore.com/store/:vendorSlug
 * NO authentication required. Buyer-facing routes.
 */

const express = require('express');
const router = express.Router();
const Vendor = require('../models/Vendor');
const Product = require('../models/Product');

// Helper function to escape regex special characters
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Middleware: resolve vendor from slug ──────────────────────────────────────
// Attached to all /store/:vendorSlug/* routes
async function resolveStore(req, res, next) {
  try {
    const vendor = await Vendor.findOne({
      slug: req.params.vendorSlug,
      isActive: true,
    }).lean();

    if (!vendor) {
      return res.status(404).render('errors/store-not-found', {
        title: 'Store Not Found',
        slug: req.params.vendorSlug,
      });
    }

    res.locals.store = vendor; // Available in all EJS views as `store`
    req.store = vendor;
    next();
  } catch (err) {
    next(err);
  }
}

// ── GET /store/:vendorSlug ────────────────────────────────────────────────────
// Main storefront catalog
router.get('/:vendorSlug', resolveStore, async (req, res, next) => {
  try {
    const { category, search, sort = 'displayOrder' } = req.query;

    const filter = {
      vendor: req.store._id,
      isPublished: true,
    };

    if (category) filter.category = category;
    if (search) {
      const escapedSearch = escapeRegex(search.trim());
      filter.name = { $regex: escapedSearch, $options: 'i' };
    }

    const sortMap = {
      displayOrder: { displayOrder: 1 },
      newest: { createdAt: -1 },
      price_asc: { price: 1 },
      price_desc: { price: -1 },
      popular: { orderCount: -1 },
    };
    const sortQuery = sortMap[sort] || sortMap.displayOrder;

    const [products, categories] = await Promise.all([
      Product.find(filter).sort(sortQuery).lean(),
      Product.distinct('category', { vendor: req.store._id, isPublished: true }),
    ]);

    res.render('store/catalog', {
      title: `${req.store.businessName} — WaStore`,
      products,
      categories,
      selectedCategory: category || null,
      search: search || '',
      sort,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /store/:vendorSlug/product/:productId ─────────────────────────────────
// Product detail page
router.get('/:vendorSlug/product/:productId', resolveStore, async (req, res, next) => {
  try {
    const product = await Product.findOne({
      _id: req.params.productId,
      vendor: req.store._id,
      isPublished: true,
    }).lean();

    if (!product) {
      return res.status(404).render('errors/404', { title: 'Product Not Found' });
    }

    // Increment view counter (fire-and-forget)
    Product.findByIdAndUpdate(product._id, { $inc: { views: 1 } }).exec();

    // Related products (same category, exclude current)
    const related = await Product.find({
      vendor: req.store._id,
      isPublished: true,
      category: product.category,
      _id: { $ne: product._id },
      stockStatus: 'in_stock',
    })
      .limit(4)
      .lean();

    res.render('store/product', {
      title: `${product.name} — ${req.store.businessName}`,
      product,
      related,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /store/:vendorSlug/cart ───────────────────────────────────────────────
// Cart page (cart data stored client-side in localStorage, rendered server-side shell)
router.get('/:vendorSlug/cart', resolveStore, (req, res) => {
  res.render('store/cart', {
    title: `Cart — ${req.store.businessName}`,
  });
});

// ── GET /store/:vendorSlug/checkout ──────────────────────────────────────────
// Checkout form page
router.get('/:vendorSlug/checkout', resolveStore, (req, res) => {
  res.render('store/checkout-form', {
    title: `Checkout — ${req.store.businessName}`,
    paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY,
  });
});

// ── GET /store/:vendorSlug/order-success ─────────────────────────────────────
// Post-order confirmation page
router.get('/:vendorSlug/order-success', resolveStore, (req, res) => {
  res.render('store/order-success', {
    title: `Order Placed — ${req.store.businessName}`,
    orderNumber: req.query.ref || null,
  });
});

module.exports = router;