const mongoose = require('mongoose');

const checklistItemSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  phase: { type: String, required: true },
  task: { type: String, required: true },
  responsible: { type: String, default: '' },
  dueDate: { type: Date },
  priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  notes: { type: String, default: '' },
  completed: { type: Boolean, default: false },
  completedAt: { type: Date },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.ChecklistItem || mongoose.model('ChecklistItem', checklistItemSchema);
