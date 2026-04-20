const ARRAY_FIELDS = new Set([
  'items',
  'variants',
  'tags',
  'materials',
  'preferredCategories',
  'additionalImages',
]);

function tryParseJson(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;

  for (const key of Object.keys(obj)) {
    let value = obj[key];

    if (typeof value === 'string') {
      value = tryParseJson(value);
    }

    if (ARRAY_FIELDS.has(key)) {
      if (value === '' || value === null || value === undefined) {
        value = [];
      } else if (!Array.isArray(value)) {
        value = [];
      }
    }

    if (Array.isArray(value)) {
      value = value.map((entry) => {
        if (typeof entry === 'string') {
          return tryParseJson(entry);
        }
        return entry;
      });
    } else if (value && typeof value === 'object') {
      value = sanitizeObject(value);
    }

    obj[key] = value;
  }

  return obj;
}

module.exports = function sanitizePayload(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }
  next();
};
