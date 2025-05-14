// --- main.js ---

// Firebase App (NOW TYPE MODULE)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
// Firebase Authentication
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    GoogleAuthProvider,
    OAuthProvider, // For Apple Sign-In
    signInWithPopup,
    signOut,
    onAuthStateChanged,
    updateProfile,
    reauthenticateWithCredential, // For password change
    EmailAuthProvider, // For reauthentication
    updatePassword // For password change
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
// Firebase Storage
import {
    getStorage,
    ref as storageRef, // Aliased to avoid conflict with Vue's ref if used in future
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";
// Firebase Firestore (Optional - uncomment if/when you integrate it)
/*
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    increment // If you use Firestore for game counts
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
*/

const firebaseConfig = {
    apiKey: "AIzaSyA5vUQpt15Y2INFgUoBMQgaNkashAhxWTM", // Your actual API key
    authDomain: "rehlaapp-9a985.firebaseapp.com",
    projectId: "rehlaapp-9a985",
    storageBucket: "rehlaapp-9a985.appspot.com",
    messagingSenderId: "827594007582",
    appId: "1:827594007582:web:cb07445443b72ce7cb7a0f"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);
// const db = getFirestore(app); // Uncomment if using Firestore

// --- Constants ---
const USER_GAMES_KEY_PREFIX = 'rehlaUserGames_';
const PROMO_API_URL = 'http://localhost:3001/api/promos'; // Backend URL for promos

// --- DOM Element Selectors (Cached for performance) ---
const userActionsContainer = document.querySelector('header .user-actions');
// For auth.html
const registerEmailFormEl = document.getElementById('register-email-form');
const loginEmailFormEl = document.getElementById('login-email-form');
const resetPasswordFormEl = document.getElementById('reset-password-form');
const googleSignInButtonEl = document.getElementById('google-signin-btn');
const appleSignInButtonEl = document.getElementById('apple-signin-btn');
const authErrorMessageDiv = document.getElementById('auth-error-message');
const resetSuccessMessageDiv = document.getElementById('reset-success-message');
// For Logged.html
const profilePageElements = {
    userPhoto: document.getElementById('user-photo-logged'),
    photoUploadInput: document.getElementById('photo-upload-logged'),
    summaryName: document.getElementById('profile-summary-name'),
    summaryEmail: document.getElementById('profile-summary-email'),
    infoForm: document.getElementById('profile-info-form'),
    firstNameInput: document.getElementById('profile-first-name'),
    lastNameInput: document.getElementById('profile-last-name'),
    countryCodeSelect: document.getElementById('profile-country-code'),
    phoneInput: document.getElementById('profile-phone'),
    emailInput: document.getElementById('profile-email'),
    // dobInput: document.getElementById('profile-dob'), // Ensure this exists if used
    displayNameInput: document.getElementById('profile-display-name'),
    updateSuccessDiv: document.getElementById('profile-update-success'),
    updateErrorDiv: document.getElementById('profile-update-error'),
    changePasswordForm: document.getElementById('change-password-form-logged'),
    passwordChangeSuccessDiv: document.getElementById('password-change-success'),
    passwordChangeErrorDiv: document.getElementById('password-change-error'),
    logoutBtnSidebar: document.getElementById('logout-btn-sidebar'),
    deleteAccountBtn: document.querySelector('.btn-delete-account-logged'),
    tabLinks: document.querySelectorAll('.tab-link'),
    tabContents: document.querySelectorAll('.tab-content')
};
// For index.html
const mainPlayButtonEl = document.querySelector('main.hero .btn-play');


// --- Helper Functions ---
const showAuthError = (message, targetDiv = authErrorMessageDiv) => {
    if (targetDiv) {
        targetDiv.textContent = message;
        targetDiv.style.display = 'block';
    } else {
        console.warn("Target div for error message not found, alerting instead:", message);
        alert(message);
    }
    if (targetDiv === authErrorMessageDiv && resetSuccessMessageDiv) {
        resetSuccessMessageDiv.style.display = 'none';
    }
};

const showSuccessMessage = (message, targetDiv) => {
    if (targetDiv) {
        targetDiv.textContent = message;
        targetDiv.style.display = 'block';
    } else {
        console.warn("Target div for success message not found, alerting instead:", message);
        alert(message);
    }
};

const hideAuthMessages = (errorDiv = authErrorMessageDiv, successDiv = resetSuccessMessageDiv) => {
    if (errorDiv) errorDiv.style.display = 'none';
    if (successDiv) successDiv.style.display = 'none';
};

const getFriendlyErrorMessage = (errorCode) => {
    switch (errorCode) {
        case 'auth/invalid-email': return 'البريد الإلكتروني غير صالح.';
        case 'auth/user-disabled': return 'تم تعطيل هذا الحساب.';
        case 'auth/user-not-found': return 'لا يوجد حساب بهذا البريد الإلكتروني.';
        case 'auth/wrong-password': return 'كلمة المرور غير صحيحة.';
        case 'auth/email-already-in-use': return 'هذا البريد الإلكتروني مستخدم بالفعل.';
        case 'auth/weak-password': return 'كلمة المرور ضعيفة جدًا (يجب أن تكون 6 أحرف على الأقل).';
        case 'auth/operation-not-allowed': return 'تسجيل الدخول بكلمة المرور غير مسموح به لهذا المشروع.';
        case 'auth/popup-closed-by-user': return 'تم إغلاق نافذة تسجيل الدخول.';
        case 'auth/cancelled-popup-request': return 'تم إلغاء طلب نافذة تسجيل الدخول.';
        case 'auth/account-exists-with-different-credential':
            return 'يوجد حساب بالفعل بنفس البريد الإلكتروني ولكن ببيانات اعتماد مختلفة (جرب طريقة تسجيل دخول أخرى).';
        case 'auth/invalid-credential':
            return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
        case 'auth/requires-recent-login':
            return 'هذه العملية تتطلب إعادة تسجيل الدخول مؤخرًا. يرجى تسجيل الخروج ثم الدخول مرة أخرى.';
        default: return `حدث خطأ غير متوقع. (${errorCode})`;
    }
};

// --- Game Balance Management (LocalStorage) ---
function getUserGamesKey(userId) {
    return `${USER_GAMES_KEY_PREFIX}${userId}`;
}

function getRemainingGames(userId) {
    if (!userId) return 0;
    const games = localStorage.getItem(getUserGamesKey(userId));
    return games ? parseInt(games, 10) : 0;
}

function updateRemainingGamesDisplay(userId) {
    const count = getRemainingGames(userId);
    const remainingGamesCountSpan = document.getElementById('remaining-games-count');
    if (remainingGamesCountSpan) {
        remainingGamesCountSpan.textContent = count;
    }
}

function addGamesToBalance(userId, gamesToAdd) {
    if (!userId || typeof gamesToAdd !== 'number' || gamesToAdd <= 0) {
        console.warn("addGamesToBalance: Invalid userId or gamesToAdd.", { userId, gamesToAdd });
        return;
    }
    const currentGames = getRemainingGames(userId);
    const newTotalGames = currentGames + gamesToAdd;
    localStorage.setItem(getUserGamesKey(userId), newTotalGames.toString());
    updateRemainingGamesDisplay(userId);
    console.log(`Added ${gamesToAdd} games. New balance for ${userId}: ${newTotalGames}`);
}

function deductGameFromBalance(userId) {
    if (!userId) {
        console.warn("deductGameFromBalance: userId is undefined.");
        return false;
    }
    const currentGames = getRemainingGames(userId);
    if (currentGames > 0) {
        const newTotalGames = currentGames - 1;
        localStorage.setItem(getUserGamesKey(userId), newTotalGames.toString());
        updateRemainingGamesDisplay(userId);
        console.log(`Deducted 1 game. New balance for ${userId}: ${newTotalGames}`);
        return true;
    }
    console.log(`Cannot deduct game for ${userId}, balance is 0.`);
    return false;
}

// --- Authentication Logic ---
const handleAuthSuccess = async (user, additionalData = null) => {
    console.log("Authentication successful for:", user.uid, user.displayName);

    const userGamesKey = getUserGamesKey(user.uid);
    if (localStorage.getItem(userGamesKey) === null) {
        localStorage.setItem(userGamesKey, '0');
        console.log(`Initialized game balance for ${user.uid} to 0.`);
    }
    updateRemainingGamesDisplay(user.uid);

    hideAuthMessages();
    window.location.href = 'index.html';
};

if (registerEmailFormEl) {
    registerEmailFormEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideAuthMessages();
        const email = registerEmailFormEl['register-email'].value;
        const password = registerEmailFormEl['register-password'].value;
        const confirmPassword = registerEmailFormEl['register-confirm-password'].value;
        const firstName = registerEmailFormEl['register-first-name'].value;
        const lastName = registerEmailFormEl['register-last-name'].value;
        const countryCode = registerEmailFormEl['register-country-code'].value;
        const phone = registerEmailFormEl['register-phone'].value;

        if (password !== confirmPassword) { showAuthError("كلمتا المرور غير متطابقتين!"); return; }
        if (password.length < 6) { showAuthError("كلمة المرور يجب أن تكون 6 أحرف على الأقل."); return; }

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const displayName = `${firstName} ${lastName}`.trim() || email.split('@')[0];
            await updateProfile(userCredential.user, { displayName: displayName });
            const additionalData = { firstName, lastName, countryCode, phone, displayName };
            await handleAuthSuccess(userCredential.user, additionalData);
        } catch (error) {
            console.error("Registration Error:", error);
            showAuthError(getFriendlyErrorMessage(error.code));
        }
    });
}

