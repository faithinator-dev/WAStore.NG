/**
 * README: npm install express express-session multer ejs express-ejs-layouts dotenv lokijs cloudinary bcryptjs nodemailer && node server.js
 */

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const expressLayouts = require('express-ejs-layouts');
const loki = require('lokijs');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const QRCode = require('qrcode');

const app = express();
const port = process.env.PORT || 3000;

// CLOUDINARY CONFIGURATION
cloudinary.config({ 
  cloud_name: 'dizrufnkw', 
  api_key: '791697278795852', 
  api_secret: 'm67sw3c_m2qkNQ_rE3tXwCHaHqs' 
});

// NODEMAILER SETUP
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const sendWelcomeEmail = async (email, shopName) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: email,
            subject: `Welcome to waStore, ${shopName}! 🛍️`,
            text: `Hi ${shopName},\n\nYour WhatsApp store is now live! Start adding products and share your link with customers.\n\nBest regards,\nThe waStore Team`
        });
    } catch (err) { console.error('Email Error:', err); }
};

// DATABASE SETUP (LokiJS)
const db = new loki('wastore.json', {
    autoload: true,
    autoloadCallback: databaseInitialize,
    autosave: true, 
    autosaveInterval: 4000
});

function databaseInitialize() {
    let vendors = db.getCollection("vendors");
    if (vendors === null) {
        vendors = db.addCollection("vendors", { unique: ['slug', 'whatsapp'] });
    }
    let products = db.getCollection("products");
    if (products === null) {
        products = db.addCollection("products");
    }
    let orders = db.getCollection("orders");
    if (orders === null) {
        orders = db.addCollection("orders");
    }
}

// GOOGLE OAUTH HELPER
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// MULTER SETUP (Memory Storage)
const upload = multer({ storage: multer.memoryStorage() });

// VIEW ENGINE SETUP
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

// MIDDLEWARE
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// UTILS
const slugify = (text) => text.toString().toLowerCase().trim()
  .replace(/\s+/g, '-')
  .replace(/[^\w\-]+/g, '')
  .replace(/\-\-+/g, '-');

// ROUTES
app.get('/', (req, res) => res.render('index', { title: 'Home' }));
app.get('/signup', (req, res) => res.render('signup', { title: 'Create Your Store' }));

app.post('/signup', async (req, res) => {
  const { shop_name, whatsapp, email, password } = req.body;
  if (!shop_name || !whatsapp || !password) return res.send("Please fill all required fields.");
  
  const slug = slugify(shop_name);
  const vendors = db.getCollection("vendors");
  
  const existing = vendors.findOne({ whatsapp: whatsapp });
  if (existing) return res.send("A store with this number already exists. <a href='/signin'>Sign In</a>");

  const hashedPassword = await bcrypt.hash(password, 10);

  const newVendor = vendors.insert({
    shop_name,
    slug,
    whatsapp,
    email,
    password: hashedPassword,
    bio: 'Same-day delivery available',
    location: 'Nigeria',
    delivery_info: 'We deliver nationwide via GIGL/Peace Mass',
    payment_opay: '',
    payment_palmpay: '',
    created_at: new Date()
  });

  if (email) sendWelcomeEmail(email, shop_name);

  req.session.vendorId = newVendor.$loki;
  req.session.slug = slug;
  res.redirect('/admin');
});

app.get('/signin', (req, res) => res.render('signin', { title: 'Sign In' }));

app.post('/signin', async (req, res) => {
  const { whatsapp, password } = req.body;
  const vendors = db.getCollection("vendors");
  const vendor = vendors.findOne({ whatsapp: whatsapp });

  if (vendor && await bcrypt.compare(password, vendor.password)) {
    req.session.vendorId = vendor.$loki;
    req.session.slug = vendor.slug;
    res.redirect('/admin');
  } else {
    res.send("Invalid credentials. <a href='/signin'>Try again</a>");
  }
});

