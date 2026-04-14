import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'manager', 'cashier', 'kitchen', 'pos'],
    default: 'cashier'
  },
  permissions: {
    canEditMenu: { type: Boolean, default: false },
    canManageUsers: { type: Boolean, default: false },
    canViewReports: { type: Boolean, default: false },
    canRefundOrders: { type: Boolean, default: false },
    canMarkOutOfStock: { type: Boolean, default: false },
    canAccessPOS: { type: Boolean, default: true },
    canAccessKitchen: { type: Boolean, default: false },
    canAccessOrders: { type: Boolean, default: false },
    canAccessReports: { type: Boolean, default: false },
    canAccessSettings: { type: Boolean, default: false }
  },
  active: {
    type: Boolean,
    default: true
  },
  lastLogin: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Pre-save middleware to set permissions based on role
userSchema.pre('save', async function(next) {
  // Set permissions based on role
  const rolePermissions = {
    admin: {
      canEditMenu: true,
      canManageUsers: true,
      canViewReports: true,
      canRefundOrders: true,
      canMarkOutOfStock: true,
      canAccessPOS: true,
      canAccessKitchen: true,
      canAccessOrders: true,
      canAccessReports: true,
      canAccessSettings: true
    },
    manager: {
      canEditMenu: true,
      canManageUsers: false,
      canViewReports: true,
      canRefundOrders: true,
      canMarkOutOfStock: true,
      canAccessPOS: true,
      canAccessKitchen: true,
      canAccessOrders: true,
      canAccessReports: true,
      canAccessSettings: true
    },
    cashier: {
      canEditMenu: false,
      canManageUsers: false,
      canViewReports: false,
      canRefundOrders: false,
      canMarkOutOfStock: true,
      canAccessPOS: true,
      canAccessKitchen: false,
      canAccessOrders: true,
      canAccessReports: false,
      canAccessSettings: false
    },
    pos: {
      canEditMenu: false,
      canManageUsers: false,
      canViewReports: false,
      canRefundOrders: false,
      canMarkOutOfStock: false,
      canAccessPOS: true,
      canAccessKitchen: false,
      canAccessOrders: true,
      canAccessReports: false,
      canAccessSettings: false
    },
    kitchen: {
      canEditMenu: false,
      canManageUsers: false,
      canViewReports: false,
      canRefundOrders: false,
      canMarkOutOfStock: false,
      canAccessPOS: false,
      canAccessKitchen: true,
      canAccessOrders: false,
      canAccessReports: false,
      canAccessSettings: false
    }
  };
  
  if (rolePermissions[this.role]) {
    this.permissions = rolePermissions[this.role];
  }
  
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('User', userSchema);
