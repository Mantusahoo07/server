import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

const createUsers = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const users = [
      { 
        username: 'admin', 
        email: 'admin@pos.com', 
        password: 'admin123', 
        role: 'admin' 
      },
      { 
        username: 'posuser', 
        email: 'pos@pos.com', 
        password: 'pos123', 
        role: 'pos' 
      },
      { 
        username: 'kitchen', 
        email: 'kitchen@pos.com', 
        password: 'kitchen123', 
        role: 'kitchen' 
      },
      { 
        username: 'cashier', 
        email: 'cashier@pos.com', 
        password: 'cashier123', 
        role: 'cashier' 
      }
    ];
    
    for (const userData of users) {
      const existing = await User.findOne({ username: userData.username });
      if (!existing) {
        const user = new User(userData);
        await user.save();
        console.log(`✅ Created user: ${userData.username} (${userData.role})`);
        console.log(`   Password: ${userData.password}`);
        console.log(`   Email: ${userData.email}\n`);
      } else {
        console.log(`⏭️ User already exists: ${userData.username} (${existing.role})`);
      }
    }
    
    console.log('🎉 User creation complete!');
    console.log('\n📋 Login Credentials:');
    console.log('   Admin: admin / admin123');
    console.log('   POS User: posuser / pos123');
    console.log('   Kitchen: kitchen / kitchen123');
    console.log('   Cashier: cashier / cashier123');
    
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

createUsers();