app.get('/admin', async (req, res) => {
  if (!req.session.vendorId) return res.redirect('/signin');
  const vendors = db.getCollection("vendors");
  const productsColl = db.getCollection("products");
  
  const vendor = vendors.get(req.session.vendorId);
  const products = productsColl.find({ vendor_id: req.session.vendorId });
  
  const totalClicks = products.reduce((sum, p) => sum + (p.clicks || 0), 0);
  vendor.total_clicks = totalClicks;

  // Initialize payment fields if missing
  if (!vendor.payment_opay) vendor.payment_opay = '';
  if (!vendor.payment_palmpay) vendor.payment_palmpay = '';
  vendors.update(vendor);

  const storeUrl = `${req.protocol}://${req.get('host')}/${vendor.slug}`;
  
  let qrCodeData = '';
  try {
      qrCodeData = await QRCode.toDataURL(storeUrl);
  } catch (err) { console.error('QR Error:', err); }

  res.render('dashboard', { title: 'Dashboard', vendor, products, storeUrl, qrCodeData });
});

app.get('/admin/profile', (req, res) => {
    if (!req.session.vendorId) return res.redirect('/signin');
    const vendors = db.getCollection("vendors");
    const vendor = vendors.get(req.session.vendorId);
    res.render('profile', { title: 'Edit Profile', vendor });
});

app.post('/admin/profile', (req, res) => {
    if (!req.session.vendorId) return res.redirect('/signin');
    const { shop_name, location, bio, instagram, delivery_info, payment_opay, payment_palmpay } = req.body;
    const vendors = db.getCollection("vendors");
    const vendor = vendors.get(req.session.vendorId);
    
    vendor.shop_name = shop_name;
    vendor.location = location;
    vendor.bio = bio;
    vendor.instagram = instagram;
    vendor.delivery_info = delivery_info;
    vendor.payment_opay = payment_opay || '';
    vendor.payment_palmpay = payment_palmpay || '';
    
    vendors.update(vendor);
    res.redirect('/admin');
});

app.get('/admin/add', (req, res) => {
  if (!req.session.vendorId) return res.redirect('/signin');
  res.render('add-product', { title: 'Add Product' });
});

app.get('/admin/edit/:id', (req, res) => {
    if (!req.session.vendorId) return res.redirect('/signin');
    const productsColl = db.getCollection("products");
    const product = productsColl.get(parseInt(req.params.id));
    if (!product || product.vendor_id !== req.session.vendorId) return res.redirect('/admin');
    res.render('edit-product', { title: 'Edit Product', product });
});

app.post('/admin/edit/:id', upload.single('image_file'), async (req, res) => {
    if (!req.session.vendorId) return res.redirect('/signin');
    const productsColl = db.getCollection("products");
    const product = productsColl.get(parseInt(req.params.id));
    if (!product || product.vendor_id !== req.session.vendorId) return res.redirect('/admin');

    let { name, price, market_price, stock_status, image_url, short_description, description, variant_name, variant_options } = req.body;
    product.name = name;
    product.price = parseInt(price.replace(/\D/g, ""));
    product.market_price = market_price ? parseInt(market_price.replace(/\D/g, "")) : null;
    product.stock_status = stock_status || 'available';
    product.short_description = short_description;
    product.description = description;
    
    if (variant_name && variant_options) {
        product.variants = {
            name: variant_name,
            options: variant_options.split(',').map(o => o.trim()).filter(o => o)
        };
    } else {
        product.variants = null;
    }

    if (req.file) {
        try {
            const uploadResult = await new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream({ folder: 'wastore_products' }, (error, result) => {
                    if (error) reject(error); else resolve(result);
                });
                stream.end(req.file.buffer);
            });
            product.image_url = uploadResult.secure_url;
        } catch (err) { console.error('Cloudinary Error:', err); }
    } else if (image_url) {
        product.image_url = image_url;
    }

    productsColl.update(product);
    res.redirect('/admin');
});

