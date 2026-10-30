import express from 'express';
const router = express.Router();
import { 
  getDashboardStats, 
  getStudents, 
  updateStudent,
  getTeachers,
  createTeacher,
  updateTeacher,
  deleteTeacher,
  resetTeacherPassword,
  getNextAdmissionId,
  createStudent,
  getAdmins,
  createNewAdmin,
  updateAdmin,
  resetAdminPassword,
  deleteAdmin,
  addPayment,
  promoteStudents,
  getArchivedStudents,
  archiveStudent,
  unarchiveStudent
} from '../controllers/adminController.js';
import {
  getHolidays,
  setSingleHoliday,
  setRangeHoliday,
  deleteHoliday
} from '../controllers/holidayController.js';
import { protect, isAdmin } from '../middleware/auth.js';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });

// Student Routes
router.get('/dashboard-stats', protect, isAdmin, getDashboardStats);
router.get('/students', protect, isAdmin, getStudents);
router.get('/students/next-admission-id', protect, isAdmin, getNextAdmissionId);
router.post('/students', protect, isAdmin, upload.single('photo'), createStudent);
router.put('/students/:id', protect, isAdmin, upload.single('photo'), updateStudent);
router.post('/students/promote', protect, isAdmin, promoteStudents);
router.post('/students/:id/payments', protect, isAdmin, addPayment);
router.get('/archived-students', protect, isAdmin, getArchivedStudents);
router.post('/students/:id/archive', protect, isAdmin, archiveStudent);
router.post('/students/:id/unarchive', protect, isAdmin, unarchiveStudent);

// Teacher Routes
router.get('/teachers', protect, isAdmin, getTeachers);
router.post('/teachers', protect, isAdmin, upload.single('photo'), createTeacher);
router.put('/teachers/:id', protect, isAdmin, upload.single('photo'), updateTeacher);
router.delete('/teachers/:id', protect, isAdmin, deleteTeacher);
router.post('/teachers/:id/reset-password', protect, isAdmin, resetTeacherPassword);

// Admin CRUD Routes
router.get('/admins', protect, isAdmin, getAdmins);
router.post('/admins', protect, isAdmin, createNewAdmin);
router.put('/admins/:id', protect, isAdmin, updateAdmin);
router.post('/admins/:id/reset-password', protect, isAdmin, resetAdminPassword);
router.delete('/admins/:id', protect, isAdmin, deleteAdmin);

// Holiday Routes
router.get('/holidays',          protect, isAdmin, getHolidays);
router.post('/holidays/single',  protect, isAdmin, setSingleHoliday);
router.post('/holidays/range',   protect, isAdmin, setRangeHoliday);
router.delete('/holidays/:date', protect, isAdmin, deleteHoliday);

export default router;
