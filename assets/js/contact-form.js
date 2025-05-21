document.addEventListener('DOMContentLoaded', () => {
    const contactForm = document.getElementById('contact-us-form');
    const submitButton = document.getElementById('submit-contact-form-btn');
    const formStatus = document.getElementById('contact-form-status');

    // تأكد أن RENDER_API_BASE_URL مُعرف عالميًا (عادةً من main.js)
    // أو عرفه هنا كقيمة احتياطية إذا كان هذا الملف مستقلاً
    const RENDER_API_BASE_URL_CONTACT = (typeof window !== 'undefined' && window.RENDER_API_BASE_URL)
        ? window.RENDER_API_BASE_URL
        : 'https://rehla-game-backend.onrender.com'; // Fallback URL

    if (contactForm && submitButton && formStatus) {
        contactForm.addEventListener('submit', async (event) => {
            event.preventDefault(); // منع الإرسال الافتراضي

            submitButton.disabled = true;
            submitButton.textContent = 'جارٍ الإرسال...';
            formStatus.textContent = ''; // مسح الحالة السابقة
            formStatus.style.color = ''; // إعادة لون النص للحالة الافتراضية

            const formData = {
                name: document.getElementById('contact-name').value,
                from_email: document.getElementById('contact-email').value, // اسم الحقل مهم للباك اند (from_email وليس email)
                subject: document.getElementById('contact-subject').value,
                body: document.getElementById('contact-message').value,
                // يمكنك إضافة حقول مخفية إذا أردت، مثل مصدر النموذج
                source: 'Rehla Game Contact Page Form'
            };

            try {
                // استبدل '/api/contact/send-email' بالـ endpoint الصحيح في الواجهة الخلفية لديك
                // هذا هو الجزء الذي ستحتاج إلى إنشائه في خادم Node.js الخاص بك
                const response = await fetch(`${RENDER_API_BASE_URL_CONTACT}/api/contact/send-email`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        // إذا كان الـ endpoint يتطلب توكن (مثل توكن المستخدم المسجل)، أضفه هنا:
                        // 'Authorization': `Bearer YOUR_USER_TOKEN_IF_NEEDED`
                        // بما أن هذا نموذج اتصال عام، قد لا تحتاج لتوكن مستخدم.
                    },
                    body: JSON.stringify(formData),
                });

                const responseData = await response.json(); // حاول دائماً قراءة الرد كـ JSON

                if (response.ok) {
                    formStatus.textContent = responseData.message || 'تم إرسال رسالتك بنجاح! سنقوم بالرد عليك قريباً.';
                    formStatus.style.color = 'var(--success-color)'; // استخدم متغير CSS للون النجاح
                    contactForm.reset(); // مسح حقول النموذج بعد الإرسال الناجح
                } else {
                    // عرض رسالة الخطأ من الخادم إذا كانت موجودة، وإلا رسالة عامة
                    formStatus.textContent = responseData.message || 'عفواً، حدث خطأ أثناء إرسال الرسالة. يرجى المحاولة مرة أخرى أو مراسلتنا مباشرة.';
                    formStatus.style.color = 'var(--danger-color)'; // استخدم متغير CSS للون الخطأ
                }
            } catch (error) {
                console.error('Error submitting contact form:', error);
                formStatus.textContent = 'حدث خطأ غير متوقع في الاتصال. يرجى التحقق من اتصالك بالإنترنت أو المحاولة لاحقاً.';
                formStatus.style.color = 'var(--danger-color)';
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = 'إرسال الرسالة';
            }
        });
    } else {
        console.warn('Contact form elements not found. Ensure IDs are correct in contact.html.');
    }
});