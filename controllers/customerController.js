const { Customer, GiftCard } = require('../models/Customer');
const { AppError, catchAsync } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

// @desc    Get all customers
// @route   GET /api/customers
// @access  Private
exports.getCustomers = catchAsync(async (req, res) => {
  const { 
    page = 1, 
    limit = 20, 
    search, 
    tier,
    locationId 
  } = req.query;

  const query = { locationId: locationId || req.user.location };

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ];
  }

  if (tier) query['loyalty.tier'] = tier;

  const options = {
    skip: (page - 1) * limit,
    limit: parseInt(limit),
    sort: '-createdAt'
  };

  const customers = await Customer.find(query, null, options);
  const total = await Customer.countDocuments(query);

  res.json({
    success: true,
    data: customers,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

// @desc    Search customers
// @route   GET /api/customers/search
// @access  Private
exports.searchCustomers = catchAsync(async (req, res) => {
  const { q, locationId } = req.query;

  if (!q) {
    return res.json({ success: true, data: [] });
  }

  const customers = await Customer.find({
    locationId: locationId || req.user.location,
    $or: [
      { name: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
      { phone: { $regex: q, $options: 'i' } }
    ]
  }).limit(20);

  res.json({
    success: true,
    data: customers
  });
});

// @desc    Get birthday customers
// @route   GET /api/customers/birthdays
// @access  Private
exports.getBirthdayCustomers = catchAsync(async (req, res) => {
  const { month, locationId } = req.query;
  const targetMonth = month ? parseInt(month) : new Date().getMonth() + 1;

  const customers = await Customer.find({
    locationId: locationId || req.user.location,
    $expr: {
      $eq: [{ $month: '$dateOfBirth' }, targetMonth]
    }
  });

  res.json({
    success: true,
    data: customers
  });
});

// @desc    Get customer by ID
// @route   GET /api/customers/:id
// @access  Private
exports.getCustomerById = catchAsync(async (req, res) => {
  const customer = await Customer.findById(req.params.id)
    .populate('statistics.favoriteItems');

  if (!customer) {
    throw new AppError('Customer not found', 404);
  }

  // Get recent orders
  const Order = require('../models/Order');
  const recentOrders = await Order.find({ 
    customerId: customer._id 
  })
  .sort('-createdAt')
  .limit(10);

  res.json({
    success: true,
    data: {
      customer,
      recentOrders
    }
  });
});

// @desc    Create customer
// @route   POST /api/customers
// @access  Private
exports.createCustomer = catchAsync(async (req, res) => {
  const customerData = {
    ...req.body,
    locationId: req.body.locationId || req.user.location,
    createdBy: req.user._id
  };

  // Check if customer already exists with same phone/email
  const existingCustomer = await Customer.findOne({
    locationId: customerData.locationId,
    $or: [
      { phone: customerData.phone },
      { email: customerData.email }
    ]
  });

  if (existingCustomer) {
    throw new AppError('Customer with this phone or email already exists', 400);
  }

  const customer = await Customer.create(customerData);

  logger.audit('CUSTOMER_CREATED', req.user._id, {
    customerId: customer._id,
    name: customer.name
  });

  res.status(201).json({
    success: true,
    data: customer
  });
});

// @desc    Update customer
// @route   PATCH /api/customers/:id
// @access  Private
exports.updateCustomer = catchAsync(async (req, res) => {
  const customer = await Customer.findById(req.params.id);

  if (!customer) {
    throw new AppError('Customer not found', 404);
  }

  const allowedUpdates = [
    'name', 'email', 'phone', 'alternatePhone', 'dateOfBirth',
    'anniversary', 'gender', 'addresses', 'preferences', 'tags',
    'notes', 'status'
  ];

  allowedUpdates.forEach(field => {
    if (req.body[field] !== undefined) {
      customer[field] = req.body[field];
    }
  });

  await customer.save();

  logger.audit('CUSTOMER_UPDATED', req.user._id, {
    customerId: customer._id,
    changes: req.body
  });

  res.json({
    success: true,
    data: customer
  });
});

// @desc    Delete customer
// @route   DELETE /api/customers/:id
// @access  Private
exports.deleteCustomer = catchAsync(async (req, res) => {
  const customer = await Customer.findById(req.params.id);

  if (!customer) {
    throw new AppError('Customer not found', 404);
  }

  await customer.deleteOne();

  logger.audit('CUSTOMER_DELETED', req.user._id, {
    customerId: customer._id,
    name: customer.name
  });

  res.json({
    success: true,
    message: 'Customer deleted successfully'
  });
});

// @desc    Add loyalty points
// @route   POST /api/customers/:id/loyalty
// @access  Private
exports.addLoyaltyPoints = catchAsync(async (req, res) => {
  const { points } = req.body;
  const customer = await Customer.findById(req.params.id);

  if (!customer) {
    throw new AppError('Customer not found', 404);
  }

  await customer.addLoyaltyPoints(points);

  res.json({
    success: true,
    data: {
      points: customer.loyalty.points,
      tier: customer.loyalty.tier
    }
  });
});

// @desc    Redeem loyalty points
// @route   POST /api/customers/:id/loyalty/redeem
// @access  Private
exports.redeemLoyaltyPoints = catchAsync(async (req, res) => {
  const { points, reward } = req.body;
  const customer = await Customer.findById(req.params.id);

  if (!customer) {
    throw new AppError('Customer not found', 404);
  }

  await customer.redeemLoyaltyPoints(points, reward);

  res.json({
    success: true,
    data: {
      points: customer.loyalty.points,
      rewards: customer.loyalty.rewards
    }
  });
});

// @desc    Get all gift cards
// @route   GET /api/customers/gift-cards
// @access  Private
exports.getGiftCards = catchAsync(async (req, res) => {
  const { status, customerId, locationId } = req.query;

  const query = { locationId: locationId || req.user.location };

  if (status) query.status = status;
  if (customerId) query.customerId = customerId;

  const giftCards = await GiftCard.find(query)
    .populate('customerId', 'name email phone')
    .sort('-createdAt');

  res.json({
    success: true,
    data: giftCards
  });
});

// @desc    Issue gift card
// @route   POST /api/customers/gift-cards
// @access  Private
exports.issueGiftCard = catchAsync(async (req, res) => {
  const { amount, customerId, expiryDate, type = 'digital' } = req.body;

  // Generate unique card number
  const cardNumber = `GIFT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  const pin = Math.floor(1000 + Math.random() * 9000).toString();

  const giftCard = await GiftCard.create({
    cardNumber,
    pin,
    customerId,
    initialBalance: amount,
    currentBalance: amount,
    type,
    expiryDate,
    locationId: req.user.location,
    createdBy: req.user._id,
    transactions: [{
      type: 'issue',
      amount,
      balance: amount,
      timestamp: new Date()
    }]
  });

  logger.audit('GIFT_CARD_ISSUED', req.user._id, {
    cardId: giftCard._id,
    amount
  });

  res.status(201).json({
    success: true,
    data: giftCard
  });
});

// @desc    Redeem gift card
// @route   POST /api/customers/gift-cards/:id/redeem
// @access  Private
exports.redeemGiftCard = catchAsync(async (req, res) => {
  const { amount, orderId } = req.body;
  const giftCard = await GiftCard.findById(req.params.id);

  if (!giftCard) {
    throw new AppError('Gift card not found', 404);
  }

  if (giftCard.status !== 'active') {
    throw new AppError('Gift card is not active', 400);
  }

  if (giftCard.currentBalance < amount) {
    throw new AppError('Insufficient balance', 400);
  }

  if (giftCard.expiryDate && new Date(giftCard.expiryDate) < new Date()) {
    throw new AppError('Gift card has expired', 400);
  }

  giftCard.currentBalance -= amount;
  giftCard.lastUsed = new Date();

  giftCard.transactions.push({
    type: 'redeem',
    amount,
    balance: giftCard.currentBalance,
    orderId,
    timestamp: new Date()
  });

  await giftCard.save();

  res.json({
    success: true,
    data: {
      cardNumber: giftCard.cardNumber,
      redeemedAmount: amount,
      remainingBalance: giftCard.currentBalance
    }
  });
});

// @desc    Submit feedback
// @route   POST /api/customers/feedback
// @access  Public
exports.submitFeedback = catchAsync(async (req, res) => {
  const Feedback = require('../models/Customer').Feedback;
  
  const feedback = await Feedback.create({
    ...req.body,
    createdAt: new Date()
  });

  res.status(201).json({
    success: true,
    data: feedback
  });
});

// @desc    Get feedback
// @route   GET /api/customers/feedback
// @access  Private
exports.getFeedback = catchAsync(async (req, res) => {
  const Feedback = require('../models/Customer').Feedback;
  
  const { 
    rating, 
    startDate, 
    endDate,
    page = 1,
    limit = 20,
    locationId 
  } = req.query;

  const query = { locationId: locationId || req.user.location };

  if (rating) query.rating = rating;
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const options = {
    skip: (page - 1) * limit,
    limit: parseInt(limit),
    sort: '-createdAt',
    populate: 'customerId'
  };

  const feedback = await Feedback.find(query, null, options);
  const total = await Feedback.countDocuments(query);

  res.json({
    success: true,
    data: feedback,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total
    }
  });
});