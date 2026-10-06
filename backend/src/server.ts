import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRoutes from './routes/api';
import { initSocket } from './sockets/socket';
import { pool } from './config/db';

dotenv.config();

const app = express();
const server = http.createServer(app);

// Initialize Socket.io Engine
initSocket(server);

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/v1', apiRoutes);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'OK', database: 'Connected' });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', database: 'Disconnected' });
  }
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 [Server]: Commercial Backend running on http://localhost:${PORT}`);
});