const generateOrderNumber = (locationId, date = new Date()) => {
  const year = date.getFullYear().toString().substr(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  
  return `ORD-${year}${month}${day}-${random}`;
};

const generateInvoiceNumber = (orderNumber) => {
  return `INV-${orderNumber.substring(4)}`;
};

const calculateTax = (amount, taxRate) => {
  return amount * (taxRate / 100);
};

const calculateDiscount = (amount, discount, type = 'percentage') => {
  if (type === 'percentage') {
    return amount * (discount / 100);
  }
  return discount;
};

const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(amount);
};

const parseDate = (dateString) => {
  if (!dateString) return null;
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? null : date;
};

const getStartOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getEndOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const paginate = (page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  return { skip, limit: Math.min(limit, 100) };
};

module.exports = {
  generateOrderNumber,
  generateInvoiceNumber,
  calculateTax,
  calculateDiscount,
  formatCurrency,
  parseDate,
  getStartOfDay,
  getEndOfDay,
  paginate
};