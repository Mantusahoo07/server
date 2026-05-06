import mongoose from 'mongoose';

let warmUpCompleted = false;

export const warmupDatabase = async () => {
  if (warmUpCompleted) {
    console.log('⚠️ Database already warmed up, skipping...');
    return;
  }
  
  console.log('🔥 Starting database warm-up...');
  const startTime = Date.now();
  
  try {
    // Import models dynamically
    const MenuItem = (await import('../models/MenuItem.js')).default;
    const Category = (await import('../models/Category.js')).default;
    const Order = (await import('../models/Order.js')).default;
    const Table = (await import('../models/Table.js')).default;
    const Setting = (await import('../models/Setting.js')).default;
    const User = (await import('../models/User.js')).default;
    const BusinessDetail = (await import('../models/BusinessDetail.js')).default;
    
    // Run lightweight queries to warm up each collection
    const collections = [
      { name: 'Menu Items', model: MenuItem, count: await MenuItem.estimatedDocumentCount().catch(() => 0) },
      { name: 'Categories', model: Category, count: await Category.estimatedDocumentCount().catch(() => 0) },
      { name: 'Orders', model: Order, count: await Order.estimatedDocumentCount().catch(() => 0) },
      { name: 'Tables', model: Table, count: await Table.estimatedDocumentCount().catch(() => 0) },
      { name: 'Settings', model: Setting, count: await Setting.estimatedDocumentCount().catch(() => 0) },
      { name: 'Users', model: User, count: await User.estimatedDocumentCount().catch(() => 0) }
    ];
    
    for (const collection of collections) {
      console.log(`✅ Warmed up ${collection.name} collection (${collection.count} documents)`);
    }
    
    // Also warm up business details
    const business = await BusinessDetail.findOne({ key: 'business-details' });
    if (business) {
      console.log(`✅ Warmed up Business Details (ID: ${business._id})`);
    }
    
    warmUpCompleted = true;
    const duration = Date.now() - startTime;
    console.log(`🔥 Database warm-up completed in ${duration}ms`);
    
  } catch (error) {
    console.error('❌ Database warm-up failed:', error.message);
    // Don't throw - continue running without warm-up
  }
};

export const preloadCache = async (app) => {
  console.log('📦 Preloading frequently accessed data into cache...');
  const startTime = Date.now();
  
  try {
    const Setting = (await import('../models/Setting.js')).default;
    const BusinessDetail = (await import('../models/BusinessDetail.js')).default;
    const Category = (await import('../models/Category.js')).default;
    const MenuItem = (await import('../models/MenuItem.js')).default;
    
    // Preload settings
    const settings = await Setting.findOne({ key: 'general' });
    if (settings) {
      app.locals.settings = settings.value;
      console.log('✅ Settings cached');
    }
    
    // Preload business details
    const business = await BusinessDetail.findOne({ key: 'business-details' });
    if (business) {
      app.locals.businessDetails = business;
      console.log('✅ Business details cached');
    }
    
    // Preload categories
    const categories = await Category.find({ isActive: true }).lean();
    app.locals.categories = categories;
    console.log(`✅ ${categories.length} categories cached`);
    
    // Preload menu items preview
    const menuItems = await MenuItem.find({ available: true }).lean().limit(50);
    app.locals.menuItemsPreview = menuItems;
    console.log(`✅ ${menuItems.length} menu items preview cached`);
    
  } catch (error) {
    console.error('❌ Cache preload failed:', error.message);
  }
  
  const duration = Date.now() - startTime;
  console.log(`📦 Cache preload completed in ${duration}ms`);
};

export const getWarmUpStatus = () => ({
  completed: warmUpCompleted,
  timestamp: new Date().toISOString()
});
