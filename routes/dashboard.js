/**
 * routes/dashboard.js
 * Vendor dashboard — overview/home, settings.
 */

const express = require('express');
const router = express.Router();
const { requireVendorAuth, attachVendor } = require('../middleware/auth');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Customer = require('../models/Customer');

// Apply auth guards to all dashboard routes
router.use(requireVendorAuth, attachVendor);

// ── GET /dashboard ────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const vendorId = req.vendor._id;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Parallel queries for dashboard KPIs
    const [
      totalOrders,
      pendingOrders,
      monthOrders,
      totalProducts,
      inStockProducts,
      totalCustomers,
      recentOrders,
      monthRevenue,
    ] = await Promise.all([
      Order.countDocuments({ vendor: vendorId }),
      Order.countDocuments({ vendor: vendorId, status: 'pending' }),
      Order.countDocuments({ vendor: vendorId, createdAt: { $gte: startOfMonth } }),
      Product.countDocuments({ vendor: vendorId }),
      Product.countDocuments({ vendor: vendorId, stockStatus: 'in_stock' }),
      Customer.countDocuments({ vendor: vendorId }),
      Order.find({ vendor: vendorId })
        .sort({ createdAt: -1 })
        .limit(8)
        .populate('customer', 'fullName phone')
        .lean(),
      Order.aggregate([
        {
          $match: {
            vendor: vendorId,
            'payment.status': 'paid',
            createdAt: { $gte: startOfMonth },
          },
        },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
    ]);

    const stats = {
      totalOrders,
      pendingOrders,
      monthOrders,
      totalProducts,
      inStockProducts,
      totalCustomers,
      monthRevenue: monthRevenue[0]?.total ?? 0,
    };

    res.render('vendor/dashboard', {
      title: `Dashboard — ${req.vendor.businessName}`,
      stats,
      recentOrders,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /dashboard/settings ───────────────────────────────────────────────────
router.get('/settings', (req, res) => {
  res.render('vendor/settings', { title: 'Store Settings', errors: null });
});

// ── POST /dashboard/settings ──────────────────────────────────────────────────
router.post('/settings', async (req, res, next) => {
  const { businessName, phone, tagline, themeColor, category, instagram, twitter } = req.body;
  try {
    const Vendor = require('../models/Vendor');
    await Vendor.findByIdAndUpdate(req.vendor._id, {
      businessName,
      phone,
      'storefront.tagline': tagline,
      'storefront.themeColor': themeColor,
      'storefront.category': category,
      'storefront.socialLinks.instagram': instagram,
      'storefront.socialLinks.twitter': twitter,
    });

    // Refresh session name
    req.session.vendor.businessName = businessName;
    req.session.flashSuccess = 'Store settings updated successfully.';
    res.redirect('/dashboard/settings');
  } catch (err) {
    next(err);
  }
});

module.exports = router;