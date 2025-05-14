// انتظر حتى يتم تحميل محتوى الصفحة بالكامل قبل تشغيل الكود
document.addEventListener('DOMContentLoaded', () => {

    // --- 1. التمرير السلس (Smooth Scrolling) ---
    const navLinks = document.querySelectorAll('header nav a[href^="#"], .hero a[href^="#"]'); // اختر روابط القائمة وروابط قسم الهيرو التي تبدأ بـ #

    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault(); // منع السلوك الافتراضي للرابط (القفز)

            const targetId = this.getAttribute('href'); // الحصول على معرف القسم المستهدف (مثل #how-to-play)
            const targetElement = document.querySelector(targetId); // العثور على العنصر المستهدف

            if (targetElement) {
                // حساب موقع العنصر مع الأخذ في الاعتبار ارتفاع الهيدر (إذا كان ثابتًا)
                const headerOffset = document.querySelector('header').offsetHeight;
                const elementPosition = targetElement.getBoundingClientRect().top + window.pageYOffset;
                const offsetPosition = elementPosition - headerOffset - 10; // طرح ارتفاع الهيدر ومسافة إضافية صغيرة

                // التمرير السلس إلى الموقع المحسوب
                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth' // هذا هو مفتاح التمرير السلس!
                });

                // (اختياري) إغلاق قائمة الجوال إذا كانت مفتوحة (للتطوير المستقبلي)
                // closeMobileMenu();
            }
        });
    });

    // --- 2. تمييز الرابط النشط (Active Link Highlighting) ---
    const sections = document.querySelectorAll('section[id]'); // اختر كل الأقسام التي لها ID
    const headerNavLinks = document.querySelectorAll('header nav a'); // اختر روابط القائمة في الهيدر فقط

    // استخدام Intersection Observer لمراقبة دخول الأقسام إلى الشاشة (أكثر كفاءة من مراقبة التمرير)
    const observerOptions = {
        root: null, // نسبة إلى إطار العرض (viewport)
        rootMargin: `-${document.querySelector('header').offsetHeight}px 0px -40% 0px`, // تعديل منطقة المراقبة لتناسب الهيدر الثابت ولتفعيل التمييز عندما يكون القسم ظاهرًا بشكل جيد
        threshold: 0 // يتم التفعيل بمجرد ظهور أي جزء من القسم (يمكن زيادته مثل 0.3 لـ 30%)
    };

    const sectionObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const targetLink = document.querySelector(`header nav a[href="#${entry.target.id}"]`);

                // قم بإزالة التمييز من جميع الروابط أولاً
                headerNavLinks.forEach(link => link.classList.remove('active'));

                // أضف التمييز إلى الرابط المطابق للقسم الظاهر
                if (targetLink) {
                    targetLink.classList.add('active');
                }
            }
        });
    }, observerOptions);

    // ابدأ بمراقبة كل قسم
    sections.forEach(section => {
        sectionObserver.observe(section);
    });

    // --- 3. تحسينات طفيفة (مثال: تأثير ظهور بسيط عند التمرير) ---
    // يمكنك إضافة مكتبة مثل AOS (Animate On Scroll) أو كتابة كود مخصص
    // مثال بسيط جداً: تغيير شفافية الهيدر عند التمرير لأسفل
    const header = document.querySelector('header');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) { // إذا تم التمرير لأكثر من 50 بكسل
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });

}); // نهاية DOMContentLoaded