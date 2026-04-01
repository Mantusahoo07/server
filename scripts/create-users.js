// scripts/create-users.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

const createUsers = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const users = [
    { username: 'admin', email: 'admin@pos.com', password: 'admin123', role: 'admin' },
    { username: 'posuser', email: 'pos@pos.com', password: 'pos123', role: 'pos' },
    { username: 'kitchen', email: 'kitchen@pos.com', password: 'kitchen123', role: 'kitchen' },
    { username: 'cashier', email: 'cashier@pos.com', password: 'cashier123', role: 'cashier' }
  ];
  
  for (const userData of users) {
    const existing = await User.findOne({ username: userData.username });
    if (!existing) {
      const user = new User(userData);
      await user.save();
      console.log(`✅ Created user: ${userData.username} (${userData.role})`);
    } else {
      console.log(`⏭️ User already exists: ${userData.username}`);
    }
  }
  
  await mongoose.disconnect();
  console.log('🎉 User creation complete!');
};

createUsers();
