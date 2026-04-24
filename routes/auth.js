/**
 * routes/auth.js
 * Vendor signup, login, logout.
 */

const express = require('express');
const router = express.Router();
const Vendor = require('../models/Vendor');

// ── GET /auth/signup ──────────────────────────────────────────────────────────
router.get('/signup', (req, res) => {
  if (req.session?.vendor) return res.redirect('/dashboard');
  res.render('auth/signup', { title: 'Create Your WaStore', errors: null });
});

// ── POST /auth/signup ─────────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  const { businessName, ownerName, email, phone, password } = req.body;

  // Build slug from business name
  const slug = businessName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 40);

  try {
    const existingEmail = await Vendor.findOne({ email });
    if (existingEmail) {
      return res.render('auth/signup', {
        title: 'Create Your WaStore',
        errors: [{ msg: 'An account with this email already exists.' }],
      });
    }

    // Ensure slug uniqueness — append random suffix if taken
    let finalSlug = slug;
    const slugExists = await Vendor.findOne({ slug });
    if (slugExists) {
      finalSlug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const vendor = new Vendor({
      businessName,
      ownerName,
      email,
      phone,
      slug: finalSlug,
      passwordHash: password, // hashed in pre-save hook
    });

    await vendor.save();

    req.session.vendor = { _id: vendor._id, slug: vendor.slug, businessName: vendor.businessName };
    req.session.flashSuccess = `Welcome to WaStore, ${vendor.businessName}! 🎉 Your store is live.`;
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Signup error:', err);
    res.render('auth/signup', {
      title: 'Create Your WaStore',
      errors: [{ msg: 'Something went wrong. Please try again.' }],
    });
  }
});

// ── GET /auth/login ───────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  if (req.session?.vendor) return res.redirect('/dashboard');
  res.render('auth/login', { title: 'Log In to WaStore', errors: null });
});

// ── POST /auth/login ──────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const vendor = await Vendor.findOne({ email }).select('+passwordHash');
    if (!vendor || !(await vendor.comparePassword(password))) {
      return res.render('auth/login', {
        title: 'Log In to WaStore',
        errors: [{ msg: 'Invalid email or password.' }],
      });
    }

    if (!vendor.isActive) {
      return res.render('auth/login', {
        title: 'Log In to WaStore',
        errors: [{ msg: 'Your account has been deactivated. Contact support.' }],
      });
    }

    vendor.lastLoginAt = new Date();
    await vendor.save();

    req.session.vendor = { _id: vendor._id, slug: vendor.slug, businessName: vendor.businessName };
    req.session.flashSuccess = `Welcome back, ${vendor.businessName}!`;
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Login error:', err);
    res.render('auth/login', {
      title: 'Log In to WaStore',
      errors: [{ msg: 'Something went wrong. Please try again.' }],
    });
  }
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/auth/login');
  });
});

module.exports = router;