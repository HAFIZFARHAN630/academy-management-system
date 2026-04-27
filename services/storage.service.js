/**
 * ─────────────────────────────────────────────────────────
 *  Academy Management System — Storage Service (Cloudinary)
 *  Handles: Profile photos, Visitor photos, Leave documents
 * ─────────────────────────────────────────────────────────
 */

const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// ─── Configure Cloudinary ─────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
});

const BASE_FOLDER = process.env.CLOUDINARY_FOLDER || 'academy';

// ─── Storage: User Profile Photos ────────────────────────────────────────────
const userPhotoStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: `${BASE_FOLDER}/users`,
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { width: 400, height: 400, crop: 'fill', gravity: 'face' },
      { quality: 'auto', fetch_format: 'auto' },
    ],
    public_id: (req) => `user_${req.user?.id || req.body?.login_id || 'unknown'}_${Date.now()}`,
  },
});

// ─── Storage: Visitor Photos ──────────────────────────────────────────────────
const visitorPhotoStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: `${BASE_FOLDER}/visitors`,
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { width: 400, height: 400, crop: 'fill', gravity: 'face' },
      { quality: 'auto', fetch_format: 'auto' },
    ],
    public_id: () => `visitor_${Date.now()}`,
  },
});

// ─── Storage: Leave Documents ─────────────────────────────────────────────────
const documentStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: `${BASE_FOLDER}/documents`,
    allowed_formats: ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'],
    resource_type: 'auto',
    public_id: (req) => `leave_${req.user?.id || 'unknown'}_${Date.now()}`,
  },
});

// ─── Multer Upload Middlewares ────────────────────────────────────────────────
const uploadUserPhoto = multer({
  storage: userPhotoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) =>
    file.mimetype.startsWith('image/')
      ? cb(null, true)
      : cb(new Error('Only image files allowed for photos')),
}).single('photo');

const uploadVisitorPhoto = multer({
  storage: visitorPhotoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    file.mimetype.startsWith('image/')
      ? cb(null, true)
      : cb(new Error('Only image files allowed for visitor photos')),
}).single('photo');

const uploadDocument = multer({
  storage: documentStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    allowed.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Allowed types: PDF, JPG, PNG, DOC, DOCX'));
  },
}).single('document');

// ─── Direct Base64 Upload (for face snapshots, etc.) ─────────────────────────
/**
 * @param {string} base64Data  - "data:image/jpeg;base64,..."
 * @param {string} folder      - Cloudinary sub-folder
 * @param {string} [publicId]  - Optional desired public_id
 */
async function uploadBase64Image(base64Data, folder = `${BASE_FOLDER}/misc`, publicId = null) {
  const opts = { folder, resource_type: 'image', transformation: [{ quality: 'auto' }] };
  if (publicId) opts.public_id = publicId;
  const result = await cloudinary.uploader.upload(base64Data, opts);
  return { url: result.secure_url, public_id: result.public_id };
}

// ─── Delete File ──────────────────────────────────────────────────────────────
async function deleteFile(publicId, resourceType = 'image') {
  try {
    const res = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    return res.result === 'ok';
  } catch (err) {
    console.error('[StorageService] Delete failed:', err.message);
    return false;
  }
}

// ─── Extract public_id from Cloudinary URL ────────────────────────────────────
function extractPublicId(url) {
  try {
    const parts = url.split('/');
    const i = parts.indexOf('upload');
    if (i === -1) return null;
    let start = i + 1;
    if (parts[start]?.startsWith('v') && !isNaN(parts[start].slice(1))) start++;
    return parts.slice(start).join('/').replace(/\.[^/.]+$/, '');
  } catch {
    return null;
  }
}

// ─── Multer Error Handler Middleware ──────────────────────────────────────────
function handleUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE')
    return res.status(400).json({ error: 'File too large. Max: 10 MB.' });
  if (err) return res.status(400).json({ error: err.message });
  next();
}

module.exports = {
  cloudinary,
  uploadUserPhoto,
  uploadVisitorPhoto,
  uploadDocument,
  uploadBase64Image,
  deleteFile,
  extractPublicId,
  handleUploadError,
};
