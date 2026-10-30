import Holiday from '../models/Holiday.js';
import Student from '../models/Student.js';

// Helper: mark all students as Holiday for a given date
const markAllStudentsHoliday = async (dateStr) => {
  const students = await Student.find({}, { attendance: 1 });
  await Promise.all(students.map(async (student) => {
    if (!student.attendance) student.attendance = [];
    const idx = student.attendance.findIndex(a => a.date === dateStr);
    if (idx >= 0) {
      student.attendance[idx].status = 'Holiday';
    } else {
      student.attendance.push({ date: dateStr, status: 'Holiday' });
    }
    student.markModified('attendance');
    await student.save();
  }));
};

// Helper: generate all YYYY-MM-DD dates between start and end (inclusive)
const getDatesInRange = (startStr, endStr) => {
  const dates = [];
  const cur = new Date(startStr);
  const end = new Date(endStr);
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
};

// @desc    Get all holidays
// @route   GET /api/admin/holidays
// @access  Private (Admin Only)
export const getHolidays = async (req, res) => {
  try {
    const holidays = await Holiday.find().sort({ date: 1 });
    res.json({ holidays });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Set a single-date holiday
// @route   POST /api/admin/holidays/single
// @access  Private (Admin Only)
export const setSingleHoliday = async (req, res) => {
  try {
    const { date, reason } = req.body;
    if (!date) return res.status(400).json({ message: 'Date is required (YYYY-MM-DD)' });

    // Upsert holiday record
    await Holiday.findOneAndUpdate(
      { date },
      { date, reason: reason || 'Holiday' },
      { upsert: true, new: true }
    );

    // Mark all students
    await markAllStudentsHoliday(date);

    res.json({ message: `Holiday set for ${date}`, date });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Set a date-range holiday
// @route   POST /api/admin/holidays/range
// @access  Private (Admin Only)
export const setRangeHoliday = async (req, res) => {
  try {
    const { startDate, endDate, reason } = req.body;
    if (!startDate || !endDate) return res.status(400).json({ message: 'startDate and endDate are required' });
    if (startDate > endDate) return res.status(400).json({ message: 'startDate must be before endDate' });

    const dates = getDatesInRange(startDate, endDate);

    // Upsert all dates in range
    await Promise.all(dates.map(date =>
      Holiday.findOneAndUpdate(
        { date },
        { date, reason: reason || 'Holiday' },
        { upsert: true, new: true }
      )
    ));

    // Mark all students for all dates
    await Promise.all(dates.map(d => markAllStudentsHoliday(d)));

    res.json({ message: `Holiday set from ${startDate} to ${endDate}`, count: dates.length, dates });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Delete a holiday
// @route   DELETE /api/admin/holidays/:date
// @access  Private (Admin Only)
export const deleteHoliday = async (req, res) => {
  try {
    const { date } = req.params;
    await Holiday.findOneAndDelete({ date });

    // Remove Holiday status from all students for this date
    const students = await Student.find({ 'attendance.date': date }, { attendance: 1 });
    await Promise.all(students.map(async (student) => {
      student.attendance = student.attendance.filter(a => !(a.date === date && a.status === 'Holiday'));
      student.markModified('attendance');
      await student.save();
    }));

    res.json({ message: `Holiday removed for ${date}` });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
