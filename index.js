import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import webpush from 'web-push';
import connectDB from './config/database.js';
import { setupSocketHandlers, getIO } from './socket.js';
import authRoutes from './routes/auth.js';
import orderRoutes from './routes/orders.js';
import menuRoutes from './routes/menu.js';
import reportRoutes from './routes/reports.js';
import paymentRoutes from './routes/payments.js';
import categoryRoutes from './routes/categories.js';
import tableRoutes from './routes/tables.js';
import settingRoutes from './routes/settings.js';
import cartRoutes from './routes/cart.js';
import businessRoutes from './routes/business.js';
import customerRoutes from './routes/customers.js';
import receiptRoutes from './routes/receipts.js';
import notificationRoutes from './routes/notifications.js';
import morgan from 'morgan';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Validate required environment variables
const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingEnvVars.join(', ')}`);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

// Initialize Web Push for notifications
const initializeWebPush = () => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  
  console.log('🔑 VAPID_PUBLIC_KEY:', publicKey ? '✅ Present' : '❌ Missing');
  console.log('🔑 VAPID_PRIVATE_KEY:', privateKey ? '✅ Present' : '❌ Missing');
  
  if (!publicKey || !privateKey) {
    console.log('⚠️ VAPID keys not found. Push notifications will not work.');
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ VAPID keys required for production!');
    }
    return false;
  }
  
  webpush.setVapidDetails(
    'mailto:admin@pos-system.com',
    publicKey,
    privateKey
  );
  console.log('✅ Web Push notifications initialized');
  return true;
};

const webPushInitialized = initializeWebPush();

// Allowed origins (add your Firebase URLs)
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:3001',
  'https://pos-system-d98.web.app',
  'https://pos-system-d98.firebaseapp.com',
  process.env.CLIENT_URL
].filter(Boolean);

console.log('📋 Allowed CORS origins:', allowedOrigins);

// Socket.io configuration
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Make io accessible throughout the app
app.set('io', io);

// ============================================
// 🔥 DATABASE KEEP-ALIVE & WARM-UP SYSTEM
// ============================================

let dbKeepAliveInterval = null;
let dbWarmUpCompleted = false;

// Function to ping database and keep connection alive
const setupDatabaseKeepAlive = () => {
  if (dbKeepAliveInterval) {
    clearInterval(dbKeepAliveInterval);
  }
  
  // Ping database every 3 minutes to prevent MongoDB Atlas idle timeout
  dbKeepAliveInterval = setInterval(async () => {
    try {
      if (mongoose.connection.readyState === 1) { // 1 = connected
        // Simple ping command to keep connection alive
        await mongoose.connection.db.admin().command({ ping: 1 });
        console.log(`💓 Database keep-alive ping at ${new Date().toLocaleTimeString()}`);
      }
    } catch (error) {
      console.error('❌ Database keep-alive ping failed:', error.message);
    }
  }, 3 * 60 * 1000); // Every 3 minutes (MongoDB Atlas free tier idle timeout is ~5 mins)
  
  console.log('🔥 Database keep-alive service started (ping every 3 minutes)');
};

// Function to pre-warm database collections
const warmupDatabase = async () => {
  if (dbWarmUpCompleted) return;
  
  console.log('🔥 Starting database warm-up...');
  const startTime = Date.now();
  
  // List of collections to warm up (use the actual collection names from MongoDB)
  const collections = [
    { name: 'menuitems', model: menuItemsModel },
    { name: 'categories', model: categoryModel },
    { name: 'orders', model: orderModel },
    { name: 'tables', model: tableModel },
    { name: 'settings', model: settingModel },
    { name: 'users', model: userModel },
    { name: 'businessdetails', model: businessDetailModel }
  ];
  
  // Load models dynamically
  let menuItemsModel, categoryModel, orderModel, tableModel, settingModel, userModel, businessDetailModel;
  
  try {
    menuItemsModel = (await import('./models/MenuItem.js')).default;
    categoryModel = (await import('./models/Category.js')).default;
    orderModel = (await import('./models/Order.js')).default;
    tableModel = (await import('./models/Table.js')).default;
    settingModel = (await import('./models/Setting.js')).default;
    userModel = (await import('./models/User.js')).default;
    businessDetailModel = (await import('./models/BusinessDetail.js')).default;
  } catch (error) {
    console.log('⚠️ Could not load all models for warm-up:', error.message);
  }
  
  // Run lightweight queries to warm up each collection
  for (const collection of collections) {
    try {
      if (collection.model) {
        // Use estimatedDocumentCount for fast warm-up (doesn't scan documents)
        const count = await collection.model.estimatedDocumentCount();
        console.log(`✅ Warmed up ${collection.name} collection (${count} documents)`);
      } else if (mongoose.connection.db) {
        // Fallback to native driver
        const count = await mongoose.connection.db.collection(collection.name).estimatedDocumentCount();
        console.log(`✅ Warmed up ${collection.name} collection (${count} documents)`);
      }
    } catch (error) {
      console.log(`⚠️ Could not warm up ${collection.name}:`, error.message);
    }
  }
  
  dbWarmUpCompleted = true;
  const duration = Date.now() - startTime;
  console.log(`🔥 Database warm-up completed in ${duration}ms`);
};

// Function to pre-fetch frequently accessed data into memory cache
const preloadCache = async () => {
  console.log('📦 Preloading frequently accessed data into cache...');
  const startTime = Date.now();
  
  try {
    // Preload settings (used everywhere)
    const Setting = (await import('./models/Setting.js')).default;
    const settings = await Setting.findOne({ key: 'general' });
    if (settings) {
      app.locals.settings = settings.value;
      console.log('✅ Settings cached');
    }
    
    // Preload business details (used for receipts)
    const BusinessDetail = (await import('./models/BusinessDetail.js')).default;
    const business = await BusinessDetail.findOne({ key: 'business-details' });
    if (business) {
      app.locals.businessDetails = business;
      console.log('✅ Business details cached');
    }
    
    // Preload categories (used for menu display)
    const Category = (await import('./models/Category.js')).default;
    const categories = await Category.find({ isActive: true }).lean();
    app.locals.categories = categories;
    console.log(`✅ ${categories.length} categories cached`);
    
    // Preload menu items (most critical for POS)
    const MenuItem = (await import('./models/MenuItem.js')).default;
    const menuItems = await MenuItem.find({ available: true }).lean().limit(50);
    app.locals.menuItemsPreview = menuItems;
    console.log(`✅ ${menuItems.length} menu items preview cached`);
    
  } catch (error) {
    console.error('❌ Cache preload failed:', error.message);
  }
  
  const duration = Date.now() - startTime;
  console.log(`📦 Cache preload completed in ${duration}ms`);
};

// Create a middleware to serve from cache when available
app.use((req, res, next) => {
  // Add cache headers for static-like responses
  if (req.path === '/api/menu' && req.method === 'GET' && app.locals.menuItemsPreview) {
    // For menu requests, we can serve from cache while refreshing in background
    // This is handled in the menu route, but we set a flag
    req.fromCache = false;
  }
  next();
});

// ============================================
// END OF DATABASE KEEP-ALIVE & WARM-UP SYSTEM
// ============================================

// Connect to MongoDB
const connectWithRetry = async (retries = 5, delay = 5000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await connectDB();
      console.log('✅ MongoDB connected successfully');
      
      // Start keep-alive after successful connection
      setupDatabaseKeepAlive();
      
      // Warm up database after connection (delay a bit to let everything settle)
      setTimeout(() => {
        warmupDatabase();
      }, 2000);
      
      // Preload cache after warm-up
      setTimeout(() => {
        preloadCache();
      }, 5000);
      
      return;
    } catch (error) {
      console.error(`MongoDB connection attempt ${i + 1} failed:`, error.message);
      if (i < retries - 1) {
        console.log(`Retrying in ${delay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error('❌ Failed to connect to MongoDB after multiple attempts');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
};

