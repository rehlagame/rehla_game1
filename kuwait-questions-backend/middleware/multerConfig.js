// middleware/multerConfig.js
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid'); // For generating unique filenames

// Define allowed image mime types
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Configure storage options
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Save files to the 'public/uploads' directory
        cb(null, path.join(__dirname, '..', 'public/uploads')); // Go up one level from middleware
    },
    filename: function (req, file, cb) {
        // Generate a unique filename: uuid + original extension
        const uniqueSuffix = uuidv4();
        const extension = path.extname(file.originalname); // Get original extension (e.g., '.jpg')
        cb(null, `${uniqueSuffix}${extension}`);
    }
});

// Configure file filter to accept only images
const imageFileFilter = (req, file, cb) => {
    if (IMAGE_MIME_TYPES.includes(file.mimetype)) {
        cb(null, true); // Accept file
    } else {
        // Reject file with a specific error message
        cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WEBP images are allowed.'), false);
    }
};

// Create the Multer instance with storage and filter
const upload = multer({
    storage: storage,
    fileFilter: imageFileFilter,
    limits: {
        fileSize: 1024 * 1024 * 5 // Limit file size to 5MB (adjust as needed)
    }
});

module.exports = upload; // Export the configured Multer middleware