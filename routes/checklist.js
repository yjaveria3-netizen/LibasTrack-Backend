const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const mongoose = require('mongoose');

const checklistItemSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  phase: { type: String, required: true },
  task: { type: String, required: true },
  responsible: { type: String },
  completed: { type: Boolean, default: false },
  completedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

const ChecklistItem = mongoose.model('ChecklistItem', checklistItemSchema);

const DEFAULT_CHECKLIST = [
  { phase: 'PHASE 1: Brand Foundation', task: 'Finalize brand name', responsible: 'Founder' },
  { phase: 'PHASE 1: Brand Foundation', task: 'Logo design & approval', responsible: 'Founder + Creative Director' },
  { phase: 'PHASE 1: Brand Foundation', task: 'Brand colors & typography', responsible: 'Creative Director' },
  { phase: 'PHASE 1: Brand Foundation', task: 'Define target audience', responsible: 'Founder' },
  { phase: 'PHASE 1: Brand Foundation', task: 'Brand mission & positioning', responsible: 'Founder' },
  { phase: 'PHASE 2: Legal & Registration', task: 'Business registration', responsible: 'Founder' },
  { phase: 'PHASE 2: Legal & Registration', task: 'NTN registration', responsible: 'Finance Manager' },
  { phase: 'PHASE 2: Legal & Registration', task: 'Register with Federal Board of Revenue', responsible: 'Finance Manager' },
  { phase: 'PHASE 2: Legal & Registration', task: 'Open business bank account', responsible: 'Founder + Finance' },
  { phase: 'PHASE 2: Legal & Registration', task: 'Trademark filing', responsible: 'Founder' },
  { phase: 'PHASE 3: Product Development - Design', task: 'Collection theme finalization', responsible: 'Creative Director' },
  { phase: 'PHASE 3: Product Development - Design', task: 'Sketching & tech packs', responsible: 'Creative Director' },
  { phase: 'PHASE 3: Product Development - Design', task: 'Fabric selection', responsible: 'Creative Director + Production' },
  { phase: 'PHASE 3: Product Development - Design', task: 'Embroidery design approval', responsible: 'Founder + Creative Director' },
  { phase: 'PHASE 3: Product Development - Production', task: 'Fabric sourcing', responsible: 'Production Manager' },
  { phase: 'PHASE 3: Product Development - Production', task: 'Finalize stitching unit', responsible: 'Production Manager' },
  { phase: 'PHASE 3: Product Development - Production', task: 'Sample production', responsible: 'Production Manager' },
  { phase: 'PHASE 3: Product Development - Production', task: 'Quality check approval', responsible: 'Founder + Production' },
  { phase: 'PHASE 3: Product Development - Production', task: 'Final production order', responsible: 'Founder' },
  { phase: 'PHASE 3: Product Development - Pricing', task: 'Cost calculation per piece', responsible: 'Finance Manager' },
  { phase: 'PHASE 3: Product Development - Pricing', task: 'Set profit margin', responsible: 'Founder' },
  { phase: 'PHASE 3: Product Development - Pricing', task: 'Final retail pricing', responsible: 'Founder + Finance' },
  { phase: 'PHASE 4: Branding Materials', task: 'Neck label design', responsible: 'Creative Director' },
  { phase: 'PHASE 4: Branding Materials', task: 'Care labels content', responsible: 'Operations' },
  { phase: 'PHASE 4: Branding Materials', task: 'Packaging design', responsible: 'Creative Director' },
  { phase: 'PHASE 4: Branding Materials', task: 'Printing vendor coordination', responsible: 'Production Manager' },
  { phase: 'PHASE 5: Photoshoot & Content', task: 'Model hiring', responsible: 'Marketing Manager' },
  { phase: 'PHASE 5: Photoshoot & Content', task: 'Studio booking', responsible: 'Marketing' },
  { phase: 'PHASE 5: Photoshoot & Content', task: 'Shoot direction', responsible: 'Creative Director' },
  { phase: 'PHASE 5: Photoshoot & Content', task: 'Product detailing shots', responsible: 'Photographer' },
  { phase: 'PHASE 5: Photoshoot & Content', task: 'Reel creation', responsible: 'Marketing' },
  { phase: 'PHASE 5: Photoshoot & Content', task: 'Final approval of images', responsible: 'Founder' },
  { phase: 'PHASE 6: Online Setup - Social Media', task: 'Instagram setup', responsible: 'Marketing' },
  { phase: 'PHASE 6: Online Setup - Social Media', task: 'Bio & branding', responsible: 'Marketing' },
  { phase: 'PHASE 6: Online Setup - Social Media', task: 'Content calendar', responsible: 'Marketing' },
  { phase: 'PHASE 6: Online Setup - Social Media', task: 'Ad campaigns', responsible: 'Marketing' },
  { phase: 'PHASE 6: Online Setup - Social Media', task: 'Influencer outreach', responsible: 'Marketing' },
  { phase: 'PHASE 6: Online Setup - Website', task: 'Domain purchase', responsible: 'Founder' },
  { phase: 'PHASE 6: Online Setup - Website', task: 'Website development', responsible: 'Web Developer' },
  { phase: 'PHASE 6: Online Setup - Website', task: 'Product upload', responsible: 'Marketing + Operations' },
  { phase: 'PHASE 6: Online Setup - Website', task: 'Payment gateway setup', responsible: 'Finance + Web Developer' },
  { phase: 'PHASE 6: Online Setup - Website', task: 'Order testing', responsible: 'Founder' },
  { phase: 'PHASE 7: Operations Setup', task: 'Inventory system', responsible: 'Operations' },
  { phase: 'PHASE 7: Operations Setup', task: 'Courier partnership', responsible: 'Operations' },
  { phase: 'PHASE 7: Operations Setup', task: 'COD setup', responsible: 'Finance' },
  { phase: 'PHASE 7: Operations Setup', task: 'WhatsApp Business setup', responsible: 'Customer Support' },
  { phase: 'PHASE 7: Operations Setup', task: 'Packing station setup', responsible: 'Operations' },
  { phase: 'PHASE 8: Pre-Launch Marketing', task: 'Teaser campaign', responsible: 'Marketing' },
  { phase: 'PHASE 8: Pre-Launch Marketing', task: 'Giveaway planning', responsible: 'Marketing' },
  { phase: 'PHASE 8: Pre-Launch Marketing', task: 'Launch offer pricing', responsible: 'Founder + Finance' },
  { phase: 'PHASE 8: Pre-Launch Marketing', task: 'Ad budget approval', responsible: 'Founder' },
  { phase: 'PHASE 9: Launch Day', task: 'Website go live', responsible: 'Web Developer' },
  { phase: 'PHASE 9: Launch Day', task: 'Social media announcement', responsible: 'Marketing' },
  { phase: 'PHASE 9: Launch Day', task: 'Monitor orders', responsible: 'Operations' },
  { phase: 'PHASE 9: Launch Day', task: 'Customer queries', responsible: 'Customer Support' },
  { phase: 'PHASE 9: Launch Day', task: 'Ad performance tracking', responsible: 'Marketing' },
  { phase: 'PHASE 10: Post-Launch Growth', task: 'Collect reviews', responsible: 'Customer Support' },
  { phase: 'PHASE 10: Post-Launch Growth', task: 'Sales analysis', responsible: 'Finance' },
  { phase: 'PHASE 10: Post-Launch Growth', task: 'Restocking decision', responsible: 'Founder' },
  { phase: 'PHASE 10: Post-Launch Growth', task: 'Next collection planning', responsible: 'Creative Director' },
  { phase: 'PHASE 10: Post-Launch Growth', task: 'Monthly performance review', responsible: 'Founder' }
];

// Initialize checklist for user
router.post('/init', authMiddleware, async (req, res) => {
  try {
    const existing = await ChecklistItem.countDocuments({ userId: req.user._id });
    if (existing > 0) return res.json({ success: true, message: 'Checklist already initialized' });
    const items = DEFAULT_CHECKLIST.map(item => ({ ...item, userId: req.user._id }));
    await ChecklistItem.insertMany(items);
    res.json({ success: true, message: 'Checklist initialized with all phases!' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Get all checklist items
router.get('/', authMiddleware, async (req, res) => {
  try {
    const items = await ChecklistItem.find({ userId: req.user._id }).sort({ createdAt: 1 });
    const phases = [...new Set(items.map(i => i.phase))];
    const grouped = phases.map(phase => ({
      phase,
      items: items.filter(i => i.phase === phase),
      completed: items.filter(i => i.phase === phase && i.completed).length,
      total: items.filter(i => i.phase === phase).length
    }));
    const totalCompleted = items.filter(i => i.completed).length;
    res.json({ success: true, grouped, totalCompleted, total: items.length });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Toggle item completion
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

module.exports = router;
