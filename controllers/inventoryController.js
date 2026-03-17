const { 
  Ingredient, 
  InventoryTransaction, 
  Supplier, 
  PurchaseOrder 
} = require('../models/Inventory');
const { AppError, catchAsync } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

// @desc    Get all inventory items
// @route   GET /api/inventory
// @access  Private
exports.getInventory = catchAsync(async (req, res) => {
  const { category, status, search, locationId } = req.query;
  const query = { locationId: locationId || req.user.location };

  if (category) query.category = category;
  if (status) query.status = status;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { 'supplierInfo.sku': { $regex: search, $options: 'i' } }
    ];
  }

  const items = await Ingredient.find(query)
    .populate('supplierInfo.primarySupplier', 'name')
    .sort('category name');

  res.json({
    success: true,
    count: items.length,
    data: items
  });
});

// @desc    Get low stock items
// @route   GET /api/inventory/low-stock
// @access  Private
exports.getLowStock = catchAsync(async (req, res) => {
  const { locationId } = req.query;
  
  const items = await Ingredient.find({
    locationId: locationId || req.user.location,
    $expr: { $lte: [ '$quantity', '$minQuantity' ] }
  }).sort('quantity');

  res.json({
    success: true,
    data: items
  });
});

// @desc    Get expiring items
// @route   GET /api/inventory/expiring
// @access  Private
exports.getExpiringItems = catchAsync(async (req, res) => {
  const { days = 30, locationId } = req.query;
  
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + parseInt(days));

  const items = await Ingredient.find({
    locationId: locationId || req.user.location,
    expiryDate: { $lte: futureDate, $gte: new Date() }
  }).sort('expiryDate');

  res.json({
    success: true,
    data: items
  });
});

// @desc    Get ingredient by ID
// @route   GET /api/inventory/:id
// @access  Private
exports.getIngredientById = catchAsync(async (req, res) => {
  const ingredient = await Ingredient.findById(req.params.id)
    .populate('supplierInfo.primarySupplier');

  if (!ingredient) {
    throw new AppError('Ingredient not found', 404);
  }

  // Get recent transactions
  const transactions = await InventoryTransaction.find({ 
    ingredientId: ingredient._id 
  })
  .sort('-createdAt')
  .limit(20)
  .populate('performedBy', 'name');

  res.json({
    success: true,
    data: {
      ingredient,
      transactions
    }
  });
});

// @desc    Create ingredient
// @route   POST /api/inventory
// @access  Private (Manager/Admin)
exports.createIngredient = catchAsync(async (req, res) => {
  const ingredientData = {
    ...req.body,
    locationId: req.body.locationId || req.user.location,
    createdBy: req.user._id
  };

  const ingredient = await Ingredient.create(ingredientData);

  // Create initial transaction
  if (ingredient.quantity > 0) {
    await InventoryTransaction.create({
      locationId: ingredient.locationId,
      ingredientId: ingredient._id,
      type: 'purchase',
      quantity: ingredient.quantity,
      previousQuantity: 0,
      newQuantity: ingredient.quantity,
      unit: ingredient.unit,
      cost: ingredient.cost?.current,
      totalCost: ingredient.quantity * (ingredient.cost?.current || 0),
      performedBy: req.user._id
    });
  }

  logger.audit('INGREDIENT_CREATED', req.user._id, {
    ingredientId: ingredient._id,
    name: ingredient.name
  });

  res.status(201).json({
    success: true,
    data: ingredient
  });
});