app.post('/admin/delete/:id', (req, res) => {
    if (!req.session.vendorId) return res.redirect('/signin');
    const productsColl = db.getCollection("products");
    const product = productsColl.get(parseInt(req.params.id));
    if (product && product.vendor_id === req.session.vendorId) {
        productsColl.remove(product);
    }
    res.redirect('/admin');
});

app.post('/admin/add', upload.single('image_file'), async (req, res) => {
  if (!req.session.vendorId) return res.redirect('/signin');
  let { name, price, market_price, stock_status, image_url, short_description, description, variant_name, variant_options } = req.body;
  const numericPrice = parseInt(price.replace(/\D/g, ""));
  const numericMarketPrice = market_price ? parseInt(market_price.replace(/\D/g, "")) : null;
  
  let finalImageUrl = image_url;

  if (req.file) {
    try {
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({ folder: 'wastore_products' }, (error, result) => {
            if (error) reject(error); else resolve(result);
        });
        stream.end(req.file.buffer);
      });
      finalImageUrl = uploadResult.secure_url;
    } catch (err) { console.error('Cloudinary Error:', err); }
  }

  const products = db.getCollection("products");
  const newProduct = {
    vendor_id: req.session.vendorId,
    name,
    price: numericPrice,
    market_price: numericMarketPrice,
    image_url: finalImageUrl,
    short_description,
    description,
    stock_status: stock_status || 'available',
    clicks: 0,
    created_at: new Date()
  };

  if (variant_name && variant_options) {
      newProduct.variants = {
          name: variant_name,
          options: variant_options.split(',').map(o => o.trim()).filter(o => o)
      };
  }

  products.insert(newProduct);
  res.redirect('/admin');
});

app.get('/admin/orders', (req, res) => {
    if (!req.session.vendorId) return res.redirect('/signin');
    const ordersColl = db.getCollection("orders");
    const orders = ordersColl.find({ vendor_id: req.session.vendorId }).sort((a, b) => b.$loki - a.$loki);
    res.render('orders', { title: 'Manage Orders', orders });
});

app.post('/admin/orders/status/:id', (req, res) => {
    if (!req.session.vendorId) return res.redirect('/signin');
    const { status } = req.body;
    const ordersColl = db.getCollection("orders");
    const order = ordersColl.get(parseInt(req.params.id));
    if (order && order.vendor_id === req.session.vendorId) {
        order.status = status;
        ordersColl.update(order);
    }
    res.redirect('/admin/orders');
});

app.post('/checkout', (req, res) => {
    const { vendor_id, customer_name, customer_phone, customer_address, cart_data } = req.body;
    const vendors = db.getCollection("vendors");
    const vendor = vendors.get(parseInt(vendor_id));
    if (!vendor) return res.status(404).send("Vendor not found");

    const cart = JSON.parse(cart_data);
    const ordersColl = db.getCollection("orders");
    const order = ordersColl.insert({
        vendor_id: parseInt(vendor_id),
        customer_name,
        customer_phone,
        customer_address,
        items: cart,
        total: cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
        status: 'pending',
        created_at: new Date()
    });

    let msg = `🛍️ *New Order from ${customer_name}*\n\n`;
    cart.forEach(item => {
        msg += `- ${item.name} x${item.quantity}${item.variant ? ` (${item.variant})` : ''}: ₦${(item.price * item.quantity).toLocaleString()}\n`;
    });
    msg += `\n*Total: ₦${order.total.toLocaleString()}*\n\n📍 *Delivery:* ${customer_address}\n📞 *Phone:* ${customer_phone}`;

    res.redirect(`https://wa.me/${vendor.whatsapp}?text=${encodeURIComponent(msg)}`);
});

