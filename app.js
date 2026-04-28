/**
 * WaStore SaaS — app.js
 * The high-performance, multi-tenant backend for Nigerian WhatsApp commerce.
 */

require('dotenv').config();
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const methodOverride = require('method-override');
const morgan = require('morgan');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const cloudinary = require('cloudinary').v2;
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const cookieParser = require('cookie-parser');

// ── Route Imports ─────────────────────────────────────────────────────────────
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const customerRoutes = require('./routes/customers');
const storeRoutes = require('./routes/store');
const customerPortalRoutes = require('./routes/customer-portal');
const checkoutRoutes = require('./routes/checkout');
const webhookRoutes = require('./routes/webhooks');
const adminRoutes = require('./routes/admin');
const Vendor = require('./models/Vendor');
const Product = require('./models/Product');

const app = express();

// ── Cloudinary Config ──────────────────────────────────────────────────────────
if (!process.env.CLOUDINARY_NAME || !process.env.CLOUDINARY_KEY || !process.env.CLOUDINARY_SECRET) {
  console.warn('⚠️  Warning: Missing Cloudinary environment variables in .env file');
}
cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_NAME, 
  api_key: process.env.CLOUDINARY_KEY, 
  api_secret: process.env.CLOUDINARY_SECRET
});

// ── Database Connection ───────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/wastore';
mongoose
  .connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch((err) => {
    console.error('❌ MongoDB Connection Error:', err.message);
    console.log('👉 Tip: Make sure your MongoDB service is running or check your MONGO_URI in .env');
    if (process.env.NODE_ENV === 'production') {
      console.error('🛑 Exiting in production mode due to database connection failure');
      process.exit(1);
    }
  });

// ── Security & Optimization ───────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Set to false for simpler dev/external images
}));
app.use(mongoSanitize());
app.use(xss());

if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

app.use(compression());
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

// ── Body Parsing ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));

// ── View Engine ───────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');
app.use(express.static(path.join(__dirname, 'public')));

// ── Sessions ──────────────────────────────────────────────────────────────────
const sessionSecret = process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' 
  ? (() => { throw new Error('SESSION_SECRET must be set in production'); })() 
  : 'wastore-secret-2026');

app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: MONGO_URI }),
    cookie: { 
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true
    },
  })
);

app.use(cookieParser());

// ── Global Locals ─────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.locals.vendor = req.session.vendor || null;
  res.locals.flashSuccess = req.session.flashSuccess || null;
  res.locals.flashError = req.session.flashError || null;
  res.locals.currentPath = req.path;
  delete req.session.flashSuccess;
  delete req.session.flashError;
  next();
});

// ── Rate Limiting ──────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: 'Too many login attempts from this IP, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/auth', authLimiter, authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/dashboard/products', productRoutes);
app.use('/dashboard/orders', orderRoutes);
app.use('/dashboard/customers', customerRoutes);
app.use('/store', storeRoutes);
app.use('/store/:vendorSlug/account', customerPortalRoutes);
app.use('/checkout', checkoutRoutes);
app.use('/webhooks', webhookRoutes);
app.use('/admin', adminRoutes);

// ── SEO: Dynamic Sitemap ──────────────────────────────────────────────────────
app.get('/sitemap.xml', async (req, res) => {
  try {
    const [vendors, products] = await Promise.all([
      Vendor.find({ isActive: true }).select('slug updatedAt'),
      Product.find({ isPublished: true }).populate('vendor', 'slug').select('updatedAt vendor')
    ]);

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url>
        <loc>${baseUrl}</url>
        <changefreq>daily</changefreq>
        <priority>1.0</priority>
      </url>`;

    // Add Vendor Storefronts
    vendors.forEach(v => {
      xml += `
      <url>
        <loc>${baseUrl}/store/${v.slug}</loc>
        <lastmod>${v.updatedAt.toISOString().split('T')[0]}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.8</priority>
      </url>`;
    });

    // Add Individual Product Pages
    products.forEach(p => {
      if (p.vendor) {
        xml += `
        <url>
          <loc>${baseUrl}/store/${p.vendor.slug}/product/${p._id}</loc>
          <lastmod>${p.updatedAt.toISOString().split('T')[0]}</lastmod>
          <changefreq>weekly</changefreq>
          <priority>0.6</priority>
        </url>`;
      }
    });

    xml += '\n</urlset>';
    res.header('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    console.error('Sitemap Error:', err);
    res.status(500).end();
  }
});

// Landing Page
app.get('/', (req, res) => {
  res.render('public/landing', { title: 'WaStore — Nigerian WhatsApp Commerce' });
});

// ── Error Handling ────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).render('errors/404', { title: 'Not Found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('errors/500', { title: 'Error', message: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 WaStore running at http://localhost:${PORT}`));
