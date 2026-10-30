import express from 'express';
const router = express.Router();
import {
  createSession,
  getSessions,
  setActiveSession,
  closeSession
} from '../controllers/sessionController.js';
import { protect, isAdmin } from '../middleware/auth.js';

router.post('/', protect, isAdmin, createSession);
router.get('/', protect, isAdmin, getSessions);
router.patch('/:id/active', protect, isAdmin, setActiveSession);
router.patch('/:id/close', protect, isAdmin, closeSession);

export default router;
