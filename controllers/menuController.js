const { MenuItem, Category } = require('../models/Menu');
const { AppError, catchAsync } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

// @desc    Get all menu items
// @route   GET /api/menu
// @access  Private
exports.getMenuItems = catchAsync(async (req, res) => {
  const { category, available, search, locationId } = req.query;
  const query = { locationId: locationId || req.user.location };

  if (category) query.category = category;
  if (available !== undefined) query.available = available === 'true';
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  const items = await MenuItem.find(query).sort('category displayOrder');
  
  res.json({
    success: true,
    count: items.length,
    data: items
  });
});

// @desc    Get menu item by ID
// @route   GET /api/menu/:id
// @access  Private
exports.getMenuItemById = catchAsync(async (req, res) => {
  const item = await MenuItem.findById(req.params.id);

  if (!item) {
    throw new AppError('Menu item not found', 404);
  }

  res.json({
    success: true,
    data: item
  });
});

// @desc    Create menu item
// @route   POST /api/menu
// @access  Private (Manager/Admin)
exports.createMenuItem = catchAsync(async (req, res) => {
  const menuData = {
    ...req.body,
    locationId: req.body.locationId || req.user.location,
    createdBy: req.user._id
  };

  const menuItem = await MenuItem.create(menuData);

  logger.audit('MENU_ITEM_CREATED', req.user._id, {
    itemId: menuItem._id,
    name: menuItem.name
  });

  res.status(201).json({
    success: true,
    data: menuItem
  });
});

// @desc    Update menu item
// @route   PATCH /api/menu/:id
// @access  Private (Manager/Admin)
exports.updateMenuItem = catchAsync(async (req, res) => {
  const menuItem = await MenuItem.findById(req.params.id);

  if (!menuItem) {
    throw new AppError('Menu item not found', 404);
  }

  const allowedUpdates = [
    'name', 'description', 'price', 'compareAtPrice', 'cost',
    'category', 'subcategory', 'images', 'dietary', 'allergens',
    'nutritionalInfo', 'preparationTime', 'station', 'course',
    'modifierGroups', 'tags', 'available', 'availableFrom',
    'availableTo', 'availableDays', 'stockTracking', 'barcode',
    'sku', 'displayOrder', 'featured', 'popular', 'newItem'
  ];

  allowedUpdates.forEach(field => {
    if (req.body[field] !== undefined) {
      menuItem[field] = req.body[field];
    }
  });

  menuItem.updatedBy = req.user._id;
  await menuItem.save();

  logger.audit('MENU_ITEM_UPDATED', req.user._id, {
    itemId: menuItem._id,
    changes: req.body
  });

  res.json({
    success: true,
    data: menuItem
  });
});

// @desc    Update menu item availability
// @route   PATCH /api/menu/:id/availability
// @access  Private (Manager/Admin)
exports.updateAvailability = catchAsync(async (req, res) => {
  const { available } = req.body;
  const menuItem = await MenuItem.findById(req.params.id);

  if (!menuItem) {
    throw new AppError('Menu item not found', 404);
  }

  menuItem.available = available;
  menuItem.updatedBy = req.user._id;
  await menuItem.save();

  res.json({
    success: true,
    data: { available: menuItem.available }
  });
});

// @desc    Delete menu item
// @route   DELETE /api/menu/:id
// @access  Private (Manager/Admin)
exports.deleteMenuItem = catchAsync(async (req, res) => {
  const menuItem = await MenuItem.findById(req.params.id);

  if (!menuItem) {
    throw new AppError('Menu item not found', 404);
  }

  await menuItem.deleteOne();

  logger.audit('MENU_ITEM_DELETED', req.user._id, {
    itemId: menuItem._id,
    name: menuItem.name
  });

  res.json({
    success: true,
    message: 'Menu item deleted successfully'
  });
});

// @desc    Get all categories
// @route   GET /api/menu/categories
// @access  Private
exports.getCategories = catchAsync(async (req, res) => {
  const { locationId } = req.query;
  const query = { locationId: locationId || req.user.location };

  const categories = await Category.find(query).sort('displayOrder');

  res.json({
    success: true,
    data: categories
  });
});

// @desc    Get menu structure (grouped by category)
// @route   GET /api/menu/structure
// @access  Private
exports.getMenuStructure = catchAsync(async (req, res) => {
  const { locationId } = req.query;
  const query = { locationId: locationId || req.user.location, available: true };

  const items = await MenuItem.find(query).sort('category displayOrder');
  
  const structure = {};

  items.forEach(item => {
    if (!structure[item.category]) {
      structure[item.category] = {
        name: item.category,
        items: []
      };
    }
    structure[item.category].items.push(item);
  });

  res.json({
    success: true,
    data: structure
  });
});

// @desc    Create category
// @route   POST /api/menu/categories
// @access  Private (Manager/Admin)
exports.createCategory = catchAsync(async (req, res) => {
  const { name, description, image, displayOrder } = req.body;

  const category = await Category.create({
    name,
    description,
    image,
    displayOrder,
    locationId: req.user.location,
    createdBy: req.user._id
  });

  res.status(201).json({
    success: true,
    data: category
  });
});

// @desc    Update category
// @route   PUT /api/menu/categories/:id
// @access  Private (Manager/Admin)
exports.updateCategory = catchAsync(async (req, res) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    throw new AppError('Category not found', 404);
  }

  const allowedUpdates = ['name', 'description', 'image', 'displayOrder', 'isActive'];
  
  allowedUpdates.forEach(field => {
    if (req.body[field] !== undefined) {
      category[field] = req.body[field];
    }
  });

  await category.save();

  res.json({
    success: true,
    data: category
  });
});

// @desc    Delete category
// @route   DELETE /api/menu/categories/:id
// @access  Private (Manager/Admin)
exports.deleteCategory = catchAsync(async (req, res) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    throw new AppError('Category not found', 404);
  }

  // Check if category has items
  const itemsCount = await MenuItem.countDocuments({ 
    category: category.name,
    locationId: req.user.location 
  });

  if (itemsCount > 0) {
    throw new AppError('Cannot delete category with existing menu items', 400);
  }

  await category.deleteOne();

  res.json({
    success: true,
    message: 'Category deleted successfully'
  });
});