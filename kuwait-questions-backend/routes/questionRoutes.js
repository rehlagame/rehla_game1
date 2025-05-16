// routes/questionRoutes.js

const express = require('express');
const pool    = require('../database/database');
const upload  = require('../middleware/multerConfig');
const { v4: uuidv4 } = require('uuid');
const fs      = require('fs');
const fsp     = require('fs').promises;
const path    = require('path');

const router = express.Router();

// --- Configuration for Image URLs ---
const backendBaseUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
const baseImageUrl   = `${backendBaseUrl}/uploads/`;

// Helper: Safely parse JSON arrays
const safeJsonParse = (jsonString, defaultValue = []) => {
    try {
        if (!jsonString) return defaultValue;
        if (typeof jsonString === 'object' && jsonString !== null) {
            return Array.isArray(jsonString) ? jsonString : defaultValue;
        }
        const parsed = JSON.parse(jsonString);
        return Array.isArray(parsed) ? parsed : defaultValue;
    } catch {
        return defaultValue;
    }
};

// Helper: Delete image file from disk
const deleteImageFile = (filename) => {
    if (!filename) return;
    const imagePath = path.join(__dirname, '..', 'public', 'uploads', filename);
    fs.unlink(imagePath, err => {
        if (err && err.code !== 'ENOENT') {
            console.error(`Error deleting image file ${filename}:`, err);
        }
    });
};

// Helper: Format a DB row for the client
const formatQuestionRowForResponse = (dbRow) => {
    if (!dbRow) return null;
    return {
        q_id: dbRow.q_id,
        text: dbRow.text,
        options: safeJsonParse(dbRow.options_json, []),
        correctAnswer: dbRow.correctanswer,
        difficulty: dbRow.difficulty,
        points: dbRow.points,
        landmark_name: dbRow.landmark_name,
        is_general: Boolean(dbRow.is_general),
        type: dbRow.type,
        image_filename: dbRow.image_filename,
        image_firebase_url: dbRow.image_firebase_url
            ? dbRow.image_firebase_url
            : (dbRow.image_filename ? `${baseImageUrl}${dbRow.image_filename}` : null)
    };
};

// ===== GET all questions =====
router.get('/', async (req, res, next) => {
    const sql = `
        SELECT q_id, text, options_json, correctanswer,
               difficulty, points, landmark_name,
               is_general, type, image_filename, image_firebase_url
        FROM questions
        ORDER BY q_id DESC
    `;
    try {
        const result = await pool.query(sql);
        const questions = result.rows.map(formatQuestionRowForResponse);
        res.json({ questions });
    } catch (err) {
        console.error("Error fetching questions:", err.stack);
        next(new Error('Failed to retrieve questions. Details: ' + err.message));
    }
});

// ===== GET a single question by ID =====
router.get('/:id', async (req, res, next) => {
    const { id } = req.params;
    const sql = `
        SELECT q_id, text, options_json, correctanswer,
               difficulty, points, landmark_name,
               is_general, type, image_filename, image_firebase_url
        FROM questions
        WHERE q_id = $1
    `;
    try {
        const result = await pool.query(sql, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: `Question with ID ${id} not found.` });
        }
        // استخدم نفس الدالة المساعدة لتنسيق الاستجابة
        const question = formatQuestionRowForResponse(result.rows[0]);
        res.json({ question }); // تأكد من أن الاستجابة تحتوي على كائن بداخله مفتاح 'question'
    } catch (err) {
        console.error(`Error fetching question ${id}:`, err.stack);
        next(new Error(`Failed to retrieve question ${id}. Details: ${err.message}`));
    }
});


// ===== POST create a new question =====
router.post('/', upload.single('image'), async (req, res, next) => {
    const {
        text, options, correctAnswer,
        difficulty, points, landmark_name,
        type = 'mcq'
    } = req.body;
    const isGeneralBool = String(req.body.is_general).toLowerCase() === 'true';
    const isGeneralInt  = isGeneralBool ? 1 : 0;

    if (!text || !correctAnswer || !difficulty || options === undefined || points === undefined) {
        if (req.file) deleteImageFile(req.file.filename);
        return res.status(400).json({ message: 'Missing required fields.' });
    }

    const q_id           = `q_${uuidv4()}`;
    const image_filename = req.file ? req.file.filename : null;
    const optsArr        = safeJsonParse(options, null);
    if (optsArr === null) {
        if (req.file) deleteImageFile(req.file.filename);
        return res.status(400).json({ message: 'Invalid options format.' });
    }
    const pointsInt = parseInt(points, 10);
    if (isNaN(pointsInt)) {
        if (req.file) deleteImageFile(req.file.filename);
        return res.status(400).json({ message: 'Points must be a number.' });
    }

    const sql = `
    INSERT INTO questions (
      q_id, text, options_json, correctanswer,
      difficulty, points, landmark_name,
      is_general, type, image_filename, image_firebase_url
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *
  `;
    const params = [
        q_id,
        text,
        JSON.stringify(optsArr),
        correctAnswer,
        difficulty,
        pointsInt,
        (landmark_name && !isGeneralBool && landmark_name !== 'سؤال عام') ? landmark_name : null,
        isGeneralInt,
        type,
        image_filename,
        null
    ];

    try {
        const result = await pool.query(sql, params);
        res.status(201).json({
            message: 'Question added successfully',
            question: formatQuestionRowForResponse(result.rows[0])
        });
    } catch (err) {
        console.error('Error inserting question:', err.stack);
        if (image_filename) deleteImageFile(image_filename);
        next(new Error('Failed to add question. Details: ' + err.message));
    }
});