if (loginEmailFormEl) {
    loginEmailFormEl.addEventListener('submit', (e) => {
        e.preventDefault();
        hideAuthMessages();
        const email = loginEmailFormEl['login-email'].value;
        const password = loginEmailFormEl['login-password'].value;
        signInWithEmailAndPassword(auth, email, password)
            .then((userCredential) => handleAuthSuccess(userCredential.user))
            .catch((error) => {
                console.error("Login Error:", error);
                showAuthError(getFriendlyErrorMessage(error.code));
            });
    });
}

if (resetPasswordFormEl) {
    resetPasswordFormEl.addEventListener('submit', (e) => {
        e.preventDefault();
        hideAuthMessages(authErrorMessageDiv, resetSuccessMessageDiv);
        const email = resetPasswordFormEl['reset-email'].value;
        sendPasswordResetEmail(auth, email)
            .then(() => {
                showSuccessMessage("تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني.", resetSuccessMessageDiv);
                resetPasswordFormEl.reset();
            })
            .catch((error) => {
                console.error("Password Reset Error:", error);
                showAuthError(getFriendlyErrorMessage(error.code), authErrorMessageDiv);
            });
    });
}

const handleSocialSignIn = async (provider) => {
    hideAuthMessages();
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        const additionalData = { /* Extract from result if needed */ };
        await handleAuthSuccess(user, additionalData);
    } catch (error) {
        console.error("Social Sign-In Error:", error);
        if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
            showAuthError(getFriendlyErrorMessage(error.code));
        }
    }
};

