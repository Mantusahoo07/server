const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// Validation rules
const loginValidation = [
  body('email').optional().isEmail().normalizeEmail(),
  body('username').optional(),
  body('password').notEmpty()
];

const registerValidation = [
  body('username').notEmpty().isLength({ min: 3 }),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').notEmpty(),
  body('phone').optional()
];

// Routes
router.post('/login', loginValidation, authController.login);
router.post('/register', registerValidation, authController.register);
router.post('/refresh', authController.refreshToken);
router.post('/logout', authenticate, authController.logout);
router.post('/change-password', authenticate, authController.changePassword);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.get('/me', authenticate, authController.getCurrentUser);
router.get('/validate', authenticate, authController.validateToken);
router.get('/permissions', authenticate, authController.getPermissions);
router.put('/profile', authenticate, authController.updateProfile);

module.exports = router;