app.get('/:slug', (req, res, next) => {
  const slug = req.params.slug;
  const reserved = ['signup', 'admin', 'logout', 'wa', 'demo', 'signin', 'admin/profile', 'admin/add', 'admin/edit', 'admin/delete', 'admin/google', 'checkout'];
  if (reserved.includes(slug)) return next();

  const vendors = db.getCollection("vendors");
  const vendor = vendors.findOne({ slug: slug });
  
  if (!vendor) return res.status(404).send("Store not found");
  
  // ANALYTICS: Increment page views
  vendor.page_views = (vendor.page_views || 0) + 1;
  vendors.update(vendor);

  const productsColl = db.getCollection("products");
  const products = productsColl.find({ vendor_id: vendor.$loki });
  
  res.render('store', { 
    title: vendor.shop_name, 
    vendor, 
    products,
    metaDesc: vendor.bio || `Shop at ${vendor.shop_name}`,
    metaImage: products.length > 0 ? products[0].image_url : ''
  });
});

app.get('/wa/:v_id/:p_id', (req, res) => {
  const { v_id, p_id } = req.params;
  const products = db.getCollection("products");
  const product = products.get(parseInt(p_id));
  
  if (product) {
      product.clicks = (product.clicks || 0) + 1;
      products.update(product);
  }

  const vendors = db.getCollection("vendors");
  const vendor = vendors.get(parseInt(v_id));
  if (!vendor) return res.redirect('/');
  
  // Redirect to store page instead of direct WhatsApp to enforce Cart/Variant flow
  res.redirect(`/${vendor.slug}`);
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// GOOGLE OAUTH ROUTES
app.get('/admin/google/auth', (req, res) => {
    if (!req.session.vendorId) return res.redirect('/signin');
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        prompt: 'consent'
    });
    res.redirect(url);
});

app.get('/admin/google/callback', async (req, res) => {
    const { code } = req.query;
    try {
        const { tokens } = await oauth2Client.getToken(code);
        const vendors = db.getCollection("vendors");
        const vendor = vendors.get(req.session.vendorId);
        vendor.google_tokens = tokens;
        vendors.update(vendor);
        res.redirect('/admin?google=connected');
    } catch (err) {
        console.error('Google Auth Error:', err);
        res.send("Authentication failed.");
    }
});

app.post('/admin/google/sync', async (req, res) => {
    if (!req.session.vendorId) return res.redirect('/signin');
    const { spreadsheet_id } = req.body;
    const vendors = db.getCollection("vendors");
    const vendor = vendors.get(req.session.vendorId);
    
    if (!vendor.google_tokens) return res.send("Please connect Google account first.");
    
    vendor.spreadsheet_id = spreadsheet_id;
    vendors.update(vendor);

    oauth2Client.setCredentials(vendor.google_tokens);
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheet_id,
            range: 'Sheet1!A2:G', // Expected: Name, Price, Market Price, Image, Short Desc, Long Desc, Stock Status
        });

        const rows = response.data.values;
        if (rows && rows.length) {
            const productsColl = db.getCollection("products");
            rows.forEach(row => {
                const [name, price, market_price, image_url, short_description, description, stock_status] = row;
                if (!name || !price) return;

                const existing = productsColl.findOne({ vendor_id: vendor.$loki, name: name });
                const productData = {
                    vendor_id: vendor.$loki,
                    name,
                    price: parseInt(price.replace(/\D/g, "")),
                    market_price: market_price ? parseInt(market_price.replace(/\D/g, "")) : null,
                    image_url: image_url || '',
                    short_description: short_description || '',
                    description: description || '',
                    stock_status: stock_status || 'available',
                    clicks: existing ? existing.clicks : 0,
                    created_at: existing ? existing.created_at : new Date()
                };

                if (existing) {
                    Object.assign(existing, productData);
                    productsColl.update(existing);
                } else {
                    productsColl.insert(productData);
                }
            });
        }
        res.redirect('/admin?sync=success');
    } catch (err) {
        console.error('Google Sync Error:', err);
        res.send("Sync failed. Check Spreadsheet ID and permissions.");
    }
});

app.listen(port, () => console.log(`waStore running at http://localhost:${port}`));