connectWithRetry();

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Compression for better performance
app.use(compression());

// Logging
app.use(morgan('combined'));

// CORS middleware
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(null, true); // Allow anyway for development
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

app.options('*', cors());

// Body parsing with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  req.requestTime = new Date();
  next();
});

// Make io accessible to routes via req
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Make web push available to routes
app.use((req, res, next) => {
  req.webPushInitialized = webPushInitialized;
  req.webpush = webpush;
  next();
});

// Enhanced health check endpoint with detailed status
app.get('/health', async (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  }[dbState] || 'unknown';
  
  const response = { 
    status: 'healthy',
    timestamp: new Date(),
    uptime: process.uptime(),
    mongodb: dbStatus,
    socketConnections: io?.sockets?.sockets?.size || 0,
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    pushNotifications: webPushInitialized,
    keepAlive: {
      active: dbKeepAliveInterval !== null,
      warmUpCompleted: dbWarmUpCompleted,
      cacheLoaded: !!app.locals.settings
    }
  };
  
  // If MongoDB is connected, also ping it to ensure it's awake
  if (dbState === 1) {
    try {
      await mongoose.connection.db.admin().command({ ping: 1 });
      response.dbPing = 'successful';
    } catch (error) {
      response.dbPing = 'failed';
      response.status = 'degraded';
    }
  }
  
  res.status(200).json(response);
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
app.use('/api/customers', customerRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/notifications', notificationRoutes);

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
      cart: '/api/cart',
      notifications: '/api/notifications'
    },
    features: {
      pushNotifications: webPushInitialized,
      keepAlive: dbKeepAliveInterval !== null,
      cacheEnabled: !!app.locals.settings
    },
    timestamp: new Date()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    ip: req.ip
  });
  
  res.status(err.status || 500).json({ 
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    code: err.code || 'INTERNAL_ERROR'
  });
});

// Socket.io setup
setupSocketHandlers(io);

// Graceful shutdown - Clean up intervals
const gracefulShutdown = async () => {
  console.log('Received shutdown signal, closing gracefully...');
  
  // Clear keep-alive interval
  if (dbKeepAliveInterval) {
    clearInterval(dbKeepAliveInterval);
    dbKeepAliveInterval = null;
  }
  
  if (io) {
    io.close(() => {
      console.log('Socket.IO server closed');
    });
  }
  
  httpServer.close(async () => {
    console.log('HTTP server closed');
    
    try {
      await mongoose.connection.close();
      console.log('MongoDB connection closed');
    } catch (err) {
      console.error('Error closing MongoDB:', err);
    }
    
    process.exit(0);
  });
  
  setTimeout(() => {
    console.error('Could not close connections in time, forcing shutdown');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown();
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔌 Socket.io ready for connections`);
  console.log(`📡 API URL: http://localhost:${PORT}/api`);
  console.log(`✅ CORS enabled for:`, allowedOrigins);
  console.log(`📢 Push notifications: ${webPushInitialized ? '✅ Enabled' : '⚠️ Disabled'}`);
  console.log(`🔥 Database keep-alive: ${dbKeepAliveInterval ? 'ACTIVE' : 'PENDING'} (will start after DB connection)`);
});

export { app, httpServer, io, getIO };