if (googleSignInButtonEl) {
    const googleProvider = new GoogleAuthProvider();
    googleSignInButtonEl.addEventListener('click', () => handleSocialSignIn(googleProvider));
}

if (appleSignInButtonEl) {
    const appleProvider = new OAuthProvider('apple.com');
    appleProvider.addScope('email'); appleProvider.addScope('name');
    appleSignInButtonEl.addEventListener('click', () => handleSocialSignIn(appleProvider));
}


// --- Profile Page (Logged.html) Logic ---
async function setupProfilePage(user) {
    const els = profilePageElements;
    if (!els.infoForm || !user) return;

    if (els.userPhoto) els.userPhoto.src = user.photoURL || 'assets/images/default-avatar.png';
    if (els.summaryName) els.summaryName.textContent = user.displayName || 'مستخدم رحلة';
    if (els.summaryEmail) els.summaryEmail.textContent = user.email;
    if (els.emailInput) els.emailInput.value = user.email;
    if (els.displayNameInput) els.displayNameInput.value = user.displayName || '';

    const nameParts = user.displayName ? user.displayName.split(' ') : ['', ''];
    if (els.firstNameInput) els.firstNameInput.value = nameParts[0] || '';
    if (els.lastNameInput) els.lastNameInput.value = nameParts.slice(1).join(' ') || '';
    if (els.countryCodeSelect) els.countryCodeSelect.value = '+965';
    if (els.phoneInput) els.phoneInput.value = '';

    if (els.photoUploadInput && els.userPhoto) {
        els.photoUploadInput.addEventListener('change', async (event) => { /* ... (unchanged) ... */ });
    }
    els.infoForm.addEventListener('submit', async (e) => { /* ... (unchanged) ... */ });
    if (els.changePasswordForm) {
        els.changePasswordForm.addEventListener('submit', async (e) => { /* ... (unchanged) ... */ });
    }
    els.tabLinks.forEach(link => { link.addEventListener('click', () => { /* ... (unchanged) ... */ }); });
    if (els.logoutBtnSidebar) {
        els.logoutBtnSidebar.addEventListener('click', () => { /* ... (unchanged) ... */ });
    }
    if (els.deleteAccountBtn) {
        els.deleteAccountBtn.addEventListener('click', async () => { /* ... (unchanged) ... */ });
    }
}


