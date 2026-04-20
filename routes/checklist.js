const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const ChecklistItem = require('../models/ChecklistItem');

const DEFAULT_PHASES = [
  {
    phase: 'PHASE 1 · Brand Foundation',
    tasks: [
      { task: 'Define brand name, logo, and visual identity', responsible: 'Founder' },
      { task: 'Register brand name / trademark', responsible: 'Legal' },
      { task: 'Set brand colors, fonts, and photography style', responsible: 'Designer' },
      { task: 'Create brand guidelines document', responsible: 'Designer' },
      { task: 'Register domain and social media handles', responsible: 'Marketing' },
    ]
  },
  {
    phase: 'PHASE 2 · Product Development',
    tasks: [
      { task: 'Finalize collection concept and mood board', responsible: 'Creative Director' },
      { task: 'Source fabrics from approved suppliers', responsible: 'Procurement' },
      { task: 'Create tech packs for all designs', responsible: 'Designer' },
      { task: 'Produce samples and review quality', responsible: 'Production' },
      { task: 'Revise samples based on feedback', responsible: 'Production' },
      { task: 'Final sample approval sign-off', responsible: 'Founder' },
    ]
  },
  {
    phase: 'PHASE 3 · Production Planning',
    tasks: [
      { task: 'Confirm production quantities per SKU', responsible: 'Operations' },
      { task: 'Place production orders with stitching unit', responsible: 'Production' },
      { task: 'Set up quality control checkpoints', responsible: 'QC' },
      { task: 'Create production timeline with milestones', responsible: 'Operations' },
    ]
  },
  {
    phase: 'PHASE 4 · Photography & Content',
    tasks: [
      { task: 'Book photographer and studio / location', responsible: 'Marketing' },
      { task: 'Prepare styling, props, and accessories', responsible: 'Stylist' },
      { task: 'Shoot product and lifestyle photos', responsible: 'Photographer' },
      { task: 'Edit and retouch images', responsible: 'Retoucher' },
      { task: 'Create video content / reels', responsible: 'Content Creator' },
      { task: 'Write product descriptions for all items', responsible: 'Copywriter' },
    ]
  },
  {
    phase: 'PHASE 5 · Pricing & Financials',
    tasks: [
      { task: 'Calculate cost price for all products', responsible: 'Finance' },
      { task: 'Set retail prices with target margins', responsible: 'Finance' },
      { task: 'Set up payment methods (Bank, EasyPaisa, JazzCash)', responsible: 'Finance' },
      { task: 'Set up shipping rates and courier accounts', responsible: 'Operations' },
      { task: 'Create COD and prepaid policies', responsible: 'Operations' },
    ]
  },
  {
    phase: 'PHASE 6 · Website & Store Setup',
    tasks: [
      { task: 'Set up website / Shopify / Instagram Shop', responsible: 'Tech' },
      { task: 'Upload all products with photos and descriptions', responsible: 'E-commerce' },
      { task: 'Test checkout and payment flow', responsible: 'Tech' },
      { task: 'Set up order confirmation emails', responsible: 'Marketing' },
      { task: 'Add size guides and FAQs', responsible: 'Content' },
    ]
  },
  {
    phase: 'PHASE 7 · Marketing & Pre-Launch',
    tasks: [
      { task: 'Create countdown teaser content for social media', responsible: 'Marketing' },
      { task: 'Build email / WhatsApp subscriber list', responsible: 'Marketing' },
      { task: 'Reach out to influencers for PR packages', responsible: 'PR' },
      { task: 'Plan launch day social media posts schedule', responsible: 'Social Media' },
      { task: 'Set up Instagram and Facebook Ads', responsible: 'Marketing' },
    ]
  },
  {
    phase: 'PHASE 8 · Logistics & Operations',
    tasks: [
      { task: 'Prepare packaging materials and brand boxes', responsible: 'Operations' },
      { task: 'Stock all items and organize inventory', responsible: 'Warehouse' },
      { task: 'Brief customer service team on policies', responsible: 'CS Lead' },
      { task: 'Set up tracking system for orders', responsible: 'Operations' },
      { task: 'Prepare return / exchange policy documents', responsible: 'CS Lead' },
    ]
  },
  {
    phase: 'PHASE 9 · Launch Day',
    tasks: [
      { task: 'Go live — enable website and social media posts', responsible: 'Marketing' },
      { task: 'Send launch announcement to email list', responsible: 'Marketing' },
      { task: 'Broadcast to WhatsApp groups', responsible: 'Marketing' },
      { task: 'Monitor orders and confirm receipts in real-time', responsible: 'Operations' },
      { task: 'Respond to all DMs and inquiries promptly', responsible: 'CS' },
    ]
  },
  {
    phase: 'PHASE 10 · Post-Launch Growth',
    tasks: [
      { task: 'Collect and review customer feedback', responsible: 'CS Lead' },
      { task: 'Send thank-you messages to first buyers', responsible: 'CS' },
      { task: 'Analyze sales data and best-sellers', responsible: 'Analytics' },
      { task: 'Plan next collection based on learnings', responsible: 'Creative Director' },
      { task: 'Restock fast-moving items', responsible: 'Operations' },
      { task: 'Post customer review content on social media', responsible: 'Marketing' },
    ]
  },
];

/* Initialize checklist with default phases */
router.post('/init', authMiddleware, async (req, res) => {
  try {
    // Delete existing items for this user
    await ChecklistItem.deleteMany({ userId: req.user._id });

    // Create all default items
    const items = [];
    for (const phaseData of DEFAULT_PHASES) {
      for (let i = 0; i < phaseData.tasks.length; i++) {
        items.push({
          userId: req.user._id,
          phase: phaseData.phase,
          task: phaseData.tasks[i].task,
          responsible: phaseData.tasks[i].responsible,
          order: i,
          completed: false,
        });
      }
    }
    await ChecklistItem.insertMany(items);
    res.json({ success: true, message: `Checklist initialized with ${items.length} tasks across ${DEFAULT_PHASES.length} phases` });
  } catch (err) {
    console.error('Checklist init error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

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
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* Add a task to a phase */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { phase, task, responsible, dueDate, priority, notes } = req.body;
    if (!phase || !task) return res.status(400).json({ success: false, message: 'Phase and task are required' });
    const count = await ChecklistItem.countDocuments({ userId: req.user._id, phase });
    const item = new ChecklistItem({
      userId: req.user._id, phase, task,
      responsible: responsible || '', order: count,
      dueDate: dueDate || null, priority: priority || 'Medium',
      notes: notes || '',
    });
    await item.save();
    res.status(201).json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
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
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* Update a task */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const item = await ChecklistItem.findOne({ _id: req.params.id, userId: req.user._id });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    const { task, responsible, phase, dueDate, priority, notes } = req.body;
    if (task !== undefined) item.task = task;
    if (responsible !== undefined) item.responsible = responsible;
    if (phase !== undefined) item.phase = phase;
    if (dueDate !== undefined) item.dueDate = dueDate;
    if (priority !== undefined) item.priority = priority;
    if (notes !== undefined) item.notes = notes;
    await item.save();
    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* Delete a task */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const item = await ChecklistItem.findOne({ _id: req.params.id, userId: req.user._id });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    await item.deleteOne();
    res.json({ success: true, message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* Delete entire phase */
router.delete('/phase/:phaseName', authMiddleware, async (req, res) => {
  try {
    const phase = decodeURIComponent(req.params.phaseName);
    await ChecklistItem.deleteMany({ userId: req.user._id, phase });
    res.json({ success: true, message: 'Phase deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;