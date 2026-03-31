import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import connectDB from './config/database.js';
import { setupSocketHandlers } from './socket.js';
import authRoutes from './routes/auth.js';
import orderRoutes from './routes/orders.js';
import menuRoutes from './routes/menu.js';
import reportRoutes from './routes/reports.js';
import paymentRoutes from './routes/payments.js';
import { limiter } from './middleware/rateLimiter.js';
import categoryRoutes from './routes/categories.js';
import tableRoutes from './routes/tables.js';



dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST']
  }
});

app.set('io', io); // ← ADD THIS LINE

// Connect to MongoDB
connectDB();

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  credentials: true
}));
app.use(express.json());
app.use(limiter);

// Make io accessible to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});
app.use('/api/categories', categoryRoutes);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/tables', tableRoutes);


// Add this near your other routes
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'POS Server API is running',
    endpoints: {
      health: '/health',
      orders: '/api/orders',
      menu: '/api/menu',
      auth: '/api/auth',
      payments: '/api/payments',
      reports: '/api/reports'
    },
    timestamp: new Date()
  });
});


// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date() });
});

// Socket.io setup
setupSocketHandlers(io);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});

// Export for testing
export { app, httpServer, io };