// --- Purchase Dropdown Logic (REVISED) ---
function setupPurchaseDropdown(user) {
    const gamesTrigger = document.getElementById('games-trigger');
    const purchaseDropdown = document.getElementById('purchase-dropdown');
    if (!gamesTrigger || !purchaseDropdown) { console.warn("Purchase trigger or dropdown not found."); return; }

    const purchaseOptions = Array.from(purchaseDropdown.querySelectorAll('.purchase-option'));
    const promoInput = document.getElementById('promo-code-input');
    const applyPromoBtn = document.getElementById('apply-promo-btn');
    const totalPriceDisplay = document.getElementById('total-price-display');
    const payNowBtn = document.getElementById('pay-now-btn');

    let promoStatusDiv = purchaseDropdown.querySelector('.promo-status-feedback');
    if (!promoStatusDiv) {
        promoStatusDiv = document.createElement('div');
        promoStatusDiv.className = 'promo-status-feedback';
        promoStatusDiv.style.cssText = "font-size: 0.85em; margin-top: -10px; margin-bottom: 15px; text-align: center; min-height: 1.2em;";
        const totalSection = purchaseDropdown.querySelector('.total-section');
        if (totalSection) purchaseDropdown.insertBefore(promoStatusDiv, totalSection);
        else purchaseDropdown.insertBefore(promoStatusDiv, payNowBtn);
    }

    updateRemainingGamesDisplay(user.uid);

    let selectedPrice = 0;
    let selectedGames = 0; // Number of games from selected package
    let finalPrice = 0;
    let currentPromo = null; // Stores { code, type, value }
    let gamesToGrantFromPromo = 0; // Specifically for free_games promo

    function resetPromoState(clearInput = true) {
        currentPromo = null;
        gamesToGrantFromPromo = 0;
        if (clearInput && promoInput) promoInput.value = '';
        if (promoInput) promoInput.disabled = false;
        if (applyPromoBtn) { applyPromoBtn.disabled = false; applyPromoBtn.textContent = 'تطبيق';}
        if (promoStatusDiv) promoStatusDiv.textContent = '';
        purchaseOptions.forEach(opt => {
            opt.style.pointerEvents = 'auto';
            opt.style.opacity = '1';
        });
        updateFinalPrice();
    }

    function showPromoStatus(message, type = "info") {
        if (!promoStatusDiv) return;
        promoStatusDiv.textContent = message;
        promoStatusDiv.className = 'promo-status-feedback'; // Reset then add
        if (type === "success") promoStatusDiv.classList.add('success');
        else if (type === "error") promoStatusDiv.classList.add('error');
    }

    function updateFinalPrice() {
        if (!totalPriceDisplay || !payNowBtn) return;
        payNowBtn.disabled = true; // Default to disabled

        if (currentPromo && currentPromo.type === 'free_games') {
            finalPrice = 0;
            // gamesToGrantFromPromo is already set when promo is applied
            selectedGames = 0; // No package games if free games promo is active
            if (gamesToGrantFromPromo > 0) {
                payNowBtn.disabled = false;
                payNowBtn.textContent = `الحصول على ${gamesToGrantFromPromo} ${gamesToGrantFromPromo === 1 ? 'لعبة' : 'ألعاب'} مجاناً`;
            } else {
                // This case should ideally not be reached if promo validation ensures value > 0
                payNowBtn.textContent = 'ادفع الآن'; // Fallback
            }
        } else if (selectedGames > 0) { // A package is selected
            let discountMultiplier = 0;
            if (currentPromo && currentPromo.type === 'percentage') {
                discountMultiplier = currentPromo.value / 100;
            }
            finalPrice = selectedPrice * (1 - discountMultiplier);
            payNowBtn.disabled = false;
            payNowBtn.textContent = 'ادفع الآن';
            gamesToGrantFromPromo = 0;
        } else { // No package selected and no active free_games promo
            finalPrice = 0;
            selectedGames = 0; // Ensure this is reset
            gamesToGrantFromPromo = 0;
            payNowBtn.textContent = 'ادفع الآن';
        }
        totalPriceDisplay.textContent = `${finalPrice.toFixed(2)} KWD`;
    }


    if (!gamesTrigger.dataset.dropdownListenerAttached) {
        gamesTrigger.addEventListener('click', (event) => {
            event.stopPropagation();
            const isOpening = !purchaseDropdown.classList.contains('show');
            if (isOpening) {
                selectedPrice = 0; selectedGames = 0;
                purchaseOptions.forEach(opt => opt.classList.remove('selected'));
                resetPromoState();
            }
            purchaseDropdown.classList.toggle('show');
            // No need to call updateFinalPrice here, resetPromoState does it.
            // And on close, state doesn't need to change.
        });
        gamesTrigger.dataset.dropdownListenerAttached = 'true';
    }

    if (!document.body.dataset.globalDropdownListenerAttached) {
        document.addEventListener('click', (event) => {
            if (purchaseDropdown && !purchaseDropdown.contains(event.target) && gamesTrigger && !gamesTrigger.contains(event.target)) {
                purchaseDropdown.classList.remove('show');
            }
        });
        document.body.dataset.globalDropdownListenerAttached = 'true';
    }

    purchaseOptions.forEach(option => {
        if (!option.dataset.optionListenerAttached) {
            option.addEventListener('click', () => {
                if (currentPromo && currentPromo.type === 'free_games') return;

                purchaseOptions.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                selectedPrice = parseFloat(option.dataset.price) || 0;
                selectedGames = parseInt(option.dataset.games) || 0;
                resetPromoState(false);
                updateFinalPrice();
            });
            option.dataset.optionListenerAttached = 'true';
        }
    });

    if (applyPromoBtn && !applyPromoBtn.dataset.promoListenerAttached) {
        applyPromoBtn.addEventListener('click', async () => {
            const code = promoInput.value.trim().toUpperCase();
            if (!code) { showPromoStatus("الرجاء إدخال كود الخصم.", "error"); return; }

            applyPromoBtn.disabled = true; applyPromoBtn.textContent = 'تحقق...';
            showPromoStatus('');

            try {
                const response = await fetch(`${PROMO_API_URL}/validate/${code}`);
                const result = await response.json();
                if (!response.ok) throw new Error(result.message || "الكود غير صالح أو غير فعال.");

                currentPromo = { code: result.code, type: result.type, value: result.value };
                showPromoStatus(`تم تطبيق الكود ${result.code}!`, "success");
                promoInput.disabled = true; applyPromoBtn.textContent = 'مُطبّق';

                if (currentPromo.type === 'free_games') {
                    purchaseOptions.forEach(opt => {
                        opt.style.pointerEvents = 'none';
                        opt.style.opacity = '0.5';
                        opt.classList.remove('selected');
                    });
                    selectedGames = 0; selectedPrice = 0;
                    gamesToGrantFromPromo = currentPromo.value;
                } else {
                    gamesToGrantFromPromo = 0;
                    purchaseOptions.forEach(opt => {
                        opt.style.pointerEvents = 'auto';
                        opt.style.opacity = '1';
                    });
                }
            } catch (error) {
                console.error("Promo validation error:", error);
                showPromoStatus(error.message, "error");
                resetPromoState(false);
            } finally {
                if (!currentPromo && applyPromoBtn) applyPromoBtn.disabled = false;
                updateFinalPrice();
            }
        });
        applyPromoBtn.dataset.promoListenerAttached = 'true';
    }

    if (payNowBtn && !payNowBtn.dataset.payListenerAttached) {
        payNowBtn.addEventListener('click', async () => {
            let actualGamesToGrant = 0;
            let isFreeClaim = false;

            if (currentPromo && currentPromo.type === 'free_games' && gamesToGrantFromPromo > 0) {
                actualGamesToGrant = gamesToGrantFromPromo;
                isFreeClaim = true;
            } else if (selectedGames > 0 && finalPrice >= 0) {
                actualGamesToGrant = selectedGames;
            } else {
                alert("الرجاء اختيار باقة ألعاب أو تطبيق كود ألعاب صالح."); return;
            }

            if (actualGamesToGrant <= 0) {
                alert("لا يوجد ألعاب لإضافتها. يرجى التحقق من اختيارك أو الكود."); return;
            }

            payNowBtn.disabled = true; payNowBtn.textContent = 'جار المعالجة...';
            let paymentSuccessful = false;

            if (isFreeClaim) {
                paymentSuccessful = true;
                console.log(`Claiming ${actualGamesToGrant} free games for user ${user.uid} with code ${currentPromo.code}.`);
            } else {
                console.log(`Processing payment for ${actualGamesToGrant} games, ${finalPrice.toFixed(2)} KWD for user ${user.uid}. Promo: ${currentPromo?.code || 'None'}`);
                paymentSuccessful = await new Promise(resolve => setTimeout(() => resolve(true), 1000));
            }

            if (paymentSuccessful) {
                addGamesToBalance(user.uid, actualGamesToGrant);
                alert(isFreeClaim ? `تمت إضافة ${actualGamesToGrant} لعبة مجانية إلى رصيدك!` : `تم الشراء بنجاح! أُضيفت ${actualGamesToGrant} لعبة إلى رصيدك.`);
                if (purchaseDropdown) purchaseDropdown.classList.remove('show');
                selectedPrice = 0; selectedGames = 0; gamesToGrantFromPromo = 0;
                purchaseOptions.forEach(opt => opt.classList.remove('selected'));
                resetPromoState(true); // This also calls updateFinalPrice
            } else {
                alert("فشلت عملية " + (isFreeClaim ? "الحصول على الألعاب المجانية" : "الدفع") + ". الرجاء المحاولة مرة أخرى.");
                payNowBtn.disabled = false; // Re-enable on failure
                updateFinalPrice(); // Update button text and state
            }
        });
        payNowBtn.dataset.payListenerAttached = 'true';
    }
}


