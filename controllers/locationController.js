const Location = require('../models/Location');
const { AppError, catchAsync } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

// @desc    Get all locations
// @route   GET /api/locations
// @access  Private
exports.getLocations = catchAsync(async (req, res) => {
  // Admin can see all locations, others see only their accessible locations
  let query = {};
  
  if (req.user.role !== 'admin') {
    query = { _id: { $in: req.user.accessibleLocations } };
  }

  const locations = await Location.find(query)
    .populate('manager', 'name email')
    .sort('name');

  res.json({
    success: true,
    data: locations
  });
});

// @desc    Get location by ID
// @route   GET /api/locations/:id
// @access  Private
exports.getLocationById = catchAsync(async (req, res) => {
  const location = await Location.findById(req.params.id)
    .populate('manager', 'name email');

  if (!location) {
    throw new AppError('Location not found', 404);
  }

  res.json({
    success: true,
    data: location
  });
});

// @desc    Create location
// @route   POST /api/locations
// @access  Private (Admin only)
exports.createLocation = catchAsync(async (req, res) => {
  const locationData = {
    ...req.body,
    createdBy: req.user._id
  };

  // Check if location code already exists
  const existingLocation = await Location.findOne({ code: locationData.code });
  if (existingLocation) {
    throw new AppError('Location code already exists', 400);
  }

  const location = await Location.create(locationData);

  logger.audit('LOCATION_CREATED', req.user._id, {
    locationId: location._id,
    name: location.name,
    code: location.code
  });

  res.status(201).json({
    success: true,
    data: location
  });
});

// @desc    Update location
// @route   PATCH /api/locations/:id
// @access  Private (Admin only)
exports.updateLocation = catchAsync(async (req, res) => {
  const location = await Location.findById(req.params.id);

  if (!location) {
    throw new AppError('Location not found', 404);
  }

  const allowedUpdates = [
    'name', 'address', 'phone', 'email', 'manager',
    'openingTime', 'closingTime', 'timezone', 'currency',
    'taxRate', 'serviceCharge', 'settings', 'status'
  ];

  allowedUpdates.forEach(field => {
    if (req.body[field] !== undefined) {
      location[field] = req.body[field];
    }
  });

  await location.save();

  logger.audit('LOCATION_UPDATED', req.user._id, {
    locationId: location._id,
    changes: req.body
  });

  res.json({
    success: true,
    data: location
  });
});

// @desc    Delete location
// @route   DELETE /api/locations/:id
// @access  Private (Admin only)
exports.deleteLocation = catchAsync(async (req, res) => {
  const location = await Location.findById(req.params.id);

  if (!location) {
    throw new AppError('Location not found', 404);
  }

  // Check if location has active data
  const Order = require('../models/Order');
  const Employee = require('../models/Employee');
  
  const activeOrders = await Order.countDocuments({ 
    locationId: location._id,
    orderStatus: { $in: ['pending', 'confirmed', 'preparing'] }
  });

  const activeEmployees = await Employee.countDocuments({ 
    locationId: location._id,
    status: 'active'
  });

  if (activeOrders > 0 || activeEmployees > 0) {
    throw new AppError('Cannot delete location with active orders or employees', 400);
  }

  await location.deleteOne();

  logger.audit('LOCATION_DELETED', req.user._id, {
    locationId: location._id,
    name: location.name
  });

  res.json({
    success: true,
    message: 'Location deleted successfully'
  });
});

// @desc    Get tables for a location
// @route   GET /api/locations/:locationId/tables
// @access  Private
exports.getTables = catchAsync(async (req, res) => {
  const location = await Location.findById(req.params.locationId);

  if (!location) {
    throw new AppError('Location not found', 404);
  }

  res.json({
    success: true,
    data: location.tables || []
  });
});

// @desc    Create table
// @route   POST /api/locations/:locationId/tables
// @access  Private (Manager/Admin)
exports.createTable = catchAsync(async (req, res) => {
  const location = await Location.findById(req.params.locationId);

  if (!location) {
    throw new AppError('Location not found', 404);
  }

  const tableData = {
    ...req.body,
    number: req.body.number || (location.tables?.length || 0) + 1
  };

  // Check if table number already exists
  if (location.tables?.some(t => t.number === tableData.number)) {
    throw new AppError(`Table number ${tableData.number} already exists`, 400);
  }

  if (!location.tables) {
    location.tables = [];
  }

  location.tables.push(tableData);
  await location.save();

  const newTable = location.tables[location.tables.length - 1];

  res.status(201).json({
    success: true,
    data: newTable
  });
});

// @desc    Update table
// @route   PATCH /api/locations/:locationId/tables/:tableId
// @access  Private (Manager/Admin)
exports.updateTable = catchAsync(async (req, res) => {
  const location = await Location.findById(req.params.locationId);

  if (!location) {
    throw new AppError('Location not found', 404);
  }

  const table = location.tables.id(req.params.tableId);
  if (!table) {
    throw new AppError('Table not found', 404);
  }

  const allowedUpdates = [
    'number', 'capacity', 'section', 'status',
    'position', 'shape', 'rotation'
  ];

  allowedUpdates.forEach(field => {
    if (req.body[field] !== undefined) {
      table[field] = req.body[field];
    }
  });

  await location.save();

  res.json({
    success: true,
    data: table
  });
});

// @desc    Delete table
// @route   DELETE /api/locations/:locationId/tables/:tableId
// @access  Private (Manager/Admin)
exports.deleteTable = catchAsync(async (req, res) => {
  const location = await Location.findById(req.params.locationId);

  if (!location) {
    throw new AppError('Location not found', 404);
  }

  const table = location.tables.id(req.params.tableId);
  if (!table) {
    throw new AppError('Table not found', 404);
  }

  // Check if table has active order
  if (table.status === 'occupied') {
    throw new AppError('Cannot delete table with active order', 400);
  }

  table.deleteOne();
  await location.save();

  res.json({
    success: true,
    message: 'Table deleted successfully'
  });
});

// @desc    Transfer stock between locations
// @route   POST /api/locations/transfers
// @access  Private (Manager/Admin)
exports.transferStock = catchAsync(async (req, res) => {
  const { fromLocationId, toLocationId, items, notes } = req.body;

  const [fromLocation, toLocation] = await Promise.all([
    Location.findById(fromLocationId),
    Location.findById(toLocationId)
  ]);

  if (!fromLocation || !toLocation) {
    throw new AppError('One or both locations not found', 404);
  }

  // Process each item transfer
  const transfers = [];
  for (const item of items) {
    // This would integrate with inventory system
    transfers.push({
      itemId: item.ingredientId,
      quantity: item.quantity,
      status: 'pending'
    });
  }

  const transfer = {
    id: `TR-${Date.now()}`,
    fromLocation: fromLocationId,
    toLocation: toLocationId,
    items: transfers,
    notes,
    status: 'pending',
    createdBy: req.user._id,
    createdAt: new Date()
  };

  // Save to a Transfer model (you'd need to create this)
  // For now, just return success

  logger.audit('STOCK_TRANSFER_INITIATED', req.user._id, {
    fromLocation: fromLocation.name,
    toLocation: toLocation.name,
    itemsCount: items.length
  });

  res.status(201).json({
    success: true,
    data: transfer
  });
});

// @desc    Get transfers
// @route   GET /api/locations/transfers
// @access  Private
exports.getTransfers = catchAsync(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;

  // This would query a Transfer model
  // For now, return empty array
  res.json({
    success: true,
    data: [],
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: 0
    }
  });
});