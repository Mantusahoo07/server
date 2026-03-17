const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const socketIO = require('socket.io');
const http = require('http');
const path = require('path');
const jwt = require('jsonwebtoken'); // 👈 IMPORTANT: Add this missing import
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/authRoutes');
const orderRoutes = require('./routes/orderRoutes');
const menuRoutes = require('./routes/menuRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const customerRoutes = require('./routes/customerRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const reportRoutes = require('./routes/reportRoutes');
const locationRoutes = require('./routes/locationRoutes');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { authenticate } = require('./middleware/auth');

// Import utils
const logger = require('./utils/logger');

const app = express();
const server = http.createServer(app);

// 👇 FIXED: CORS configuration for Socket.IO
const io = socketIO(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type']
  },
  transports: ['websocket', 'polling'] // 👈 Add transport options
});

// Rate limiting - 👇 APPLY to all routes, not just /api
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.'
});

// Middleware - 👇 FIXED order
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" } // 👈 Allow cross-origin for static files
}));
app.use(compression());

// 👇 FIXED: More permissive CORS for development
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      process.env.CLIENT_URL,
      'http://localhost:3000',
      'http://localhost:5000',
      'http://127.0.0.1:3000',
      'http://192.168.1.100:3000', // Add your local IP if needed
      'https://your-frontend.onrender.com' // Add your frontend URL when deployed
    ].filter(Boolean);
    
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('combined', { 
  stream: { 
    write: message => logger.info(message.trim()) 
  } 
}));

// Apply rate limiter to all routes
app.use(limiter);

// Static files - 👇 Ensure directories exist
const fs = require('fs');
['uploads', 'reports'].forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/reports', express.static(path.join(__dirname, 'reports')));

// 👇 FIXED: Database connection with better error handling
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Timeout after 5s
      socketTimeoutMS: 45000, // Close sockets after 45s
    });
    
    logger.info(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (err) {
    logger.error('❌ MongoDB connection error:', err);
    console.error('❌ MongoDB connection error:', err);
    // Don't exit immediately, retry connection
    setTimeout(connectDB, 5000);
  }
};

connectDB();

// Make io accessible to routes
app.set('io', io);

// 👇 FIXED: WebSocket connection with better error handling
io.on('connection', (socket) => {
  logger.info('🟢 New client connected:', socket.id);
  console.log('🟢 New client connected:', socket.id);
  
  socket.on('authenticate', (token) => {
    try {
      if (!token) {
        socket.emit('error', 'No token provided');
        return;
      }
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.userRole = decoded.role;
      socket.join(`user:${decoded.userId}`);
      
      if (decoded.locationId) {
        socket.join(`location:${decoded.locationId}`);
      }
      
      socket.emit('authenticated', { 
        success: true, 
        userId: decoded.userId 
      });
      
      logger.info('🔐 Client authenticated:', socket.id);
    } catch (error) {
      logger.error('❌ Authentication failed:', error);
      socket.emit('error', 'Authentication failed');
    }
  });
  
  socket.on('join-location', (locationId) => {
    if (locationId) {
      socket.join(`location:${locationId}`);
      logger.info(`📍 Client joined location: ${locationId}`);
    }
  });
  
  socket.on('join-table', (tableId) => {
    if (tableId) {
      socket.join(`table:${tableId}`);
      logger.info(`🪑 Client joined table: ${tableId}`);
    }
  });
  
  socket.on('disconnect', (reason) => {
    logger.info('🔴 Client disconnected:', socket.id, 'Reason:', reason);
  });
  
  socket.on('error', (error) => {
    logger.error('❌ Socket error:', error);
  });
});

// 👇 FIXED: Routes with better organization
app.get('/', (req, res) => {
  res.json({ 
    message: 'Restaurant POS API', 
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      orders: '/api/orders',
      menu: '/api/menu',
      inventory: '/api/inventory',
      customers: '/api/customers',
      employees: '/api/employees',
      reports: '/api/reports',
      locations: '/api/locations',
      health: '/health'
    }
  });
});

// Health check - 👈 Keep this BEFORE auth middleware
app.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: {
      state: dbStatus[dbState],
      readyState: dbState
    },
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', authenticate, orderRoutes);
app.use('/api/menu', authenticate, menuRoutes);
app.use('/api/inventory', authenticate, inventoryRoutes);
app.use('/api/customers', authenticate, customerRoutes);
app.use('/api/employees', authenticate, employeeRoutes);
app.use('/api/reports', authenticate, reportRoutes);
app.use('/api/locations', authenticate, locationRoutes);

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ 
    error: 'API endpoint not found',
    path: req.originalUrl
  });
});

// Error handling middleware - 👈 This should be last
app.use(errorHandler);

// 404 handler for all other routes
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🌐 Client URL: ${process.env.CLIENT_URL || 'http://localhost:3000'}`);
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
async function gracefulShutdown(signal) {
  logger.info(`📥 Received ${signal}, starting graceful shutdown...`);
  console.log(`📥 Received ${signal}, starting graceful shutdown...`);
  
  // Close server first - stop accepting new connections
  server.close(async () => {
    logger.info('🛑 HTTP server closed');
    console.log('🛑 HTTP server closed');
    
    // Close database connection
    try {
      await mongoose.connection.close();
      logger.info('🗄️  Database connection closed');
      console.log('🗄️  Database connection closed');
    } catch (err) {
      logger.error('Error closing database connection:', err);
    }
    
    process.exit(0);
  });
  
  // Force shutdown after timeout
  setTimeout(() => {
    logger.error('⚠️ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('❌ Uncaught Exception:', err);
  console.error('❌ Uncaught Exception:', err);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('❌ Unhandled Rejection:', err);
  console.error('❌ Unhandled Rejection:', err);
  gracefulShutdown('UNHANDLED_REJECTION');
});

module.exports = { app, server, io };