// --- Header UI Update ---
function updateHeaderUI(user) {
    if (!userActionsContainer) return;

    if (user) {
        const latestUser = auth.currentUser;
        const displayName = latestUser?.displayName || (latestUser?.email ? latestUser.email.split('@')[0] : 'مستخدم رحلة');
        userActionsContainer.innerHTML = `
            <span class="user-greeting">مرحباً، ${displayName}</span>
            <div class="games-counter-container">
                <button id="games-trigger" class="btn games-trigger-btn">
                    <span>عدد الألعاب: <span id="remaining-games-count">0</span></span>
                    <span class="plus-icon">+</span>
                </button>
                <div id="purchase-dropdown" class="purchase-dropdown-menu">
                    <h4 class="dropdown-title">شراء ألعاب إضافية</h4>
                    <ul class="purchase-options-list">
                        <li class="purchase-option" data-games="1" data-price="0.5"><span>لعبة واحدة</span> <span class="price">0.50 KWD</span></li>
                        <li class="purchase-option" data-games="2" data-price="1.0"><span>لعبتين</span> <span class="price">1.00 KWD</span></li>
                        <li class="purchase-option" data-games="5" data-price="2.0"><span>5 ألعاب</span> <span class="price">2.00 KWD</span></li>
                        <li class="purchase-option" data-games="10" data-price="4.0"><span>10 ألعاب</span> <span class="price">4.00 KWD</span></li>
                    </ul>
                    <div class="promo-section">
                        <input type="text" id="promo-code-input" placeholder="أدخل كود الخصم" style="text-transform: uppercase;">
                        <button id="apply-promo-btn" class="btn btn-secondary btn-sm">تطبيق</button>
                    </div>
                    <div class="total-section">
                        <span>المجموع:</span> <strong id="total-price-display">0.00 KWD</strong>
                    </div>
                    <button id="pay-now-btn" class="btn btn-primary btn-block" disabled>ادفع الآن</button>
                </div>
            </div>
            <a href="Logged.html" class="btn btn-logout" style="color: white;">حسابي</a>
            <button class="btn btn-logout" id="logout-btn-header">تسجيل الخروج</button>
        `;

        const logoutButtonHeader = document.getElementById('logout-btn-header');
        if (logoutButtonHeader && !logoutButtonHeader.dataset.logoutListenerAttached) {
            logoutButtonHeader.addEventListener('click', () => {
                signOut(auth).catch((error) => { console.error("Sign Out Error:", error); alert("خطأ تسجيل الخروج."); });
            });
            logoutButtonHeader.dataset.logoutListenerAttached = 'true';
        }

        if (latestUser) {
            setupPurchaseDropdown(latestUser);
        }
    } else {
        userActionsContainer.innerHTML = `<a href="auth.html" class="btn btn-register">تسجيل / دخول</a>`;
    }
}

