const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['home', 'work', 'other'],
    default: 'home'
  },
  street: String,
  city: String,
  state: String,
  zipCode: String,
  isDefault: Boolean
});

const preferenceSchema = new mongoose.Schema({
  dietary: [String],
  cuisines: [String],
  favoriteItems: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MenuItem'
  }],
  seatingPreference: String,
  allergies: [String]
});

const loyaltySchema = new mongoose.Schema({
  tier: {
    type: String,
    enum: ['bronze', 'silver', 'gold', 'platinum'],
    default: 'bronze'
  },
  points: {
    type: Number,
    default: 0
  },
  lifetimePoints: {
    type: Number,
    default: 0
  },
  lifetimeSpend: {
    type: Number,
    default: 0
  },
  joinDate: {
    type: Date,
    default: Date.now
  },
  lastActivity: Date,
  rewards: [{
    name: String,
    description: String,
    pointsRequired: Number,
    redeemedAt: Date,
    expiresAt: Date,
    code: String,
    used: Boolean
  }],
  referralCode: String
});

const customerSchema = new mongoose.Schema({
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  name: {
    type: String,
    required: true
  },
  email: String,
  phone: {
    type: String,
    required: true
  },
  dateOfBirth: Date,
  anniversary: Date,
  gender: String,
  addresses: [addressSchema],
  preferences: preferenceSchema,
  loyalty: loyaltySchema,
  tags: [String],
  notes: String,
  source: {
    type: String,
    enum: ['walk-in', 'online', 'referral'],
    default: 'walk-in'
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  statistics: {
    totalOrders: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    averageOrderValue: { type: Number, default: 0 },
    lastVisit: Date,
    favoriteItems: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MenuItem'
    }]
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

const giftCardSchema = new mongoose.Schema({
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true
  },
  cardNumber: {
    type: String,
    required: true,
    unique: true
  },
  pin: String,
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  initialBalance: {
    type: Number,
    required: true,
    min: 0
  },
  currentBalance: {
    type: Number,
    required: true,
    min: 0
  },
  type: {
    type: String,
    enum: ['physical', 'digital'],
    default: 'digital'
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'expired'],
    default: 'active'
  },
  issuedDate: {
    type: Date,
    default: Date.now
  },
  expiryDate: Date,
  transactions: [{
    type: {
      type: String,
      enum: ['issue', 'redeem', 'reload']
    },
    amount: Number,
    balance: Number,
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    timestamp: Date
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes
customerSchema.index({ locationId: 1, phone: 1 }, { unique: true });
customerSchema.index({ locationId: 1, email: 1 });
customerSchema.index({ 'loyalty.tier': 1 });

// Methods
customerSchema.methods.addLoyaltyPoints = async function(points) {
  this.loyalty.points += points;
  this.loyalty.lifetimePoints += points;
  this.loyalty.lastActivity = new Date();
  
  // Update tier based on points
  if (this.loyalty.lifetimePoints >= 2000) {
    this.loyalty.tier = 'platinum';
  } else if (this.loyalty.lifetimePoints >= 1000) {
    this.loyalty.tier = 'gold';
  } else if (this.loyalty.lifetimePoints >= 500) {
    this.loyalty.tier = 'silver';
  }
  
  await this.save();
  return this.loyalty;
};

customerSchema.methods.redeemLoyaltyPoints = async function(points, reward) {
  if (this.loyalty.points < points) {
    throw new Error('Insufficient points');
  }
  
  this.loyalty.points -= points;
  this.loyalty.rewards.push({
    ...reward,
    redeemedAt: new Date(),
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    code: `REWARD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
  });
  
  await this.save();
  return this.loyalty;
};

const Customer = mongoose.model('Customer', customerSchema);
const GiftCard = mongoose.model('GiftCard', giftCardSchema);

module.exports = { Customer, GiftCard };