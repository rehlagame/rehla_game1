// انتظر حتى يتم تحميل محتوى الصفحة بالكامل قبل تشغيل الكود
document.addEventListener('DOMContentLoaded', () => {

    const header = document.querySelector('header');
    // استهداف العنصر الذي يأتي مباشرة بعد الهيدر
    const mainContentElement = header ? header.nextElementSibling : null;

    // --- دالة لضبط حشوة المحتوى الرئيسي (مهمة مع الهيدر الـ fixed) ---
    function adjustMainContentPaddingLocal() {
        if (header && mainContentElement) {
            // تأكد أن الهيدر بالفعل fixed قبل تطبيق الحشوة
            if (getComputedStyle(header).position === 'fixed') {
                const headerHeight = header.offsetHeight;
                mainContentElement.style.paddingTop = `${headerHeight}px`;
                // console.log(`[ScriptJS] Applied paddingTop: ${headerHeight}px to`, mainContentElement);
            } else {
                // إذا لم يكن الهيدر fixed، أزل الحشوة
                mainContentElement.style.paddingTop = '0px';
            }
        } else {
            if (!header) console.warn("[ScriptJS] Header element not found for padding adjustment.");
            if (!mainContentElement) console.warn("[ScriptJS] Main content element (sibling after header) not found. Check page structure or selector in script.js.");
        }
    }

    // طبق الحشوة عند تحميل الصفحة وعند تغيير حجم النافذة (إذا كان الهيدر fixed)
    if (header && getComputedStyle(header).position === 'fixed') {
        adjustMainContentPaddingLocal(); // Apply on initial load
        window.addEventListener('resize', adjustMainContentPaddingLocal);
    } else if (header && mainContentElement) { // If header exists but is not fixed
        mainContentElement.style.paddingTop = '0px';
    }

    // --- (تم حذف منطق إخفاء/إظهار الهيدر عند التمرير من هنا) ---

    // --- (اختياري) إضافة/إزالة كلاس .scrolled للهيدر الثابت عند التمرير ---
    // هذا يسمح بتغييرات بصرية طفيفة (مثل الظل) معرفة في CSS
    if (header) {
        window.addEventListener('scroll', function() {
            if (window.pageYOffset > 10) { // يمكنك تعديل هذا المقدار (10px)
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
        });
        // قم بتطبيق الكلاس عند تحميل الصفحة إذا كان المستخدم قد قام بالتمرير بالفعل
        if (window.pageYOffset > 10) {
            header.classList.add('scrolled');
        }
    }


    // --- 2. التمرير السلس (Smooth Scrolling) ---
    // (هذا الجزء مخصص بشكل أساسي لـ index.html حيث توجد روابط داخلية للأقسام)
    const navLinks = document.querySelectorAll('header nav a[href^="#"], .hero a[href^="#"]');

    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const targetId = this.getAttribute('href');
            // تأكد أن الرابط هو رابط داخلي (#) وليس رابط لصفحة أخرى
            if (targetId.startsWith('#')) {
                e.preventDefault(); // منع السلوك الافتراضي فقط للروابط الداخلية
                const targetElement = document.querySelector(targetId);

                if (targetElement && header) { // التأكد من وجود الهيدر
                    // (لم نعد بحاجة لإزالة header-hidden هنا لأن الهيدر ثابت)
                    // إذا أضفنا كلاس .scrolled سابقاً، تأكد أنه موجود إذا لم نكن في الأعلى
                    if (window.scrollY > 10) {
                        header.classList.add('scrolled');
                    }

                    // لا حاجة لـ setTimeout هنا إذا كان الهيدر دائماً ظاهر وثابت الارتفاع نسبياً
                    const currentHeaderHeight = header.offsetHeight;
                    const headerOffset = (getComputedStyle(header).position === 'fixed') ? currentHeaderHeight : 0;
                    const elementPosition = targetElement.getBoundingClientRect().top + window.pageYOffset;
                    const offsetPosition = elementPosition - headerOffset - 10; // مسافة إضافية صغيرة

                    window.scrollTo({
                        top: offsetPosition,
                        behavior: 'smooth'
                    });

                } else if (targetElement) { // إذا لم يكن الهيدر موجودًا أو ليس fixed، قم بالتمرير العادي
                    const elementPosition = targetElement.getBoundingClientRect().top + window.pageYOffset;
                    window.scrollTo({
                        top: elementPosition - 10,
                        behavior: 'smooth'
                    });
                }
            }
        });
    });

    // --- 3. تمييز الرابط النشط (Active Link Highlighting) ---
    // (هذا الجزء مخصص بشكل أساسي لـ index.html)
    const sections = document.querySelectorAll('section[id]');
    const headerNavLinks = document.querySelectorAll('header nav a');

    if (sections.length > 0 && headerNavLinks.length > 0 && header) {
        let currentHeaderHeightForObserver = header.offsetHeight;
        if (getComputedStyle(header).position !== 'fixed') {
            currentHeaderHeightForObserver = 70; // قيمة افتراضية إذا لم يكن fixed
        }

        // تحديث ارتفاع الهيدر للمراقب عند تغيير حجم النافذة
        const observerResize = new ResizeObserver(() => {
            if (getComputedStyle(header).position === 'fixed') {
                currentHeaderHeightForObserver = header.offsetHeight;
            }
            // إعادة تهيئة المراقب بـ rootMargin الجديد قد يكون ضرورياً هنا
            // أو التأكد من أن دالة get rootMargin تستخدم القيمة المحدثة
        });
        observerResize.observe(header);


        const observerOptions = {
            root: null,
            get rootMargin() {
                // تأكد أننا نحصل على الارتفاع المحدث للهيدر هنا
                const dynamicHeaderHeight = header ? header.offsetHeight : 70;
                return `-${dynamicHeaderHeight}px 0px -40% 0px`;
            },
            threshold: 0.1
        };

        const sectionObserver = new IntersectionObserver((entries, observer) => {
            // لا حاجة لتحديث rootMargin هنا بشكل صريح إذا كانت دالة get تعمل بشكل صحيح
            // observer.rootMargin = `-${header.offsetHeight}px 0px -40% 0px`;

            entries.forEach(entry => {
                const targetLink = document.querySelector(`header nav a[href="#${entry.target.id}"]`);
                if (entry.isIntersecting && entry.intersectionRatio > 0.1) { // استخدام نفس الـ threshold
                    headerNavLinks.forEach(link => link.classList.remove('active'));
                    if (targetLink) {
                        targetLink.classList.add('active');
                    }
                }
            });
        }, observerOptions);

        sections.forEach(section => {
            sectionObserver.observe(section);
        });
    }

}); // نهاية DOMContentLoaded
