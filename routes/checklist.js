const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const mongoose = require('mongoose');

const checklistItemSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  phase: { type: String, required: true },
  task: { type: String, required: true },
  responsible: { type: String, default: '' },
  completed: { type: Boolean, default: false },
  completedAt: { type: Date },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const ChecklistItem = mongoose.model('ChecklistItem', checklistItemSchema);

/* Get all items grouped by phase */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const items = await ChecklistItem.find({ userId: req.user._id }).sort({ phase: 1, order: 1, createdAt: 1 });
    const phases = [...new Set(items.map(i => i.phase))];
    const grouped = phases.map(phase => ({
      phase,
      items: items.filter(i => i.phase === phase),
      completed: items.filter(i => i.phase === phase && i.completed).length,
      total: items.filter(i => i.phase === phase).length,
    }));
    const totalCompleted = items.filter(i => i.completed).length;
    res.json({ success: true, grouped, totalCompleted, total: items.length });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* Add a phase (creates a placeholder item so phase exists) */
router.post('/phase', authMiddleware, async (req, res) => {
  try {
    const { phase } = req.body;
    if (!phase || !phase.trim()) return res.status(400).json({ success: false, message: 'Phase name required' });
    const existing = await ChecklistItem.findOne({ userId: req.user._id, phase: phase.trim() });
    if (existing) return res.status(400).json({ success: false, message: 'Phase already exists' });
    res.json({ success: true, message: 'Phase ready — add tasks to it' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* Add a task to a phase */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { phase, task, responsible } = req.body;
    if (!phase || !task) return res.status(400).json({ success: false, message: 'Phase and task are required' });
    const count = await ChecklistItem.countDocuments({ userId: req.user._id, phase });
    const item = new ChecklistItem({ userId: req.user._id, phase, task, responsible: responsible || '', order: count });
    await item.save();
    res.status(201).json({ success: true, item });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* Toggle completion */
router.patch('/:id/toggle', authMiddleware, async (req, res) => {
  try {
    const item = await ChecklistItem.findOne({ _id: req.params.id, userId: req.user._id });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    item.completed = !item.completed;
    item.completedAt = item.completed ? new Date() : null;
    await item.save();
    res.json({ success: true, item });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* Update a task (edit text, assignee) */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const item = await ChecklistItem.findOne({ _id: req.params.id, userId: req.user._id });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    if (req.body.task !== undefined) item.task = req.body.task;
    if (req.body.responsible !== undefined) item.responsible = req.body.responsible;
    if (req.body.phase !== undefined) item.phase = req.body.phase;
    await item.save();
    res.json({ success: true, item });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* Delete a task */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const item = await ChecklistItem.findOne({ _id: req.params.id, userId: req.user._id });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    await item.deleteOne();
    res.json({ success: true, message: 'Task deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
