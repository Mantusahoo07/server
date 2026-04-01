import mongoose from 'mongoose';

const businessDetailSchema = new mongoose.Schema({
  key: {
    type: String,
    default: 'business-details',
    unique: true
  },
  name: { type: String, default: 'RESTAURANT NAME' },
  address: { type: String, default: '123 Main Street, City, State - 123456' },
  phone: { type: String, default: '+91 9876543210' },
  email: { type: String, default: 'info@restaurant.com' },
  gst: { type: String, default: '27ABCDE1234F1Z5' },
  fssai: { type: String, default: '12345678901234' },
  upiId: { type: String, default: 'paytm.s1yxcay@pty' },
  logo: { type: String, default: '' },
  currencySymbol: { type: String, default: '₹' },
  taxLabel: { type: String, default: 'GST' },
  footerMessage: { type: String, default: 'Thank you for your business! Visit Again!' },
  // Print options
  printBusinessName: { type: Boolean, default: true },
  printAddress: { type: Boolean, default: true },
  printPhone: { type: Boolean, default: true },
  printEmail: { type: Boolean, default: true },
  printGst: { type: Boolean, default: true },
  printFssai: { type: Boolean, default: true },
  printHeaderDivider: { type: Boolean, default: true },
  printItems: { type: Boolean, default: true },
  printTaxBreakdown: { type: Boolean, default: true },
  printServiceCharge: { type: Boolean, default: true },
  printGatewayCharges: { type: Boolean, default: true },
  printFooter: { type: Boolean, default: true },
  printQrCode: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

const BusinessDetail = mongoose.models.BusinessDetail || mongoose.model('BusinessDetail', businessDetailSchema);

export default BusinessDetail;
