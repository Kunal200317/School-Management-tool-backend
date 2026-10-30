import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import connectDB from './config/db.js';
import authRoutes from './routes/auth.js';
import feeRoutes from './routes/fee.js';
import adminRoutes from './routes/admin.js';
import studentRoutes from './routes/student.js';
import teacherRoutes from './routes/teacher.js';
import sessionRoutes from './routes/session.js';

// Load environment variables
dotenv.config();

// Connect to MongoDB Database
connectDB();

const app = express();

// Trust reverse proxy for deployment (Render, Railway, Heroku, Vercel)
app.set('trust proxy', 1);

// Allowed origins taken directly from .env (CLIENT_URL) + dev fallbacks
const allowedOrigins = [
  ...(process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',').map(url => url.trim().replace(/\/$/, '')) : []),
  'http://localhost:5173',
  'http://localhost:3000'
];

// Middlewares
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    const cleanOrigin = origin.replace(/\/$/, '');

    // Allow if origin is in .env CLIENT_URL or is local/LAN development IP
    const isAllowedFromEnv = allowedOrigins.includes(cleanOrigin);
    const isLocalOrLAN =
      cleanOrigin.startsWith('http://localhost') ||
      cleanOrigin.startsWith('http://127.0.0.1') ||
      cleanOrigin.match(/^http:\/\/192\.168\.\d+\.\d+/) ||
      cleanOrigin.match(/^http:\/\/10\.\d+\.\d+\.\d+/) ||
      cleanOrigin.match(/^http:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/);

    if (isAllowedFromEnv || isLocalOrLAN) {
      callback(null, true);
    } else {
      console.log(`[CORS REJECTED] origin: "${origin}"`);
      callback(new Error(`Not allowed by CORS: ${origin}`));
    }
  },
  credentials: true
}));

// _______________________this is only for mobile view____________________________________
// Request Logger to debug mobile connections
app.use((req, res, next) => {
  console.log(`[HTTP REQUEST] ${req.method} ${req.url} from ${req.ip}`);
  next();
});

// _____________________________________________________________
app.use(express.json());
app.use(cookieParser());

// Routes Mount
app.use('/api/auth', authRoutes);
app.use('/api/fees', feeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/sessions', sessionRoutes);

// Base route for status check
app.get('/', (req, res) => {
  res.json({ message: 'Loyola EMS API is running...' });
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
