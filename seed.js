/**
 * seed.js
 * Run this to create a demo car dealership account.
 * Command: node seed.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Vendor = require('./models/Vendor');
const Product = require('./models/Product');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/wastore';

const seedData = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to DB for seeding...');

    // Clear existing demo data
    await Vendor.deleteOne({ email: 'demo@autovault.ng' });
    
    const demoVendor = new Vendor({
      businessName: 'AutoVault Nigeria',
      ownerName: 'Olamide Motors',
      email: 'demo@autovault.ng',
      phone: '2348123456789',
      slug: 'autovault',
      passwordHash: 'demo1234', // Will be hashed by pre-save
      storefront: {
        tagline: 'Premium Foreign Used & Brand New Vehicles in Ogbomoso',
        themeColor: '#25D366',
        category: 'Other'
      }
    });

    await demoVendor.save();
    console.log('✅ Demo Vendor Created: autovault');

    // Clear existing admin data
    await Vendor.deleteOne({ email: 'admin@wastore.ng' });
    
    const adminVendor = new Vendor({
      businessName: 'WaStore Super Admin',
      ownerName: 'System Administrator',
      email: 'admin@wastore.ng',
      phone: '2348000000000',
      slug: 'admin',
      passwordHash: 'admin1234',
      role: 'admin',
      storefront: {
        tagline: 'Platform Administration',
        themeColor: '#000000',
        category: 'Other'
      }
    });
    await adminVendor.save();
    console.log('✅ Admin User Created: admin@wastore.ng');

    const cars = [
      {
        vendor: demoVendor._id,
        name: '2022 Toyota Camry (XLE)',
        description: 'Foreign used, full option, panoramic roof, leather seats, low mileage.',
        price: 25000000,
        compareAtPrice: 27500000,
        images: [{ url: 'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?q=80&w=800', isPrimary: true }],
        category: 'Sedans',
        stockStatus: 'in_stock'
      },
      {
        vendor: demoVendor._id,
        name: '2021 Mercedes-Benz GLE 450',
        description: 'Clean title, 4Matic, Ambient lighting, Burmester sound system.',
        price: 65000000,
        compareAtPrice: 70000000,
        images: [{ url: 'https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?q=80&w=800', isPrimary: true }],
        category: 'SUVs',
        stockStatus: 'in_stock'
      },
      {
        vendor: demoVendor._id,
        name: '2018 Lexus RX 350',
        description: 'Silver exterior, Red interior. Nigerian used but extremely clean.',
        price: 32000000,
        images: [{ url: 'https://images.unsplash.com/photo-1590362891175-3794efc99aaf?q=80&w=800', isPrimary: true }],
        category: 'SUVs',
        stockStatus: 'in_stock'
      }
    ];

    await Product.deleteMany({ vendor: demoVendor._id });
    await Product.insertMany(cars);
    console.log('✅ Demo Cars Added');

    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

seedData();
