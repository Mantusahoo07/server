import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ['admin', 'manager', 'cashier', 'kitchen', 'pos'],
    default: 'cashier'
  },
  permissions: {
    canEditMenu: { type: Boolean, default: false },
    canManageUsers: { type: Boolean, default: false },
    canViewReports: { type: Boolean, default: false },
    canAccessPOS: { type: Boolean, default: true },
    canAccessKitchen: { type: Boolean, default: false },
    canAccessOrders: { type: Boolean, default: false },
    canAccessReports: { type: Boolean, default: false },
    canAccessSettings: { type: Boolean, default: false }
  },
  active: { type: Boolean, default: true },
  lastLogin: Date,
  createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function(next) {
  const rolePermissions = {
    admin: { canEditMenu: true, canManageUsers: true, canViewReports: true, canAccessPOS: true, canAccessKitchen: true, canAccessOrders: true, canAccessReports: true, canAccessSettings: true },
    manager: { canEditMenu: true, canManageUsers: false, canViewReports: true, canAccessPOS: true, canAccessKitchen: true, canAccessOrders: true, canAccessReports: true, canAccessSettings: true },
    cashier: { canEditMenu: false, canManageUsers: false, canViewReports: false, canAccessPOS: true, canAccessKitchen: false, canAccessOrders: true, canAccessReports: false, canAccessSettings: false },
    pos: { canEditMenu: false, canManageUsers: false, canViewReports: false, canAccessPOS: true, canAccessKitchen: false, canAccessOrders: true, canAccessReports: false, canAccessSettings: false },
    kitchen: { canEditMenu: false, canManageUsers: false, canViewReports: false, canAccessPOS: false, canAccessKitchen: true, canAccessOrders: false, canAccessReports: false, canAccessSettings: false }
  };
  
  if (rolePermissions[this.role]) {
    this.permissions = rolePermissions[this.role];
  }
  
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('User', userSchema);