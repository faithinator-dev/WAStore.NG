/**
 * routes/auth.js
 * Vendor signup, login, logout.
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const Vendor = require('../models/Vendor');
const { sendResetEmail } = require('../utils/mail');

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

// ── GET /auth/forgot-password ────────────────────────────────────────────────
router.get('/forgot-password', (req, res) => {
  res.render('auth/forgot-password', { title: 'Forgot Password', errors: null });
});

// ── POST /auth/forgot-password ───────────────────────────────────────────────
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    const vendor = await Vendor.findOne({ email });

    if (!vendor) {
      return res.render('auth/forgot-password', {
        title: 'Forgot Password',
        errors: [{ msg: 'No account found with that email address.' }],
      });
    }

    // Generate reset token
    const token = crypto.randomBytes(32).toString('hex');
    vendor.resetPasswordToken = token;
    vendor.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await vendor.save();

    // Send Email
    const resetUrl = `${req.protocol}://${req.get('host')}/auth/reset-password/${token}`;
    await sendResetEmail(vendor.email, resetUrl);

    req.session.flashSuccess = 'A reset link has been sent to your email.';
    res.redirect('/auth/login');
  } catch (err) {
    console.error('Forgot password error:', err);
    res.render('auth/forgot-password', {
      title: 'Forgot Password',
      errors: [{ msg: 'Something went wrong. Please try again.' }],
    });
  }
});

// ── GET /auth/reset-password/:token ─────────────────────────────────────────
router.get('/reset-password/:token', async (req, res) => {
  try {
    const vendor = await Vendor.findOne({
      resetPasswordToken: req.params.token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!vendor) {
      req.session.flashError = 'Password reset token is invalid or has expired.';
      return res.redirect('/auth/forgot-password');
    }

    res.render('auth/reset-password', { title: 'Reset Password', token: req.params.token, errors: null });
  } catch (err) {
    res.redirect('/auth/forgot-password');
  }
});

// ── POST /auth/reset-password/:token ────────────────────────────────────────
router.post('/reset-password/:token', async (req, res, next) => {
  try {
    const { password } = req.body;
    const vendor = await Vendor.findOne({
      resetPasswordToken: req.params.token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!vendor) {
      req.session.flashError = 'Password reset token is invalid or has expired.';
      return res.redirect('/auth/forgot-password');
    }

    // Update password and clear reset fields
    vendor.passwordHash = password; // Pre-save hook will hash it
    vendor.resetPasswordToken = null;
    vendor.resetPasswordExpires = null;
    await vendor.save();

    req.session.flashSuccess = 'Your password has been reset successfully. Please login.';
    res.redirect('/auth/login');
  } catch (err) {
    console.error('Reset password error:', err);
    res.render('auth/reset-password', {
      title: 'Reset Password',
      token: req.params.token,
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