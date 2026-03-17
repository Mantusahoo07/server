module.exports = {
  // Order status
  ORDER_STATUS: {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    PREPARING: 'preparing',
    READY: 'ready',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
  },

  // Payment status
  PAYMENT_STATUS: {
    UNPAID: 'unpaid',
    PARTIALLY_PAID: 'partially_paid',
    PAID: 'paid',
    REFUNDED: 'refunded'
  },

  // Payment methods
  PAYMENT_METHODS: {
    CASH: 'cash',
    CARD: 'card',
    UPI: 'upi',
    WALLET: 'wallet',
    GIFT_CARD: 'giftcard'
  },

  // Order types
  ORDER_TYPES: {
    DINE_IN: 'dine-in',
    TAKEAWAY: 'takeaway',
    DELIVERY: 'delivery',
    CURBSIDE: 'curbside'
  },

  // Employee roles
  EMPLOYEE_ROLES: {
    ADMIN: 'admin',
    MANAGER: 'manager',
    CASHIER: 'cashier',
    SERVER: 'server',
    CHEF: 'chef',
    KITCHEN: 'kitchen',
    HOST: 'host',
    BARTENDER: 'bartender'
  },

  // Inventory categories
  INVENTORY_CATEGORIES: {
    PRODUCE: 'produce',
    MEAT: 'meat',
    DAIRY: 'dairy',
    DRY_GOODS: 'dry-goods',
    BEVERAGES: 'beverages',
    SUPPLIES: 'supplies'
  },

  // Units of measurement
  UNITS: {
    KG: 'kg',
    G: 'g',
    LB: 'lb',
    OZ: 'oz',
    L: 'l',
    ML: 'ml',
    PIECE: 'piece',
    DOZEN: 'dozen',
    CASE: 'case'
  },

  // Discount types
  DISCOUNT_TYPES: {
    PERCENTAGE: 'percentage',
    FIXED: 'fixed',
    COUPON: 'coupon'
  },

  // Tax types
  TAX_TYPES: {
    GST: 'gst',
    VAT: 'vat',
    SERVICE: 'service'
  },

  // Pagination defaults
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100
  },

  // Date formats
  DATE_FORMATS: {
    DISPLAY: 'MM/DD/YYYY',
    DISPLAY_TIME: 'MM/DD/YYYY HH:mm',
    API: 'YYYY-MM-DD',
    API_TIME: 'YYYY-MM-DDTHH:mm:ss'
  },

  // File upload limits
  UPLOAD_LIMITS: {
    MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
    ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif'],
    ALLOWED_DOC_TYPES: ['application/pdf']
  },

  // Cache durations (in seconds)
  CACHE_DURATION: {
    MENU: 300, // 5 minutes
    INVENTORY: 60, // 1 minute
    REPORTS: 3600, // 1 hour
    STATIC: 86400 // 24 hours
  },

  // Rate limiting
  RATE_LIMIT: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 100
  },

  // JWT expiration
  JWT_EXPIRY: {
    ACCESS: '7d',
    REFRESH: '30d',
    RESET: '1h'
  },

  // WebSocket events
  SOCKET_EVENTS: {
    ORDER_CREATED: 'order:created',
    ORDER_UPDATED: 'order:updated',
    ORDER_STATUS_CHANGED: 'order:status-changed',
    KITCHEN_ITEM_UPDATED: 'kitchen:item-updated',
    PAYMENT_ADDED: 'order:payment-added'
  },

  // Error codes
  ERROR_CODES: {
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
    INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
    PAYMENT_FAILED: 'PAYMENT_FAILED',
    SERVER_ERROR: 'SERVER_ERROR'
  }
};