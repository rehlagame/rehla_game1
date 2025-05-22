// middleware/authMiddleware.js
const admin = require('firebase-admin'); // يفترض أنه تم تهيئته في server.js

async function verifyFirebaseToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).send({ message: 'Unauthorized: No token provided or incorrect format.' });
    }
    const idToken = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedToken; // أضف معلومات المستخدم التي تم فك تشفيرها إلى كائن الطلب
        next();
    } catch (error) {
        console.error('Error verifying Firebase token in middleware:', error);
        // يمكنك إرجاع رسالة خطأ أكثر تحديدًا إذا كان الخطأ بسبب انتهاء صلاحية التوكن
        if (error.code === 'auth/id-token-expired') {
            return res.status(401).send({ message: 'Unauthorized: Token expired. Please re-authenticate.' });
        }
        return res.status(403).send({ message: 'Unauthorized: Invalid token.' });
    }
}

module.exports = { verifyFirebaseToken };