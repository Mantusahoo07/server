const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const customerController = require('../controllers/customerController');
const { checkPermission } = require('../middleware/auth');

// Customer routes
router.get('/',
  checkPermission('view_customers'),
  customerController.getCustomers
);

router.get('/search',
  checkPermission('view_customers'),
  customerController.searchCustomers
);

router.get('/birthdays',
  checkPermission('view_customers'),
  customerController.getBirthdayCustomers
);

router.get('/:id',
  checkPermission('view_customers'),
  param('id').isMongoId(),
  customerController.getCustomerById
);

router.post('/',
  checkPermission('create_customers'),
  customerController.createCustomer
);

router.patch('/:id',
  checkPermission('update_customers'),
  param('id').isMongoId(),
  customerController.updateCustomer
);

router.delete('/:id',
  checkPermission('delete_customers'),
  param('id').isMongoId(),
  customerController.deleteCustomer
);

// Loyalty routes
router.post('/:id/loyalty',
  checkPermission('manage_loyalty'),
  param('id').isMongoId(),
  body('points').isInt({ min: 1 }),
  customerController.addLoyaltyPoints
);

router.post('/:id/loyalty/redeem',
  checkPermission('manage_loyalty'),
  param('id').isMongoId(),
  body('points').isInt({ min: 1 }),
  customerController.redeemLoyaltyPoints
);

// Gift card routes
router.get('/gift-cards',
  checkPermission('view_gift_cards'),
  customerController.getGiftCards
);

router.post('/gift-cards',
  checkPermission('issue_gift_cards'),
  customerController.issueGiftCard
);

router.post('/gift-cards/:id/redeem',
  checkPermission('redeem_gift_cards'),
  param('id').isMongoId(),
  body('amount').isFloat({ min: 0.01 }),
  customerController.redeemGiftCard
);

// Feedback routes
router.post('/feedback',
  customerController.submitFeedback
);

router.get('/feedback',
  checkPermission('view_feedback'),
  customerController.getFeedback
);

module.exports = router;