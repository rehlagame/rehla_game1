// --- إعدادات الخريطة الأساسية ---

// 1. تحديد إحداثيات مركز الخريطة (وسط الكويت تقريباً) ومستوى التكبير الأولي
const kuwaitCoords = [29.3117, 47.4818]; // خط العرض، خط الطول
const initialZoom = 8; // مستوى تكبير مناسب لعرض الكويت كاملة

// 2. إنشاء كائن الخريطة وربطه بعنصر الـ div#map في HTML
//    وتحديد العرض الأولي (المركز ومستوى التكبير)
const map = L.map('map').setView(kuwaitCoords, initialZoom);

// --- إضافة طبقة الخريطة الأساسية (Tile Layer) ---

// 3. استخدام طبقة OpenStreetMap الأساسية
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    // 4. تحديد المصدر (مهم لحقوق الملكية)
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map); // 5. إضافة الطبقة إلى الخريطة


// --- إضافة عناصر تفاعلية (مثال: علامة Marker) ---

// 6. إضافة علامة (Marker) على مدينة الكويت
const kuwaitCityCoords = [29.3759, 47.9774]; // إحداثيات مدينة الكويت
const marker = L.marker(kuwaitCityCoords).addTo(map); // إضافة العلامة للخريطة

// 7. إضافة نافذة منبثقة (Popup) للعلامة تظهر عند النقر
marker.bindPopup("<b>مدينة الكويت</b><br>عاصمة دولة الكويت.").openPopup(); // .openPopup() لفتحها تلقائياً عند التحميل (اختياري)


// --- (اختياري) يمكنك إضافة المزيد من العناصر هنا ---

// مثال: إضافة علامة أخرى لمنطقة الأحمدي
const alAhmadiCoords = [29.0769, 48.0878];
L.marker(alAhmadiCoords)
 .addTo(map)
 .bindPopup("<b>الأحمدي</b>");

// مثال: إضافة دائرة حول العاصمة
// L.circle(kuwaitCityCoords, {
//     color: 'darkblue', // لون الحدود
//     fillColor: '#ADD8E6', // لون التعبئة (أزرق فاتح)
//     fillOpacity: 0.3, // شفافية التعبئة
//     radius: 20000 // نصف القطر بالمتر (20 كم)
// }).addTo(map).bindPopup("دائرة حول مدينة الكويت (مثال)");

// مثال: إضافة مضلع (Polygon) لتحديد منطقة (إحداثيات عشوائية كمثال)
// const polygonCoords = [
//     [29.5, 47.5],
//     [29.6, 47.8],
//     [29.4, 47.9],
//     [29.3, 47.6]
// ];
// L.polygon(polygonCoords, {
//     color: 'red',
//     fillColor: '#f03',
//     fillOpacity: 0.2
// }).addTo(map).bindPopup("منطقة محددة (مثال)");


// يمكنك إضافة مستمعي أحداث للنقر على الخريطة نفسها
// map.on('click', function(e) {
//     alert("لقد نقرت على الخريطة عند: " + e.latlng);
// });