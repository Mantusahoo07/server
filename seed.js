const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Location = require('./models/Location');
const { MenuItem, Category } = require('./models/Menu');
require('dotenv').config();

const seedDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing data
    await Promise.all([
      User.deleteMany({}),
      Location.deleteMany({}),
      Category.deleteMany({}),
      MenuItem.deleteMany({})
    ]);
    console.log('📦 Cleared existing data');

    // Create default location
    const location = await Location.create({
      name: 'Main Restaurant',
      code: 'MAIN',
      address: {
        street: '123 Main St',
        city: 'City',
        state: 'State',
        zipCode: '12345'
      },
      phone: '+1234567890',
      email: 'restaurant@example.com',
      openingTime: '09:00',
      closingTime: '22:00',
      timezone: 'America/New_York',
      currency: 'USD',
      taxRate: 10,
      createdBy: new mongoose.Types.ObjectId()
    });
    console.log('📍 Created location:', location.name);

    // Create admin user
    const adminUser = await User.create({
      username: 'admin',
      email: 'admin@restropos.com',
      password: 'admin123',
      name: 'Admin User',
      role: 'admin',
      location: location._id,
      accessibleLocations: [location._id],
      isActive: true
    });
    console.log('👤 Created admin user');

    // Create categories
    const categories = await Category.create([
      {
        name: 'Appetizers',
        locationId: location._id,
        displayOrder: 1,
        createdBy: adminUser._id
      },
      {
        name: 'Main Course',
        locationId: location._id,
        displayOrder: 2,
        createdBy: adminUser._id
      },
      {
        name: 'Desserts',
        locationId: location._id,
        displayOrder: 3,
        createdBy: adminUser._id
      },
      {
        name: 'Beverages',
        locationId: location._id,
        displayOrder: 4,
        createdBy: adminUser._id
      }
    ]);
    console.log('📋 Created categories');

    // Create sample menu items
    const menuItems = await MenuItem.create([
      {
        name: 'Margherita Pizza',
        description: 'Classic tomato sauce, fresh mozzarella, basil',
        price: 14.99,
        category: categories[1].name,
        locationId: location._id,
        available: true,
        popular: true,
        preparationTime: { min: 15, max: 20 },
        dietary: ['veg'],
        createdBy: adminUser._id
      },
      {
        name: 'Caesar Salad',
        description: 'Romaine lettuce, croutons, parmesan, caesar dressing',
        price: 8.99,
        category: categories[0].name,
        locationId: location._id,
        available: true,
        preparationTime: { min: 5, max: 10 },
        dietary: ['veg'],
        createdBy: adminUser._id
      },
      {
        name: 'Chocolate Cake',
        description: 'Rich chocolate layer cake with ganache',
        price: 6.99,
        category: categories[2].name,
        locationId: location._id,
        available: true,
        popular: true,
        preparationTime: { min: 5, max: 8 },
        dietary: ['veg'],
        createdBy: adminUser._id
      }
    ]);
    console.log('🍽️ Created menu items');

    console.log('\n✅ Database seeded successfully!');
    console.log('\n📝 Login credentials:');
    console.log('   Email: admin@restropos.com');
    console.log('   Password: admin123');
    console.log(`\n📍 Location: ${location.name}`);

  } catch (error) {
    console.error('❌ Seeding error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📦 Disconnected from MongoDB');
  }
};

seedDatabase();
