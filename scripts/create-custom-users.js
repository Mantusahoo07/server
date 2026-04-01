import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import readline from 'readline';

dotenv.config();

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

const createCustomUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    console.log('📝 Create your custom users:\n');
    
    // Create Admin User
    console.log('=== ADMIN USER ===');
    const adminUsername = await question('Admin username (default: admin): ') || 'admin';
    const adminEmail = await question('Admin email (default: admin@restaurant.com): ') || 'admin@restaurant.com';
    const adminPassword = await question('Admin password (min 6 chars): ');
    
    if (!adminPassword || adminPassword.length < 6) {
      console.log('❌ Password must be at least 6 characters');
      process.exit(1);
    }
    
    // Create POS User
    console.log('\n=== POS USER ===');
    const posUsername = await question('POS username (default: posuser): ') || 'posuser';
    const posEmail = await question('POS email (default: pos@restaurant.com): ') || 'pos@restaurant.com';
    const posPassword = await question('POS password (min 6 chars): ');
    
    if (!posPassword || posPassword.length < 6) {
      console.log('❌ Password must be at least 6 characters');
      process.exit(1);
    }
    
    // Create Kitchen User
    console.log('\n=== KITCHEN USER ===');
    const kitchenUsername = await question('Kitchen username (default: kitchen): ') || 'kitchen';
    const kitchenEmail = await question('Kitchen email (default: kitchen@restaurant.com): ') || 'kitchen@restaurant.com';
    const kitchenPassword = await question('Kitchen password (min 6 chars): ');
    
    if (!kitchenPassword || kitchenPassword.length < 6) {
      console.log('❌ Password must be at least 6 characters');
      process.exit(1);
    }
    
    // Create Cashier User (Optional)
    console.log('\n=== CASHIER USER (Optional) ===');
    const createCashier = await question('Create cashier user? (y/n): ');
    let cashierUsername, cashierEmail, cashierPassword;
    
    if (createCashier.toLowerCase() === 'y') {
      cashierUsername = await question('Cashier username (default: cashier): ') || 'cashier';
      cashierEmail = await question('Cashier email (default: cashier@restaurant.com): ') || 'cashier@restaurant.com';
      cashierPassword = await question('Cashier password (min 6 chars): ');
      
      if (!cashierPassword || cashierPassword.length < 6) {
        console.log('❌ Password must be at least 6 characters');
        process.exit(1);
      }
    }
    
    // Create Manager User (Optional)
    console.log('\n=== MANAGER USER (Optional) ===');
    const createManager = await question('Create manager user? (y/n): ');
    let managerUsername, managerEmail, managerPassword;
    
    if (createManager.toLowerCase() === 'y') {
      managerUsername = await question('Manager username (default: manager): ') || 'manager';
      managerEmail = await question('Manager email (default: manager@restaurant.com): ') || 'manager@restaurant.com';
      managerPassword = await question('Manager password (min 6 chars): ');
      
      if (!managerPassword || managerPassword.length < 6) {
        console.log('❌ Password must be at least 6 characters');
        process.exit(1);
      }
    }
    
    // Create users array
    const users = [
      { 
        username: adminUsername, 
        email: adminEmail, 
        password: adminPassword, 
        role: 'admin' 
      },
      { 
        username: posUsername, 
        email: posEmail, 
        password: posPassword, 
        role: 'pos' 
      },
      { 
        username: kitchenUsername, 
        email: kitchenEmail, 
        password: kitchenPassword, 
        role: 'kitchen' 
      }
    ];
    
    if (createCashier.toLowerCase() === 'y') {
      users.push({ 
        username: cashierUsername, 
        email: cashierEmail, 
        password: cashierPassword, 
        role: 'cashier' 
      });
    }
    
    if (createManager.toLowerCase() === 'y') {
      users.push({ 
        username: managerUsername, 
        email: managerEmail, 
        password: managerPassword, 
        role: 'manager' 
      });
    }
    
    // Create users
    console.log('\n🔄 Creating users...\n');
    
    for (const userData of users) {
      const existing = await User.findOne({ username: userData.username });
      if (existing) {
        console.log(`⚠️  User "${userData.username}" already exists, updating...`);
        existing.password = userData.password;
        existing.email = userData.email;
        existing.role = userData.role;
        await existing.save();
        console.log(`✅ Updated user: ${userData.username} (${userData.role})`);
      } else {
        const user = new User(userData);
        await user.save();
        console.log(`✅ Created user: ${userData.username} (${userData.role})`);
      }
    }
    
    console.log('\n🎉 User creation complete!\n');
    console.log('📋 Credentials Summary:');
    console.log('═'.repeat(50));
    
    for (const user of users) {
      console.log(`\n👤 ${user.role.toUpperCase()} User:`);
      console.log(`   Username: ${user.username}`);
      console.log(`   Password: ${user.password}`);
      console.log(`   Email: ${user.email}`);
    }
    
    console.log('\n' + '═'.repeat(50));
    console.log('💡 Tip: Use these credentials to login to the POS system');
    console.log('   Different roles have different access permissions:\n');
    console.log('   • Admin: Full access to everything');
    console.log('   • Manager: Can manage menu, view reports, but cannot manage users');
    console.log('   • Cashier: POS and orders only');
    console.log('   • POS: POS and orders only');
    console.log('   • Kitchen: Kitchen display only\n');
    
    rl.close();
    await mongoose.disconnect();
    
  } catch (error) {
    console.error('❌ Error:', error);
    rl.close();
    process.exit(1);
  }
};

createCustomUsers();
