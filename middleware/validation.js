import { body, param, query, validationResult } from 'express-validator';

// Validation result handler
export const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));
    
    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }
    
    res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.param,
        message: err.msg
      }))
    });
  };
};

// Order validation rules
export const orderValidation = {
  create: [
    body('items').isArray().withMessage('Items must be an array').notEmpty().withMessage('Order must have at least one item'),
    body('items.*.id').notEmpty().withMessage('Item ID is required'),
    body('items.*.name').notEmpty().withMessage('Item name is required'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('items.*.price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
    body('orderType').isIn(['dine-in', 'pickup', 'takeaway', 'delivery']).withMessage('Invalid order type'),
    body('total').isFloat({ min: 0 }).withMessage('Total must be a positive number'),
    body('tableNumber').optional().isInt({ min: 1, max: 100 }).withMessage('Table number must be between 1 and 100')
  ],
  updateStatus: [
    param('id').isMongoId().withMessage('Invalid order ID'),
    body('status').isIn(['pending', 'accepted', 'preparing', 'completed', 'cancelled', 'hold', 'ready_for_billing']).withMessage('Invalid status')
  ],
  addItem: [
    param('id').isMongoId().withMessage('Invalid order ID'),
    body('item').isObject().withMessage('Item object is required'),
    body('item.id').notEmpty().withMessage('Item ID is required'),
    body('item.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1')
  ]
};

// Menu item validation
export const menuValidation = {
  create: [
    body('name').notEmpty().withMessage('Item name is required').trim().isLength({ min: 2, max: 100 }),
    body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
    body('category').notEmpty().withMessage('Category is required'),
    body('prepTime').optional().isInt({ min: 0, max: 180 }).withMessage('Prep time must be between 0 and 180 minutes')
  ],
  update: [
    param('id').isMongoId().withMessage('Invalid menu item ID'),
    body('name').optional().trim().isLength({ min: 2, max: 100 }),
    body('price').optional().isFloat({ min: 0 }),
    body('available').optional().isBoolean()
  ]
};

// Category validation
export const categoryValidation = {
  create: [
    body('name').notEmpty().withMessage('Category name is required').trim().isLength({ min: 2, max: 50 }),
    body('sortOrder').optional().isInt({ min: 0 })
  ],
  update: [
    param('id').isMongoId().withMessage('Invalid category ID'),
    body('name').optional().trim().isLength({ min: 2, max: 50 })
  ]
};

// User validation
export const userValidation = {
  register: [
    body('username').notEmpty().withMessage('Username is required').trim().isLength({ min: 3, max: 30 }),
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').optional().isIn(['admin', 'manager', 'cashier', 'pos', 'kitchen'])
  ],
  login: [
    body('username').notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required')
  ]
};

// Table validation
export const tableValidation = {
  create: [
    body('tableNumber').isInt({ min: 1, max: 100 }).withMessage('Table number must be between 1 and 100'),
    body('capacity').optional().isInt({ min: 1, max: 20 }).withMessage('Capacity must be between 1 and 20')
  ]
};
