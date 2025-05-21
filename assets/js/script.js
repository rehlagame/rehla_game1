// انتظر حتى يتم تحميل محتوى الصفحة بالكامل قبل تشغيل الكود
document.addEventListener('DOMContentLoaded', () => {

    const header = document.querySelector('header');
    // استهداف العنصر الذي يأتي مباشرة بعد الهيدر
    // هذا يفترض أن العنصر الرئيسي للمحتوى هو دائمًا الشقيق التالي للهيدر
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


    // --- 1. منطق إخفاء/إظهار الهيدر عند التمرير ---
    let lastScrollTop = 0;
    const delta = 10; // مقدار التمرير قبل التحديث (لمنع التحديث المتكرر جدًا)
    let headerHeight = header ? header.offsetHeight : 70; // قيمة افتراضية إذا لم يوجد الهيدر
    let didScroll; // علامة لتتبع ما إذا كان التمرير قد حدث

    if (header) {
        // تحديث ارتفاع الهيدر عند تغيير حجم النافذة (مهم إذا كان ارتفاع الهيدر ديناميكيًا)
        window.addEventListener('resize', () => {
            headerHeight = header.offsetHeight;
            // أعد تطبيق الحشوة إذا كان الهيدر fixed وتغير ارتفاعه
            if (getComputedStyle(header).position === 'fixed') {
                adjustMainContentPaddingLocal();
            }
        });

        window.addEventListener('scroll', function() {
            didScroll = true; // عين العلامة عند حدوث التمرير
        });

        // استخدام setInterval للتحقق من التمرير بشكل دوري بدلاً من كل حدث scroll
        setInterval(function() {
            if (didScroll) { // إذا حدث تمرير
                hasScrolled(); // قم بتشغيل منطق إخفاء/إظهار الهيدر
                didScroll = false; // أعد تعيين العلامة
            }
        }, 150); // تحقق كل 150 مللي ثانية (يمكن تعديل هذه القيمة)
    }

    function hasScrolled() {
        if (!header) return; // تأكد من وجود الهيدر

        const st = window.pageYOffset || document.documentElement.scrollTop; // موضع التمرير الحالي

        // تأكد أننا مررنا أكثر من مقدار delta لتجنب "الاهتزاز"
        if (Math.abs(lastScrollTop - st) <= delta)
            return;

        // إذا مررنا للأسفل وموضع التمرير الحالي أكبر من ارتفاع الهيدر (لتجنب الإخفاء في أعلى الصفحة)
        if (st > lastScrollTop && st > headerHeight){
            // Scroll Down
            header.classList.add('header-hidden');
            // يمكنك إزالة .scrolled إذا كنت لا تريده عندما يكون الهيدر مخفياً
            // header.classList.remove('scrolled');
        } else {
            // Scroll Up
            // أو إذا كنا في أعلى الصفحة (st < headerHeight)
            if (st + window.innerHeight < document.documentElement.scrollHeight || st < headerHeight) {
                header.classList.remove('header-hidden');
                // أضف .scrolled إذا لم نكن في قمة الصفحة تمامًا بعد إظهار الهيدر
                if (st > 10) {
                    header.classList.add('scrolled');
                } else {
                    header.classList.remove('scrolled');
                }
            }
        }
        lastScrollTop = st <= 0 ? 0 : st; // For Mobile or negative scrolling
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
                    // عند النقر على رابط داخلي، أظهر الهيدر أولاً إذا كان مخفيًا
                    header.classList.remove('header-hidden');
                    if (window.scrollY > 10) { // إذا لم نكن في الأعلى، أضف scrolled
                        header.classList.add('scrolled');
                    }

                    // تأخير بسيط للسماح للهيدر بالظهور وإعادة حساب ارتفاعه قبل حساب الإزاحة
                    setTimeout(() => {
                        const currentHeaderHeight = header.offsetHeight; // احصل على الارتفاع الحالي للهيدر
                        const headerOffset = (getComputedStyle(header).position === 'fixed') ? currentHeaderHeight : 0;
                        const elementPosition = targetElement.getBoundingClientRect().top + window.pageYOffset;
                        const offsetPosition = elementPosition - headerOffset - 10; // مسافة إضافية صغيرة

                        window.scrollTo({
                            top: offsetPosition,
                            behavior: 'smooth'
                        });
                    }, 50); // تأخير بسيط، يمكن زيادته إذا لزم الأمر
                } else if (targetElement) { // إذا لم يكن الهيدر موجودًا أو ليس fixed، قم بالتمرير العادي
                    const elementPosition = targetElement.getBoundingClientRect().top + window.pageYOffset;
                    window.scrollTo({
                        top: elementPosition - 10, // مسافة صغيرة من الأعلى
                        behavior: 'smooth'
                    });
                }
            }
        });
    });

    // --- 3. تمييز الرابط النشط (Active Link Highlighting) ---
    // (هذا الجزء مخصص بشكل أساسي لـ index.html)
    const sections = document.querySelectorAll('section[id]');
    const headerNavLinks = document.querySelectorAll('header nav a'); // روابط القائمة في الهيدر

    if (sections.length > 0 && headerNavLinks.length > 0 && header) { // فقط إذا كانت هناك أقسام وروابط لمراقبتها، والهيدر موجود
        let currentHeaderHeightForObserver = header.offsetHeight; // القيمة الأولية
        if (getComputedStyle(header).position !== 'fixed') {
            currentHeaderHeightForObserver = 70; // قيمة افتراضية إذا لم يكن fixed
        }

        // تحديث ارتفاع الهيدر للمراقب عند تغيير حجم النافذة
        new ResizeObserver(() => {
            if (getComputedStyle(header).position === 'fixed') {
                currentHeaderHeightForObserver = header.offsetHeight;
            }
        }).observe(header);


        const observerOptions = {
            root: null,
            // استخدام دالة للحصول على rootMargin ديناميكيًا
            get rootMargin() { return `-${currentHeaderHeightForObserver}px 0px -40% 0px`; },
            threshold: 0.1 // يمكن تعديل هذه القيمة (0 إلى 1)
        };

        const sectionObserver = new IntersectionObserver((entries, observer) => {
            // تحديث rootMargin إذا تغير ارتفاع الهيدر (على الرغم من أن ResizeObserver يجب أن يعتني بهذا)
            observer.rootMargin = `-${header.offsetHeight}px 0px -40% 0px`;

            entries.forEach(entry => {
                const targetLink = document.querySelector(`header nav a[href="#${entry.target.id}"]`);
                if (entry.isIntersecting && entry.intersectionRatio > 0) { // التأكد أن القسم ظاهر بالفعل
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

    // --- (لم نعد بحاجة لتأثير scrolled هنا بشكل منفصل، يتم التعامل معه في hasScrolled) ---

}); // نهاية DOMContentLoaded
