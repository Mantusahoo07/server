import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

const users = [
  { username: 'admin', email: 'admin@pos.com', password: 'admin123', role: 'admin' },
  { username: 'posuser', email: 'pos@pos.com', password: 'pos123', role: 'pos' },
  { username: 'kitchen', email: 'kitchen@pos.com', password: 'kitchen123', role: 'kitchen' },
  { username: 'cashier', email: 'cashier@pos.com', password: 'cashier123', role: 'cashier' },
  { username: 'manager', email: 'manager@pos.com', password: 'manager123', role: 'manager' }
];

const createUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    for (const userData of users) {
      const existing = await User.findOne({ username: userData.username });
      if (!existing) {
        const user = new User(userData);
        await user.save();
        console.log(`✅ Created: ${userData.username} (${userData.role})`);
      } else {
        console.log(`⏭️ Already exists: ${userData.username}`);
      }
    }
    
    console.log('\n📋 Login Credentials:');
    console.log('   Admin: admin / admin123');
    console.log('   POS: posuser / pos123');
    console.log('   Kitchen: kitchen / kitchen123');
    console.log('   Cashier: cashier / cashier123');
    console.log('   Manager: manager / manager123');
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
};

createUsers();