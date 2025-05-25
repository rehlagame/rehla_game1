// script.js

// انتظر حتى يتم تحميل محتوى الصفحة بالكامل قبل تشغيل الكود
document.addEventListener('DOMContentLoaded', () => {

    const header = document.querySelector('header');
    // لقد أُزيلت هنا جميع منطق ضبط padding للمحتوى الرئيسي
    // (كان يُستخدم لتعويض ارتفاع الهيدر الثابت الذي أزلناه)

    // --- 1. تأثير إضافة/إزالة كلاس .scrolled للهيدر عند التمرير ---
    // يسمح بتغييرات بصرية طفيفة مثل الظل عند النزول
    if (header) {
        window.addEventListener('scroll', () => {
            if (window.pageYOffset > 10) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
        });
        // تطبيق الكلاس مباشرة إذا كانت الصفحة قد بدأت بتمرير سابق
        if (window.pageYOffset > 10) {
            header.classList.add('scrolled');
        }
    }

    // --- 2. التمرير السلس (Smooth Scrolling) ---
    // خاص بالروابط الداخلية في الهيدر أو في الهيرو
    const navLinks = document.querySelectorAll('header nav a[href^="#"], .hero a[href^="#"]');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const targetId = this.getAttribute('href');
            if (targetId.startsWith('#')) {
                e.preventDefault();
                const targetElement = document.querySelector(targetId);
                if (!targetElement) return;

                // حساب الموضع مع تعويض ارتفاع الهيدر إذا كان ثابتاً
                const headerHeight = header && getComputedStyle(header).position === 'fixed'
                    ? header.offsetHeight
                    : 0;
                const elementPosition = targetElement.getBoundingClientRect().top + window.pageYOffset;
                const offsetPosition = elementPosition - headerHeight - 10;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // --- 3. تمييز الرابط النشط (Active Link Highlighting) ---
    const sections = document.querySelectorAll('section[id]');
    const headerNavLinks = document.querySelectorAll('header nav a');
    if (sections.length > 0 && headerNavLinks.length > 0 && header) {
        // مراقب لتغيّر ارتفاع الهيدر لوظيفته كـ fixed
        let currentHeaderHeight = header.offsetHeight;
        const resizeObserver = new ResizeObserver(() => {
            currentHeaderHeight = header.offsetHeight;
        });
        resizeObserver.observe(header);

        const observerOptions = {
            root: null,
            rootMargin: `-${currentHeaderHeight}px 0px -40% 0px`,
            threshold: 0.1
        };

        const sectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const link = document.querySelector(`header nav a[href="#${entry.target.id}"]`);
                if (entry.isIntersecting && entry.intersectionRatio > 0.1) {
                    headerNavLinks.forEach(l => l.classList.remove('active'));
                    if (link) link.classList.add('active');
                }
            });
        }, observerOptions);

        sections.forEach(section => sectionObserver.observe(section));
    }

}); // end of DOMContentLoaded
