import express from 'express';
const router = express.Router();
import { protect, isTeacher } from '../middleware/auth.js';
import {
  getTeacherProfile,
  getTeacherDashboard,
  getTeacherStudents,
  markAttendance,
  markBulkAttendance
} from '../controllers/teacherController.js';

// @route   GET /api/teacher/profile
router.get('/profile', protect, isTeacher, getTeacherProfile);

// @route   GET /api/teacher/dashboard
router.get('/dashboard', protect, isTeacher, getTeacherDashboard);

// @route   GET /api/teacher/students
router.get('/students', protect, isTeacher, getTeacherStudents);

// @route   POST /api/teacher/attendance/mark
router.post('/attendance/mark', protect, isTeacher, markAttendance);

// @route   POST /api/teacher/attendance/bulk
router.post('/attendance/bulk', protect, isTeacher, markBulkAttendance);

export default router;