// --- Auth State Listener ---
onAuthStateChanged(auth, async (user) => {
    const currentPage = window.location.pathname.toLowerCase().split('/').pop() || 'index.html';
    console.log(`Auth state change on: ${currentPage}. User: ${user ? user.uid : 'Logged out'}`);
    updateHeaderUI(user);
    if (user) {
        if (currentPage === 'logged.html') {
            await setupProfilePage(auth.currentUser);
        }
        if (currentPage === 'auth.html') {
            window.location.href = 'index.html';
        }
    } else {
        const protectedPages = ['logged.html', 'game.html'];
        if (protectedPages.includes(currentPage)) {
            console.log("User not logged in, redirecting to auth.html from:", currentPage);
            window.location.href = 'auth.html';
        }
    }
});

// --- Play Button Logic (index.html - Balance Check Only) ---
function handlePlayAttemptCheckBalanceOnly() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        alert("يجب تسجيل الدخول أولاً لتتمكن من اللعب.");
        window.location.href = 'auth.html';
        return false;
    }
    const gamesLeft = getRemainingGames(currentUser.uid);
    if (gamesLeft > 0) {
        console.log(`Balance check OK for ${currentUser.uid}: ${gamesLeft} games. Navigating to game setup.`);
        return true;
    } else {
        alert("رصيدك من الألعاب هو 0. الرجاء شراء المزيد من الألعاب لتتمكن من اللعب.");
        const gamesTrigger = document.getElementById('games-trigger');
        const purchaseDropdown = document.getElementById('purchase-dropdown');
        if (gamesTrigger && purchaseDropdown && !purchaseDropdown.classList.contains('show')) {
            gamesTrigger.click();
        }
        return false;
    }
}

if (mainPlayButtonEl && (window.location.pathname.endsWith('/') || window.location.pathname.endsWith('index.html'))) {
    mainPlayButtonEl.addEventListener('click', function(event) {
        event.preventDefault();
        if (handlePlayAttemptCheckBalanceOnly()) {
            window.location.href = this.href;
        }
    });
}

// --- Expose functions needed by game.js or other modules ---
window.firebaseAuth = auth;
window.getRemainingGamesForUser = getRemainingGames;
window.deductGameFromUserBalance = deductGameFromBalance;

console.log("main.js loaded and initialized. Revised promo code logic for free games fix.");