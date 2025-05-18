// middleware/multerConfig.js
const multer = require('multer');

// Define allowed image mime types
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Configure storage options to store in memory as a Buffer
// This is the primary change: using memoryStorage instead of diskStorage
const storage = multer.memoryStorage();

// Configure file filter to accept only images
const imageFileFilter = (req, file, cb) => {
    if (IMAGE_MIME_TYPES.includes(file.mimetype)) {
        cb(null, true); // Accept file
    } else {
        // Reject file with a specific error message
        cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WEBP images are allowed.'), false);
    }
};

// Create the Multer instance with memory storage and filter
const upload = multer({
    storage: storage, // Use memoryStorage
    fileFilter: imageFileFilter,
    limits: {
        fileSize: 1024 * 1024 * 5 // Limit file size to 5MB (adjust as needed)
    }
});

module.exports = upload; // Export the configured Multer middleware
