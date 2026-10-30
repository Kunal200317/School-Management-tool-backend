import Teacher from '../models/Teacher.js';
import Student from '../models/Student.js';

// @desc    Get teacher profile
// @route   GET /api/teacher/profile
// @access  Private (Teacher Only)
export const getTeacherProfile = async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.user.id).select('-password');
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }
    res.json({ user: teacher });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get teacher dashboard stats
// @route   GET /api/teacher/dashboard
// @access  Private (Teacher Only)
export const getTeacherDashboard = async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.user.id).select('-password');
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    const { classAssigned, sectionAssigned } = teacher;

    // Count students in assigned class & section
    let studentQuery = {};
    if (classAssigned) studentQuery.class = classAssigned;
    if (sectionAssigned) studentQuery.section = sectionAssigned;

    const totalStudents = await Student.countDocuments(studentQuery);

    // Today's date
    const todayStr = new Date().toISOString().split('T')[0];

    // Count how many students have attendance marked today
    const students = await Student.find(studentQuery, { attendance: 1 });
    let presentToday = 0;
    let absentToday = 0;
    let leaveToday = 0;
    let markedToday = 0;

    students.forEach(s => {
      if (s.attendance && s.attendance.length > 0) {
        const todayRecord = s.attendance.find(a => a.date === todayStr);
        if (todayRecord) {
          markedToday++;
          if (todayRecord.status === 'Present') presentToday++;
          else if (todayRecord.status === 'Absent') absentToday++;
          else if (todayRecord.status === 'Leave') leaveToday++;
        }
      }
    });

    // Format today's date nicely
    const todayDate = new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric'
    });

    res.json({
      teacher: {
        name: teacher.name,
        email: teacher.email,
        subject: teacher.subject,
        classAssigned: classAssigned || 'N/A',
        sectionAssigned: sectionAssigned || '',
        photo: teacher.photo
      },
      stats: {
        classLabel: classAssigned ? `${classAssigned}${sectionAssigned ? ' - ' + sectionAssigned : ''}` : 'N/A',
        totalStudents,
        markedToday,
        todayDate,
        presentToday,
        absentToday,
        leaveToday
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get students list for teacher's class
// @route   GET /api/teacher/students
// @access  Private (Teacher Only)
export const getTeacherStudents = async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.user.id).select('classAssigned sectionAssigned');
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

    let query = {};
    if (teacher.classAssigned) query.class = teacher.classAssigned;
    if (teacher.sectionAssigned) query.section = teacher.sectionAssigned;

    const students = await Student.find(query, {
      name: 1, rollNo: 1, admissionId: 1, class: 1, section: 1, photo: 1, attendance: 1
    }).sort({ rollNo: 1 });

    const todayStr = new Date().toISOString().split('T')[0];

    const studentsWithToday = students.map(s => {
      const todayRecord = (s.attendance || []).find(a => a.date === todayStr);
      return {
        _id: s._id,
        name: s.name,
        rollNo: s.rollNo,
        admissionId: s.admissionId,
        class: s.class,
        section: s.section,
        photo: s.photo,
        todayStatus: todayRecord ? todayRecord.status : null
      };
    });

    res.json({ students: studentsWithToday });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Mark attendance for a student
// @route   POST /api/teacher/attendance/mark
// @access  Private (Teacher Only)
export const markAttendance = async (req, res) => {
  try {
    const { studentId, status } = req.body;

    if (!studentId || !status) {
      return res.status(400).json({ message: 'Student ID and status are required' });
    }

    const validStatuses = ['Present', 'Absent', 'Leave'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Use Present, Absent or Leave' });
    }

    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const todayStr = new Date().toISOString().split('T')[0];

    // Initialize attendance array if missing
    if (!student.attendance) student.attendance = [];

    // Check if already marked today
    const existingIdx = student.attendance.findIndex(a => a.date === todayStr);
    if (existingIdx >= 0) {
      // Update existing record
      student.attendance[existingIdx].status = status;
    } else {
      // Add new record
      student.attendance.push({ date: todayStr, status });
    }

    student.markModified('attendance');
    await student.save();

    res.json({ message: 'Attendance marked successfully', date: todayStr, status });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Mark attendance for all students in bulk
// @route   POST /api/teacher/attendance/bulk
// @access  Private (Teacher Only)
export const markBulkAttendance = async (req, res) => {
  try {
    const { records } = req.body; // [{ studentId, status }, ...]

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ message: 'Attendance records array is required' });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const validStatuses = ['Present', 'Absent', 'Leave'];

    const updates = records.map(async ({ studentId, status }) => {
      if (!validStatuses.includes(status)) return;
      const student = await Student.findById(studentId);
      if (!student) return;
      if (!student.attendance) student.attendance = [];
      const existingIdx = student.attendance.findIndex(a => a.date === todayStr);
      if (existingIdx >= 0) {
        student.attendance[existingIdx].status = status;
      } else {
        student.attendance.push({ date: todayStr, status });
      }
      student.markModified('attendance');
      await student.save();
    });

    await Promise.all(updates);
    res.json({ message: 'Bulk attendance marked successfully', date: todayStr, count: records.length });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