// @desc    Update ingredient
// @route   PATCH /api/inventory/:id
// @access  Private (Manager/Admin)
exports.updateIngredient = catchAsync(async (req, res) => {
  const ingredient = await Ingredient.findById(req.params.id);

  if (!ingredient) {
    throw new AppError('Ingredient not found', 404);
  }

  const allowedUpdates = [
    'name', 'category', 'description', 'unit', 'minQuantity',
    'maxQuantity', 'reorderPoint', 'reorderQuantity', 'cost',
    'sellingPrice', 'supplierInfo', 'storage', 'expiryDate',
    'barcode', 'status'
  ];

  allowedUpdates.forEach(field => {
    if (req.body[field] !== undefined) {
      ingredient[field] = req.body[field];
    }
  });

  await ingredient.save();

  logger.audit('INGREDIENT_UPDATED', req.user._id, {
    ingredientId: ingredient._id,
    changes: req.body
  });

  res.json({
    success: true,
    data: ingredient
  });
});

// @desc    Adjust inventory quantity
// @route   POST /api/inventory/:id/adjust
// @access  Private (Manager/Admin)
exports.adjustInventory = catchAsync(async (req, res) => {
  const { quantity, reason } = req.body;
  const ingredient = await Ingredient.findById(req.params.id);

  if (!ingredient) {
    throw new AppError('Ingredient not found', 404);
  }

  const previousQuantity = ingredient.quantity;
  ingredient.quantity = quantity;

  // Create transaction record
  await InventoryTransaction.create({
    locationId: ingredient.locationId,
    ingredientId: ingredient._id,
    type: 'adjustment',
    quantity: quantity - previousQuantity,
    previousQuantity,
    newQuantity: quantity,
    unit: ingredient.unit,
    cost: ingredient.cost?.current,
    reference: { reason },
    performedBy: req.user._id
  });

  await ingredient.save();

  res.json({
    success: true,
    data: ingredient
  });
});

// @desc    Delete ingredient
// @route   DELETE /api/inventory/:id
// @access  Private (Manager/Admin)
exports.deleteIngredient = catchAsync(async (req, res) => {
  const ingredient = await Ingredient.findById(req.params.id);

  if (!ingredient) {
    throw new AppError('Ingredient not found', 404);
  }

  await ingredient.deleteOne();

  logger.audit('INGREDIENT_DELETED', req.user._id, {
    ingredientId: ingredient._id,
    name: ingredient.name
  });

  res.json({
    success: true,
    message: 'Ingredient deleted successfully'
  });
});

// @desc    Get inventory transactions
// @route   GET /api/inventory/transactions
// @access  Private
exports.getTransactions = catchAsync(async (req, res) => {
  const { 
    ingredientId, 
    type, 
    startDate, 
    endDate,
    page = 1,
    limit = 50 
  } = req.query;

  const query = { locationId: req.user.location };

  if (ingredientId) query.ingredientId = ingredientId;
  if (type) query.type = type;
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const options = {
    skip: (page - 1) * limit,
    limit: parseInt(limit),
    sort: '-createdAt',
    populate: [
      { path: 'ingredientId', select: 'name unit' },
      { path: 'performedBy', select: 'name' }
    ]
  };

  const transactions = await InventoryTransaction.find(query, null, options);
  const total = await InventoryTransaction.countDocuments(query);

  res.json({
    success: true,
    data: transactions,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total
    }
  });
});

// @desc    Get all suppliers
// @route   GET /api/inventory/suppliers
// @access  Private
exports.getSuppliers = catchAsync(async (req, res) => {
  const { locationId } = req.query;
  
  const suppliers = await Supplier.find({ 
    locationId: locationId || req.user.location 
  }).sort('name');

  res.json({
    success: true,
    data: suppliers
  });
});

// @desc    Create supplier
// @route   POST /api/inventory/suppliers
// @access  Private (Manager/Admin)
exports.createSupplier = catchAsync(async (req, res) => {
  const supplierData = {
    ...req.body,
    locationId: req.body.locationId || req.user.location,
    createdBy: req.user._id
  };

  const supplier = await Supplier.create(supplierData);

  res.status(201).json({
    success: true,
    data: supplier
  });
});

