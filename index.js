import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import webpush from 'web-push';
import morgan from 'morgan';

dotenv.config();

// Import routes
import authRoutes from './routes/auth.js';
import orderRoutes from './routes/orders.js';
import menuRoutes from './routes/menu.js';
import categoryRoutes from './routes/categories.js';
import tableRoutes from './routes/tables.js';
import cartRoutes from './routes/cart.js';
import settingRoutes from './routes/settings.js';
import businessRoutes from './routes/business.js';
import customerRoutes from './routes/customers.js';
import paymentRoutes from './routes/payments.js';
import reportRoutes from './routes/reports.js';
import notificationRoutes from './routes/notifications.js';
import receiptRoutes from './routes/receipts.js';

// Import socket handler
import { setupSocketHandlers } from './socket.js';

const app = express();
const httpServer = createServer(app);

// Initialize Web Push
webpush.setVapidDetails(
  'mailto:admin@pos-system.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// CORS configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://pos-system-d98.web.app',
  'https://pos-system-d98.firebaseapp.com',
  process.env.CLIENT_URL
].filter(Boolean);

// Socket.io with CORS
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.set('io', io);

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());
app.use(morgan('combined'));
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Make io and webpush available to routes
app.use((req, res, next) => {
  req.io = io;
  req.webpush = webpush;
  next();
});

// Health check
app.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  res.json({
    status: 'healthy',
    timestamp: new Date(),
    mongodb: ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState],
    uptime: process.uptime(),
    pushNotifications: true
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/business', businessRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/receipts', receiptRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'POS Server API is running',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      orders: '/api/orders',
      menu: '/api/menu',
      categories: '/api/categories',
      tables: '/api/tables'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Setup socket handlers
setupSocketHandlers(io);

// Start server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔌 Socket.io ready`);
  console.log(`📡 API: http://localhost:${PORT}/api`);
});