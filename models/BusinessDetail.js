import mongoose from 'mongoose';

const businessDetailSchema = new mongoose.Schema({
  key: { type: String, default: 'business-details', unique: true },
  name: { type: String, default: 'Restaurant Name' },
  address: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  gst: { type: String, default: '' },
  fssai: { type: String, default: '' },
  upiId: { type: String, default: 'paytm.s1yxcay@pty' },
  currencySymbol: { type: String, default: '₹' },
  taxLabel: { type: String, default: 'GST' },
  footerMessage: { type: String, default: 'Thank you! Visit Again!' },
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
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model('BusinessDetail', businessDetailSchema);