// @desc    Update supplier
// @route   PATCH /api/inventory/suppliers/:id
// @access  Private (Manager/Admin)
exports.updateSupplier = catchAsync(async (req, res) => {
  const supplier = await Supplier.findById(req.params.id);

  if (!supplier) {
    throw new AppError('Supplier not found', 404);
  }

  const allowedUpdates = [
    'name', 'contactPerson', 'email', 'phone', 'address',
    'paymentTerms', 'leadTime', 'categories', 'status'
  ];

  allowedUpdates.forEach(field => {
    if (req.body[field] !== undefined) {
      supplier[field] = req.body[field];
    }
  });

  await supplier.save();

  res.json({
    success: true,
    data: supplier
  });
});

// @desc    Get purchase orders
// @route   GET /api/inventory/purchase-orders
// @access  Private
exports.getPurchaseOrders = catchAsync(async (req, res) => {
  const { status, supplierId, page = 1, limit = 20 } = req.query;
  
  const query = { locationId: req.user.location };

  if (status) query.status = status;
  if (supplierId) query.supplierId = supplierId;

  const options = {
    skip: (page - 1) * limit,
    limit: parseInt(limit),
    sort: '-createdAt',
    populate: [
      { path: 'supplierId', select: 'name' },
      { path: 'createdBy', select: 'name' }
    ]
  };

  const orders = await PurchaseOrder.find(query, null, options);
  const total = await PurchaseOrder.countDocuments(query);

  res.json({
    success: true,
    data: orders,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total
    }
  });
});

// @desc    Create purchase order
// @route   POST /api/inventory/purchase-orders
// @access  Private (Manager/Admin)
exports.createPurchaseOrder = catchAsync(async (req, res) => {
  const poData = {
    ...req.body,
    locationId: req.body.locationId || req.user.location,
    createdBy: req.user._id,
    poNumber: `PO-${Date.now()}`
  };

  // Calculate totals
  poData.subtotal = poData.items.reduce((sum, item) => sum + item.totalPrice, 0);
  poData.total = poData.subtotal + (poData.tax || 0);

  const purchaseOrder = await PurchaseOrder.create(poData);

  logger.audit('PURCHASE_ORDER_CREATED', req.user._id, {
    poId: purchaseOrder._id,
    poNumber: purchaseOrder.poNumber
  });

  res.status(201).json({
    success: true,
    data: purchaseOrder
  });
});

// @desc    Receive purchase order
// @route   POST /api/inventory/purchase-orders/:id/receive
// @access  Private (Manager/Admin)
exports.receivePurchaseOrder = catchAsync(async (req, res) => {
  const purchaseOrder = await PurchaseOrder.findById(req.params.id);

  if (!purchaseOrder) {
    throw new AppError('Purchase order not found', 404);
  }

  purchaseOrder.status = 'received';
  purchaseOrder.receivedDate = new Date();
  await purchaseOrder.save();

  // Update inventory for each item
  for (const item of purchaseOrder.items) {
    const ingredient = await Ingredient.findById(item.ingredientId);
    if (ingredient) {
      const previousQuantity = ingredient.quantity;
      ingredient.quantity += item.quantity;
      
      // Update average cost
      if (ingredient.cost) {
        const totalCost = (ingredient.cost.average * previousQuantity) + item.totalPrice;
        const newQuantity = previousQuantity + item.quantity;
        ingredient.cost.average = totalCost / newQuantity;
        ingredient.cost.last = item.price;
        ingredient.cost.current = ingredient.cost.average;
      }

      await ingredient.save();

      // Create transaction record
      await InventoryTransaction.create({
        locationId: ingredient.locationId,
        ingredientId: ingredient._id,
        type: 'purchase',
        quantity: item.quantity,
        previousQuantity,
        newQuantity: ingredient.quantity,
        unit: item.unit,
        cost: item.price,
        totalCost: item.totalPrice,
        reference: { purchaseOrderId: purchaseOrder._id },
        performedBy: req.user._id
      });
    }
  }

  res.json({
    success: true,
    data: purchaseOrder
  });
});