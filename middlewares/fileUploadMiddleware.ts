import multer from 'multer';
import path from 'path';
import { Request } from 'express';

// Configure memory storage for Azure Blob uploads
const storage = multer.memoryStorage();

// File filter
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // Allowed file extensions
    const allowedExtensions = /jpeg|jpg|png|gif|svg|webp|pdf|csv|txt|doc|docx|xls|xlsx/;
    
    // Allowed mime types (comprehensive list)
    const allowedMimeTypes = [
        // Images
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/svg+xml',
        'image/webp',
        // PDF
        'application/pdf',
        // CSV
        'text/csv',
        'application/csv',
        'text/plain', // Some systems send CSV as text/plain
        // Word documents
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        // Excel documents
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        // Generic binary (fallback for some browsers)
        'application/octet-stream'
    ];

    const extname = allowedExtensions.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedMimeTypes.includes(file.mimetype);

    if (extname && mimetype) {
        return cb(null, true);
    } else if (extname) {
        // If extension is valid but mime type is not recognized, still allow
        // Some browsers/systems send incorrect mime types
        return cb(null, true);
    } else {
        cb(new Error('Invalid file type. Allowed types: JPEG, JPG, PNG, GIF, SVG, WEBP, PDF, CSV, DOC, DOCX, XLS, XLSX.'));
    }
};

// Multer upload configuration
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: fileFilter
});

// Define fields for onboarding
export const onboardingUpload = upload.fields([
    { name: 'companyLogo', maxCount: 1 },
    { name: 'costCodesFiles', maxCount: 10 },
    { name: 'costCodesFiles[]', maxCount: 10 },
    { name: 'costCodesFile', maxCount: 10 },
    { name: 'workersCompFiles', maxCount: 10 },
    { name: 'workersCompFiles[]', maxCount: 10 },
    { name: 'workersCompFile', maxCount: 10 },
]);

// Single file upload for company logo update
export const companyLogoUpload = upload.single('companyLogo');

// Single file upload for COI document (Azure Blob)
export const coiDocumentUpload = upload.single('coiDocument');

// Single file upload for Knowledge Base entry ingestion
export const knowledgeBaseUpload = upload.single('file');

/*
 * ╔═══════════════════════════════════════╗
 * ║      CSV UPLOAD FOR COST CODES        ║
 * ╚═══════════════════════════════════════╝
 */

// CSV-only storage configuration for cost codes (memory storage for Azure Blob)
const csvStorage = multer.memoryStorage();

// CSV-only file filter
const csvFileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedMimeTypes = [
        'text/csv',
        'application/csv',
        'text/plain', // Some systems send CSV as text/plain
        'application/vnd.ms-excel' // Excel sometimes sends CSV with this mime type
    ];

    const isCSV = file.originalname.toLowerCase().endsWith('.csv');
    const mimeTypeAllowed = allowedMimeTypes.includes(file.mimetype);

    if (isCSV && mimeTypeAllowed) {
        cb(null, true);
    } else if (isCSV) {
        // If extension is .csv but mime type is weird, still allow
        cb(null, true);
    } else {
        cb(new Error('Only CSV files are allowed'));
    }
};

// CSV upload middleware for cost codes import
export const csvUpload = multer({
    storage: csvStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    fileFilter: csvFileFilter
}).single('file');

/*
 * ╔═══════════════════════════════════════╗
 * ║      MAILGUN WEBHOOK FILE UPLOAD      ║
 * ╚═══════════════════════════════════════╝
 */

// Mailgun webhook file upload middleware
// Accepts any file type since emails can have any attachment
export const mailgunWebhookUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 25 * 1024 * 1024, // 25MB limit (Mailgun's forward limit)
        files: 10, // Max 10 files per email
    },
    // No file filter - accept all file types from email attachments
}).any();
