const { body, param, query, validationResult } = require('express-validator');
const { AppError } = require('./errorHandler');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400, errors.array());
  }
  next();
};

// Order validation rules
const orderValidation = [
  body('orderType').isIn(['dine-in', 'takeaway', 'delivery', 'curbside']),
  body('items').isArray().notEmpty(),
  body('items.*.menuItemId').isMongoId(),
  body('items.*.quantity').isInt({ min: 1 }),
  body('items.*.price').isFloat({ min: 0 }),
  validate
];

// Menu item validation
const menuItemValidation = [
  body('name').notEmpty().trim(),
  body('price').isFloat({ min: 0 }),
  body('category').notEmpty(),
  validate
];

// Customer validation
const customerValidation = [
  body('name').notEmpty().trim(),
  body('phone').optional().isMobilePhone(),
  body('email').optional().isEmail(),
  validate
];

// Employee validation
const employeeValidation = [
  body('name').notEmpty().trim(),
  body('email').isEmail(),
  body('employeeId').notEmpty(),
  body('role').isIn(['admin', 'manager', 'cashier', 'server', 'chef', 'kitchen']),
  validate
];

// Inventory validation
const inventoryValidation = [
  body('name').notEmpty().trim(),
  body('category').notEmpty(),
  body('unit').notEmpty(),
  body('quantity').isFloat({ min: 0 }),
  body('minQuantity').isFloat({ min: 0 }),
  validate
];

// ID param validation
const idParamValidation = [
  param('id').isMongoId(),
  validate
];

const locationIdParamValidation = [
  param('locationId').isMongoId(),
  validate
];

const paginationValidation = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validate
];

module.exports = {
  validate,
  orderValidation,
  menuItemValidation,
  customerValidation,
  employeeValidation,
  inventoryValidation,
  idParamValidation,
  locationIdParamValidation,
  paginationValidation
};