// ===== PUT update an existing question =====
router.put('/:id', upload.single('image'), async (req, res, next) => {
    const { id } = req.params;
    const {
        text, options, correctAnswer,
        difficulty, points, landmark_name,
        type = 'mcq', remove_image
    } = req.body;
    const isGeneralBool = String(req.body.is_general).toLowerCase() === 'true';
    const isGeneralInt  = isGeneralBool ? 1 : 0;
    const newImageFilename = req.file ? req.file.filename : undefined;
    const shouldRemoveImage = String(remove_image).toLowerCase() === 'true';

    if (!text || !correctAnswer || !difficulty || options === undefined || points === undefined) {
        if (newImageFilename) deleteImageFile(newImageFilename);
        return res.status(400).json({ message: 'Missing required fields.' });
    }

    try {
        // Fetch existing row
        const current = await pool.query(
            "SELECT image_filename, image_firebase_url FROM questions WHERE q_id = $1",
            [id]
        );
        if (!current.rows.length) {
            if (newImageFilename) deleteImageFile(newImageFilename);
            return res.status(404).json({ message: 'Question not found.' });
        }
        const oldImage = current.rows[0].image_filename;
        let finalImageFilename   = oldImage;
        let finalImageFirebaseUrl = current.rows[0].image_firebase_url;

        if (newImageFilename) {
            finalImageFilename   = newImageFilename;
            finalImageFirebaseUrl = null;
        } else if (shouldRemoveImage) {
            finalImageFilename   = null;
            finalImageFirebaseUrl = null;
        }

        const optsArr = safeJsonParse(options, null);
        if (optsArr === null) {
            if (newImageFilename) deleteImageFile(newImageFilename);
            return res.status(400).json({ message: 'Invalid options format.' });
        }
        const pointsInt = parseInt(points, 10);
        if (isNaN(pointsInt)) {
            if (newImageFilename) deleteImageFile(newImageFilename);
            return res.status(400).json({ message: 'Points must be a number.' });
        }

        const sql = `
      UPDATE questions SET
        text = $1, options_json = $2, correctanswer = $3, difficulty = $4,
        points = $5, landmark_name = $6, is_general = $7, type = $8,
        image_filename = $9, image_firebase_url = $10
      WHERE q_id = $11
      RETURNING *
    `;
        const params = [
            text,
            JSON.stringify(optsArr),
            correctAnswer,
            difficulty,
            pointsInt,
            (landmark_name && !isGeneralBool && landmark_name !== 'سؤال عام') ? landmark_name : null,
            isGeneralInt,
            type,
            finalImageFilename,
            finalImageFirebaseUrl,
            id
        ];

        const updateRes = await pool.query(sql, params);
        if (!updateRes.rowCount) {
            if (newImageFilename) deleteImageFile(newImageFilename);
            return res.status(404).json({ message: 'No changes made or question not found.' });
        }

        // Remove old image file if replaced/removed
        if (oldImage && (newImageFilename || shouldRemoveImage)) {
            if (oldImage !== newImageFilename) {
                deleteImageFile(oldImage);
            }
        }

        res.json({
            message: 'Question updated successfully',
            question: formatQuestionRowForResponse(updateRes.rows[0])
        });
    } catch (err) {
        console.error(`Error updating question ${id}:`, err.stack);
        if (newImageFilename) deleteImageFile(newImageFilename);
        next(new Error(`Failed to update question. Details: ${err.message}`));
    }
});

// ===== DELETE a question =====
router.delete('/:id', async (req, res, next) => {
    const { id } = req.params;
    try {
        // Get current image
        const sel = await pool.query("SELECT image_filename FROM questions WHERE q_id = $1", [id]);
        if (!sel.rows.length) {
            return res.status(404).json({ message: 'Question not found.' });
        }

        // Delete record
        const del = await pool.query("DELETE FROM questions WHERE q_id = $1", [id]);
        if (!del.rowCount) {
            return res.status(404).json({ message: 'Question not deleted.' });
        }

        // Delete image file
        if (sel.rows[0].image_filename) {
            deleteImageFile(sel.rows[0].image_filename);
        }

        res.json({ message: `Question ${id} deleted successfully.` });
    } catch (err) {
        console.error(`Error deleting question ${id}:`, err.stack);
        next(new Error(`Failed to delete question. Details: ${err.message}`));
    }
});

module.exports = router;