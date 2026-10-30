import express from 'express';
const router = express.Router();
import { loginAdmin, loginTeacher, loginStudent, createAdmin, logoutUser } from '../controllers/authController.js';
import { protect, isAdmin } from '../middleware/auth.js';

// @route   POST /api/auth/login/admin
// @desc    Admin login & get token
// @access  Public
router.post('/login/admin', loginAdmin);

// @route   POST /api/auth/login/teacher
// @desc    Teacher login & get token
// @access  Public
router.post('/login/teacher', loginTeacher);

// @route   POST /api/auth/login/student
// @desc    Student login using mobile number & DOB (password)
// @access  Public
router.post('/login/student', loginStudent);

// @route   POST /api/auth/create-admin
// @desc    Create a new admin (Admin Only)
// @access  Private (Admin Only)
router.post('/create-admin', protect, isAdmin, createAdmin);

// @route   POST /api/auth/logout
// @desc    Logout user and clear cookie
// @access  Public
router.post('/logout', logoutUser);

export default router;
