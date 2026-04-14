import { body, param, validationResult } from 'express-validator';

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

export const orderValidation = {
  create: [
    body('items').isArray().withMessage('Items must be an array').notEmpty(),
    body('items.*.id').notEmpty().withMessage('Item ID is required'),
    body('items.*.name').notEmpty().withMessage('Item name is required'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('items.*.price').isFloat({ min: 0 }).withMessage('Price must be positive'),
    body('orderType').isIn(['dine-in', 'pickup', 'takeaway', 'delivery']),
    body('total').isFloat({ min: 0 })
  ],
  updateStatus: [
    param('id').isMongoId().withMessage('Invalid order ID'),
    body('status').isIn(['pending', 'accepted', 'preparing', 'completed', 'cancelled', 'hold', 'ready_for_billing'])
  ]
};

export const menuValidation = {
  create: [
    body('name').notEmpty().withMessage('Item name is required').trim().isLength({ min: 2, max: 100 }),
    body('price').isFloat({ min: 0 }).withMessage('Price must be positive'),
    body('category').notEmpty().withMessage('Category is required')
  ]
};

export const categoryValidation = {
  create: [
    body('name').notEmpty().withMessage('Category name is required').trim().isLength({ min: 2, max: 50 })
  ]
};

export const userValidation = {
  register: [
    body('username').notEmpty().trim().isLength({ min: 3, max: 30 }),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').optional().isIn(['admin', 'manager', 'cashier', 'pos', 'kitchen'])
  ],
  login: [
    body('username').notEmpty(),
    body('password').notEmpty()
  ]
};

export const tableValidation = {
  create: [
    body('tableNumber').isInt({ min: 1, max: 100 }).withMessage('Table number must be between 1 and 100'),
    body('capacity').optional().isInt({ min: 1, max: 20 })
  ]
};