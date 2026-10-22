import multer from 'multer';
import { Request } from 'express';
import { IMAGE_FILE_SIZE_LIMIT } from '../utils/constants';
import { CustomError } from '../core/errors/custom';

// Memory storage (for uploading directly to Azure, not local disk)
const storage = multer.memoryStorage();

// File filter to allow only images
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (!file.mimetype.startsWith('image/')) {
        return cb(new CustomError(400, 'Only image files are allowed'));
    }
    cb(null, true);
};

// Export Multer middleware
export const profilePictureUpload = multer({
    storage,
    fileFilter,
    limits: { fileSize: IMAGE_FILE_SIZE_LIMIT * 1024 * 1024 }, // MB -> bytes
}).single('profile_picture'); // must match frontend field name
