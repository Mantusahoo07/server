import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from './config/database.js';
import { setupSocketHandlers } from './socket.js';
import authRoutes from './routes/auth.js';
import orderRoutes from './routes/orders.js';
import menuRoutes from './routes/menu.js';
import reportRoutes from './routes/reports.js';
import paymentRoutes from './routes/payments.js';
//import { limiter } from './middleware/rateLimiter.js';
import categoryRoutes from './routes/categories.js';
import tableRoutes from './routes/tables.js';
import settingRoutes from './routes/settings.js';
import cartRoutes from './routes/cart.js';
import businessRoutes from './routes/business.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true
  }
});

// Make io accessible throughout the app
app.set('io', io);

// Connect to MongoDB
connectDB();

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Compression for better performance
app.use(compression());

// CORS configuration - ADDED Firebase domains
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://pos-frontend.onrender.com',
  'https://pos-system-d98.web.app',      // Added Firebase domain
  'https://pos-system-d98.firebaseapp.com' // Added Firebase domain
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      // Still allow but log it - you can change to false to block
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

// Handle preflight requests
app.options('*', cors());

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
// app.use(limiter);

// Make io accessible to routes via req
app.use((req, res, next) => {
  req.io = io;
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/business', businessRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'POS Server API is running',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      orders: '/api/orders',
      menu: '/api/menu',
      categories: '/api/categories',
      tables: '/api/tables',
      settings: '/api/settings',
      business: '/api/business',
      auth: '/api/auth',
      payments: '/api/payments',
      reports: '/api/reports',
      cart: '/api/cart'
    },
    timestamp: new Date()
  });
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date(),
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl 
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Socket.io setup
setupSocketHandlers(io);

// Start server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔌 Socket.io ready for connections`);
  console.log(`📡 API URL: http://localhost:${PORT}/api`);
  console.log(`✅ CORS enabled for:`, allowedOrigins);
  console.log(`📋 Available endpoints:`);
  console.log(`   - GET  /api/business      - Business details`);
  console.log(`   - POST /api/business      - Save business details`);
  console.log(`   - GET  /api/settings      - System settings`);
  console.log(`   - POST /api/settings      - Update settings`);
  console.log(`   - GET  /api/categories    - Categories list`);
  console.log(`   - POST /api/categories    - Create category`);
  console.log(`   - GET  /api/tables        - Tables list`);
  console.log(`   - POST /api/tables        - Create table`);
  console.log(`   - GET  /api/menu          - Menu items`);
  console.log(`   - POST /api/menu          - Create menu item`);
  console.log(`   - GET  /api/orders        - Orders list`);
  console.log(`   - POST /api/orders        - Create order`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Export for testing
export { app, httpServer, io };
