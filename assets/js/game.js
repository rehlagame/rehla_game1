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
    updatePassword, // For password change
    getIdToken // To get the token for your backend API
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
// Firebase Storage
import {
    getStorage,
    ref as storageRef,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyA5vUQpt15Y2INFgUoBMQgaNkashAhxWTM",
    authDomain: "rehlaapp-9a985.firebaseapp.com",
    projectId: "rehlaapp-9a985",
    storageBucket: "rehlaapp-9a985.firebasestorage.app",
    messagingSenderId: "827594007582",
    appId: "1:827594007582:web:cb07445443b72ce7cb7a0f"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);

// --- Constants ---
const USER_GAMES_KEY_PREFIX = 'rehlaUserGames_';
const RENDER_API_BASE_URL = 'https://rehla-game-backend.onrender.com'; // <--- استبدل هذا بالـ URL الصحيح للـ API الخاص بك!
const PROMO_API_URL = `${RENDER_API_BASE_URL}/api/promos`;

// --- DOM Element Selectors (Cached for performance) ---
const userActionsContainer = document.querySelector('header .user-actions');
const registerEmailFormEl = document.getElementById('register-email-form');
const loginEmailFormEl = document.getElementById('login-email-form');
const resetPasswordFormEl = document.getElementById('reset-password-form');
const googleSignInButtonEl = document.getElementById('google-signin-btn');
const appleSignInButtonEl = document.getElementById('apple-signin-btn');
const authErrorMessageDiv = document.getElementById('auth-error-message');
const resetSuccessMessageDiv = document.getElementById('reset-success-message');
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
        default: return `حدث خطأ غير متوقع. (${errorCode || 'UNKNOWN_ERROR'})`;
    }
};

// --- Game Balance Management (LocalStorage, with potential sync) ---
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

async function syncGamesBalanceWithBackend(userId) {
    if (!userId || !auth.currentUser) return; // Ensure user is available for token
    try {
        const token = await getIdToken(auth.currentUser);
        const response = await fetch(`${RENDER_API_BASE_URL}/api/user/${userId}/profile`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            console.warn(`Failed to fetch user profile from backend for sync: ${response.status}`);
            return;
        }
        const profileData = await response.json();
        if (profileData && typeof profileData.gamesBalance === 'number') {
            localStorage.setItem(getUserGamesKey(userId), profileData.gamesBalance.toString());
            updateRemainingGamesDisplay(userId);
            console.log(`Synced games balance for ${userId} from backend: ${profileData.gamesBalance}`);
        } else {
            console.warn("Backend profile data for sync did not contain a valid gamesBalance.");
        }
    } catch (error) {
        console.error("Error syncing games balance with backend:", error);
    }
}


function addGamesToBalance(userId, gamesToAdd, source = "localStorage_update") {
    if (!userId || typeof gamesToAdd !== 'number' || gamesToAdd <= 0) {
        console.warn("addGamesToBalance: Invalid userId or gamesToAdd.", { userId, gamesToAdd });
        return;
    }
    const currentGames = getRemainingGames(userId);
    const newTotalGames = currentGames + gamesToAdd;
    localStorage.setItem(getUserGamesKey(userId), newTotalGames.toString());
    updateRemainingGamesDisplay(userId);
    console.log(`Added ${gamesToAdd} games (source: ${source}). New balance for ${userId}: ${newTotalGames}`);
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
        // Consider an API call to inform backend if strict sync is needed for every deduction
        // async function notifyBackendOfDeduction() {
        //     const token = await getIdToken(auth.currentUser);
        //     fetch(`${RENDER_API_BASE_URL}/api/user/${userId}/decrement-game`, {
        //         method: 'POST',
        //         headers: { 'Authorization': `Bearer ${token}` }
        //     }).catch(err => console.error("Failed to notify backend of game deduction:", err));
        // }
        // notifyBackendOfDeduction();
        return true;
    }
    console.log(`Cannot deduct game for ${userId}, balance is 0.`);
    return false;
}

// --- Authentication Logic ---
const handleAuthSuccess = async (user, isNewUser = false, registrationData = null) => {
    console.log("Authentication successful for:", user.uid, user.displayName);
    hideAuthMessages();

    if (isNewUser && registrationData) {
        try {
            const token = await getIdToken(user);
            const profilePayload = {
                firebaseUid: user.uid,
                email: user.email,
                displayName: registrationData.displayName || user.displayName || user.email.split('@')[0],
                firstName: registrationData.firstName,
                lastName: registrationData.lastName,
                phone: registrationData.countryCode && registrationData.phone ? `${registrationData.countryCode}${registrationData.phone}` : null,
                photoURL: user.photoURL || null,
            };

            const response = await fetch(`${RENDER_API_BASE_URL}/api/user/register-profile`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(profilePayload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error("Failed to save new user profile to backend:", errorData.message || response.status);
            } else {
                console.log("New user profile saved to backend.");
                const backendProfile = await response.json();
                if (backendProfile && typeof backendProfile.gamesBalance === 'number') {
                    localStorage.setItem(getUserGamesKey(user.uid), backendProfile.gamesBalance.toString());
                } else {
                    localStorage.setItem(getUserGamesKey(user.uid), '0');
                }
            }
        } catch (error) {
            console.error("Error saving new user profile to backend:", error);
            localStorage.setItem(getUserGamesKey(user.uid), '0');
        }
    } else if (!isNewUser) {
        await syncGamesBalanceWithBackend(user.uid);
    } else {
        localStorage.setItem(getUserGamesKey(user.uid), '0');
    }

    updateRemainingGamesDisplay(user.uid);
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

            const registrationData = { firstName, lastName, countryCode, phone, displayName };
            await handleAuthSuccess(userCredential.user, true, registrationData);
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
            .then((userCredential) => handleAuthSuccess(userCredential.user, false))
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
        await handleAuthSuccess(user, result.additionalUserInfo?.isNewUser || false, {
            displayName: user.displayName,
            email: user.email,
        });
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

    try {
        const token = await getIdToken(user);
        const response = await fetch(`${RENDER_API_BASE_URL}/api/user/${user.uid}/profile`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to fetch profile from backend for setupProfilePage');
        const profileData = await response.json();

        if (els.firstNameInput) els.firstNameInput.value = profileData.firstName || '';
        if (els.lastNameInput) els.lastNameInput.value = profileData.lastName || '';
        if (profileData.phone) {
            let fullPhone = profileData.phone;
            let countryCode = "+965";
            let phoneNum = fullPhone;
            const knownCodes = ["+965", "+966", "+971", "+973", "+974", "+968"];
            for (const code of knownCodes) {
                if (fullPhone.startsWith(code)) {
                    countryCode = code;
                    phoneNum = fullPhone.substring(code.length);
                    break;
                }
            }
            if (els.countryCodeSelect) els.countryCodeSelect.value = countryCode;
            if (els.phoneInput) els.phoneInput.value = phoneNum;
        }
        if (els.displayNameInput && profileData.displayName) els.displayNameInput.value = profileData.displayName;
        if (els.userPhoto && profileData.photoURL) els.userPhoto.src = profileData.photoURL;
        if (els.summaryName && profileData.displayName) els.summaryName.textContent = profileData.displayName;
    } catch (error) {
        console.error("Error fetching profile data from backend for setupProfilePage:", error);
        const nameParts = user.displayName ? user.displayName.split(' ') : ['', ''];
        if (els.firstNameInput && !els.firstNameInput.value) els.firstNameInput.value = nameParts[0] || '';
        if (els.lastNameInput && !els.lastNameInput.value) els.lastNameInput.value = nameParts.slice(1).join(' ') || '';
    }

    if (els.photoUploadInput && els.userPhoto) {
        if (!els.photoUploadInput.dataset.listenerAttached) {
            els.photoUploadInput.addEventListener('change', async (event) => {
                const file = event.target.files[0];
                if (!file || !auth.currentUser) return;

                const imageRef = storageRef(storage, `profile_pictures/${auth.currentUser.uid}/${file.name}`);
                try {
                    if (profilePageElements.userPhoto) profilePageElements.userPhoto.src = 'assets/images/loading-spinner.gif';
                    await uploadBytes(imageRef, file);
                    const downloadURL = await getDownloadURL(imageRef);
                    await updateProfile(auth.currentUser, { photoURL: downloadURL });
                    const token = await getIdToken(auth.currentUser);
                    const updateResponse = await fetch(`${RENDER_API_BASE_URL}/api/user/${auth.currentUser.uid}/profile`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ photoURL: downloadURL })
                    });
                    if (!updateResponse.ok) throw new Error('Failed to update profile photo URL in backend.');
                    if (els.userPhoto) els.userPhoto.src = downloadURL;
                    showSuccessMessage("تم تحديث صورة الملف الشخصي بنجاح!", els.updateSuccessDiv);
                    setTimeout(() => { if (els.updateSuccessDiv) els.updateSuccessDiv.style.display = 'none'; }, 3000);
                } catch (error) {
                    console.error("Error uploading profile picture or updating backend:", error);
                    showAuthError(getFriendlyErrorMessage(error.code || 'PROFILE_PIC_UPLOAD_ERROR'), els.updateErrorDiv);
                    if (els.userPhoto && auth.currentUser) els.userPhoto.src = auth.currentUser.photoURL || 'assets/images/default-avatar.png';
                }
            });
            els.photoUploadInput.dataset.listenerAttached = 'true';
        }
    }

    if (els.infoForm && !els.infoForm.dataset.listenerAttached) {
        els.infoForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideAuthMessages(els.updateErrorDiv, els.updateSuccessDiv);
            if (!auth.currentUser) return;
            const newFirstName = els.firstNameInput.value;
            const newLastName = els.lastNameInput.value;
            const newCountryCode = els.countryCodeSelect.value;
            const newPhone = els.phoneInput.value;
            let newDisplayName = els.displayNameInput.value.trim();
            if (!newDisplayName) newDisplayName = `${newFirstName} ${newLastName}`.trim() || auth.currentUser.email.split('@')[0];
            const updatedProfileData = {
                firstName: newFirstName, lastName: newLastName, displayName: newDisplayName,
                phone: newCountryCode && newPhone ? `${newCountryCode}${newPhone}` : auth.currentUser.phoneNumber,
            };
            try {
                await updateProfile(auth.currentUser, { displayName: newDisplayName });
                const token = await getIdToken(auth.currentUser);
                const response = await fetch(`${RENDER_API_BASE_URL}/api/user/${auth.currentUser.uid}/profile`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(updatedProfileData)
                });
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.message || 'Failed to update profile in backend.');
                }
                if (els.summaryName) els.summaryName.textContent = newDisplayName;
                showSuccessMessage("تم تحديث بيانات الملف الشخصي بنجاح!", els.updateSuccessDiv);
                setTimeout(() => { if (els.updateSuccessDiv) els.updateSuccessDiv.style.display = 'none'; }, 3000);
            } catch (error) {
                console.error("Profile Update Error:", error);
                showAuthError(error.message || getFriendlyErrorMessage(error.code), els.updateErrorDiv);
            }
        });
        els.infoForm.dataset.listenerAttached = 'true';
    }

    if (els.changePasswordForm && !els.changePasswordForm.dataset.listenerAttached) {
        els.changePasswordForm.addEventListener('submit', async (e) => { /* ... (same as before, but ensure using auth.currentUser) ... */ });
        els.changePasswordForm.dataset.listenerAttached = 'true';
    }

    if (els.tabLinks.length > 0 && !els.tabLinks[0].dataset.tabListenerAttached) {
        els.tabLinks.forEach(link => {
            link.addEventListener('click', () => {
                const tabId = link.dataset.tab;
                els.tabLinks.forEach(l => l.classList.remove('active'));
                els.tabContents.forEach(c => c.classList.remove('active'));
                link.classList.add('active');
                const activeContent = document.getElementById(tabId);
                if (activeContent) activeContent.classList.add('active');
            });
            link.dataset.tabListenerAttached = 'true';
        });
    }

    if (els.logoutBtnSidebar && !els.logoutBtnSidebar.dataset.listenerAttached) {
        els.logoutBtnSidebar.addEventListener('click', () => { signOut(auth).catch(err => console.error("Sidebar Logout Error:", err)); });
        els.logoutBtnSidebar.dataset.listenerAttached = 'true';
    }
    if (els.deleteAccountBtn && !els.deleteAccountBtn.dataset.listenerAttached) {
        els.deleteAccountBtn.addEventListener('click', async () => { /* ... (needs backend API call too for full deletion) ... */ });
        els.deleteAccountBtn.dataset.listenerAttached = 'true';
    }
}


// --- Purchase Dropdown Logic ---
function setupPurchaseDropdown(user) {
    // *** الخطأ هنا: يتم تعريف هذه المتغيرات كـ const ثم يتم محاولة إعادة تعيينها لاحقاً ***
    // *** سيتم تغييرها إلى let ***
    let gamesTrigger = document.getElementById('games-trigger');
    let purchaseDropdown = document.getElementById('purchase-dropdown');

    if (!gamesTrigger || !purchaseDropdown) {
        console.warn("Purchase trigger or dropdown element not found in setupPurchaseDropdown. Re-checking after a short delay.");
        setTimeout(() => setupPurchaseDropdown(user), 100);
        return;
    }

    const purchaseOptions = Array.from(purchaseDropdown.querySelectorAll('.purchase-option'));
    let promoInput = document.getElementById('promo-code-input');
    let applyPromoBtn = document.getElementById('apply-promo-btn');
    let totalPriceDisplay = document.getElementById('total-price-display');
    let payNowBtn = document.getElementById('pay-now-btn');
    let promoStatusDiv = purchaseDropdown.querySelector('.promo-status-feedback');

    if (!promoStatusDiv) {
        promoStatusDiv = document.createElement('div');
        promoStatusDiv.className = 'promo-status-feedback';
        promoStatusDiv.style.cssText = "font-size: 0.85em; margin-top: -10px; margin-bottom: 15px; text-align: center; min-height: 1.2em; font-weight: bold; color: var(--primary-color);"; // Added color
        const totalSection = purchaseDropdown.querySelector('.total-section');
        if (totalSection) purchaseDropdown.insertBefore(promoStatusDiv, totalSection);
        else purchaseDropdown.insertBefore(promoStatusDiv, payNowBtn);
    }

    let selectedPrice = 0;
    let selectedGames = 0;
    let selectedPackageName = "";
    let finalPrice = 0;
    let currentPromo = null;
    let gamesToGrantFromPromo = 0;

    const resetDropdownState = () => {
        selectedPrice = 0;
        selectedGames = 0;
        selectedPackageName = "";
        gamesToGrantFromPromo = 0;
        purchaseOptions.forEach(opt => opt.classList.remove('selected'));
        resetPromoState(true);
    };

    function resetPromoState(clearInput = true) {
        currentPromo = null;
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
        promoStatusDiv.className = 'promo-status-feedback'; // Reset classes
        if (type === "success") {
            promoStatusDiv.style.color = 'var(--success-color)';
        } else if (type === "error") {
            promoStatusDiv.style.color = 'var(--danger-color)';
        } else {
            promoStatusDiv.style.color = 'var(--primary-color)';
        }
    }

    function updateFinalPrice() {
        if (!totalPriceDisplay || !payNowBtn) return;
        payNowBtn.disabled = true;

        if (currentPromo && currentPromo.type === 'free_games') {
            finalPrice = 0;
            if (gamesToGrantFromPromo > 0) {
                payNowBtn.disabled = false;
                payNowBtn.textContent = `الحصول على ${gamesToGrantFromPromo} ${gamesToGrantFromPromo === 1 ? 'لعبة' : (gamesToGrantFromPromo === 2 ? 'لعبتين' : `${gamesToGrantFromPromo} ألعاب`)} مجاناً`;
            } else {
                payNowBtn.textContent = 'ادفع الآن';
            }
        } else if (selectedGames > 0) {
            let discountMultiplier = 0;
            if (currentPromo && currentPromo.type === 'percentage') {
                discountMultiplier = currentPromo.value / 100;
            }
            finalPrice = selectedPrice * (1 - discountMultiplier);
            payNowBtn.disabled = false;
            payNowBtn.textContent = 'ادفع الآن';
        } else {
            finalPrice = 0;
            payNowBtn.textContent = 'ادفع الآن';
        }
        totalPriceDisplay.textContent = `${finalPrice.toFixed(2)} KWD`;
    }

    const gamesTriggerClickHandler = (event) => {
        event.stopPropagation();
        const isOpening = !purchaseDropdown.classList.contains('show');
        if (isOpening) {
            resetDropdownState();
        }
        purchaseDropdown.classList.toggle('show');
    };

    // Ensure gamesTrigger has listener only once after it's created in updateHeaderUI
    if (gamesTrigger && !gamesTrigger.dataset.listenerAttached) {
        gamesTrigger.addEventListener('click', gamesTriggerClickHandler);
        gamesTrigger.dataset.listenerAttached = 'true'; // Mark as listener attached
    }


    if (!document.body.dataset.globalDropdownListenerAttached) {
        document.addEventListener('click', (event) => {
            // Re-fetch inside listener to ensure we have the current elements if UI was re-rendered
            const currentGamesTrigger = document.getElementById('games-trigger');
            const currentPurchaseDropdown = document.getElementById('purchase-dropdown');

            if (currentPurchaseDropdown && currentPurchaseDropdown.classList.contains('show') &&
                currentGamesTrigger && !currentGamesTrigger.contains(event.target) &&
                !currentPurchaseDropdown.contains(event.target)) {
                currentPurchaseDropdown.classList.remove('show');
            }
        });
        document.body.dataset.globalDropdownListenerAttached = 'true';
    }

    purchaseOptions.forEach(option => {
        // No need to clone here if listeners are managed by setupPurchaseDropdown being called on UI update
        option.addEventListener('click', () => {
            if (currentPromo && currentPromo.type === 'free_games') return;
            purchaseOptions.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            selectedPrice = parseFloat(option.dataset.price) || 0;
            selectedGames = parseInt(option.dataset.games) || 0;
            selectedPackageName = option.querySelector('span:first-child').textContent;
            gamesToGrantFromPromo = 0;
            resetPromoState(false);
            updateFinalPrice();
        });
    });

    if (applyPromoBtn && !applyPromoBtn.dataset.listenerAttached) {
        applyPromoBtn.addEventListener('click', async () => {
            if (!promoInput || !auth.currentUser) return;
            const promoCodeValue = promoInput.value.trim().toUpperCase();
            if (!promoCodeValue) {
                showPromoStatus("الرجاء إدخال كود الخصم.", "error");
                return;
            }
            applyPromoBtn.disabled = true;
            applyPromoBtn.textContent = 'جار التحقق...';
            showPromoStatus("جار التحقق من الكود...", "info");
            try {
                const token = await getIdToken(auth.currentUser);
                // استبدل هذا بنقطة النهاية الفعلية للتحقق من كود الخصم
                const response = await fetch(`${PROMO_API_URL}/validate/${promoCodeValue}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ message: "كود الخصم غير صالح أو منتهي الصلاحية." }));
                    throw new Error(errorData.message || "كود الخصم غير صالح.");
                }
                const promoData = await response.json();
                currentPromo = promoData;
                if (promoData.type === 'free_games' && promoData.value > 0) {
                    gamesToGrantFromPromo = promoData.value;
                    selectedGames = 0; selectedPrice = 0;
                    selectedPackageName = `${promoData.value} ${promoData.value === 1 ? 'لعبة' : (promoData.value === 2 ? 'لعبتين' : `${promoData.value} ألعاب`)} مجانية (عرض)`;
                    showPromoStatus(`تم تطبيق العرض! ستحصل على ${gamesToGrantFromPromo} ألعاب مجانية.`, "success");
                    purchaseOptions.forEach(opt => {
                        opt.classList.remove('selected'); opt.style.pointerEvents = 'none'; opt.style.opacity = '0.5';
                    });
                    promoInput.disabled = true;
                } else if (promoData.type === 'percentage' && promoData.value > 0) {
                    gamesToGrantFromPromo = 0;
                    showPromoStatus(`تم تطبيق خصم ${promoData.value}% بنجاح!`, "success");
                    if (selectedGames === 0) showPromoStatus(`تم تطبيق خصم ${promoData.value}%. اختر باقة للاستفادة من الخصم.`, "info");
                } else {
                    throw new Error("نوع كود الخصم غير مدعوم أو قيمة الخصم غير صالحة.");
                }
            } catch (error) {
                console.error("Promo validation error:", error);
                showPromoStatus(error.message || "خطأ في تطبيق كود الخصم.", "error");
                currentPromo = null; gamesToGrantFromPromo = 0;
            } finally {
                applyPromoBtn.disabled = false; applyPromoBtn.textContent = 'تطبيق';
                updateFinalPrice();
            }
        });
        applyPromoBtn.dataset.listenerAttached = 'true';
    }

    if (payNowBtn && !payNowBtn.dataset.listenerAttached) {
        payNowBtn.addEventListener('click', async () => {
            if (!auth.currentUser) { alert("الرجاء تسجيل الدخول أولاً لإتمام عملية الشراء."); return; }
            payNowBtn.disabled = true; payNowBtn.textContent = 'جاري المعالجة...';
            const userId = auth.currentUser.uid;
            const token = await getIdToken(auth.currentUser);

            if (currentPromo && currentPromo.type === 'free_games' && gamesToGrantFromPromo > 0) {
                try {
                    const response = await fetch(`${RENDER_API_BASE_URL}/api/user/${userId}/grant-free-games`, { // افترض نقطة نهاية
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ promoCode: currentPromo.code, gamesToGrant: gamesToGrantFromPromo, source: `Promo: ${currentPromo.code}` })
                    });
                    if (!response.ok) {
                        const errData = await response.json().catch(() => ({ message: 'فشل في الحصول على الألعاب المجانية من الخادم.' }));
                        throw new Error(errData.message);
                    }
                    addGamesToBalance(userId, gamesToGrantFromPromo, `Promo: ${currentPromo.code}`);
                    alert(`تهانينا! لقد حصلت على ${gamesToGrantFromPromo} ${gamesToGrantFromPromo === 1 ? 'لعبة' : (gamesToGrantFromPromo === 2 ? 'لعبتين' : `${gamesToGrantFromPromo} ألعاب`)} مجانية.`);
                    if(purchaseDropdown) purchaseDropdown.classList.remove('show');
                    resetDropdownState();
                    await syncGamesBalanceWithBackend(userId);
                } catch (error) {
                    console.error("Error granting free games:", error);
                    alert(`حدث خطأ أثناء الحصول على الألعاب المجانية: ${error.message}`);
                } finally {
                    payNowBtn.disabled = false; updateFinalPrice();
                }
            } else if (selectedGames > 0 && finalPrice >= 0) {
                try {
                    const paymentPayload = {
                        amount: finalPrice, currency: "KWD", packageName: selectedPackageName, gamesInPackage: selectedGames,
                        customerName: auth.currentUser.displayName || auth.currentUser.email, customerEmail: auth.currentUser.email,
                        appliedPromoCode: (currentPromo && currentPromo.type === 'percentage') ? currentPromo.code : null
                    };
                    console.log("Initiating payment with payload:", paymentPayload);
                    // استبدل هذا بنقطة النهاية الفعلية لبدء الدفع مع MyFatoorah
                    const paymentResponse = await fetch(`${RENDER_API_BASE_URL}/api/payment/initiate-myfatoorah`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify(paymentPayload)
                    });
                    if (!paymentResponse.ok) {
                        const errorData = await paymentResponse.json().catch(() => ({ message: "فشل في بدء عملية الدفع." }));
                        throw new Error(errorData.message);
                    }
                    const paymentData = await paymentResponse.json();
                    if (paymentData.paymentURL) {
                        window.location.href = paymentData.paymentURL; // إعادة توجيه إلى MyFatoorah
                    } else {
                        throw new Error("لم يتم استلام رابط الدفع من الخادم.");
                    }
                } catch (error) {
                    console.error("Payment initiation error:", error);
                    alert(`خطأ في بدء عملية الدفع: ${error.message}`);
                    payNowBtn.disabled = false; payNowBtn.textContent = 'ادفع الآن';
                }
            } else {
                alert("الرجاء اختيار باقة أولاً.");
                payNowBtn.disabled = false; payNowBtn.textContent = 'ادفع الآن';
            }
        });
        payNowBtn.dataset.listenerAttached = 'true';
    }
    updateRemainingGamesDisplay(user.uid);
    updateFinalPrice();
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
                        <li class="purchase-option" data-games="1" data-price="0.50"><span>لعبة واحدة</span> <span class="price">0.50 KWD</span></li>
                        <li class="purchase-option" data-games="2" data-price="1.00"><span>لعبتين</span> <span class="price">1.00 KWD</span></li>
                        <li class="purchase-option" data-games="5" data-price="2.00"><span>5 ألعاب</span> <span class="price">2.00 KWD</span></li>
                        <li class="purchase-option" data-games="10" data-price="4.00"><span>10 ألعاب</span> <span class="price">4.00 KWD</span></li>
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
        if (logoutButtonHeader && !logoutButtonHeader.dataset.listenerAttachedLogout) {
            logoutButtonHeader.addEventListener('click', () => {
                signOut(auth).catch((error) => { console.error("Sign Out Error:", error); alert("خطأ تسجيل الخروج."); });
            });
            logoutButtonHeader.dataset.listenerAttachedLogout = 'true';
        }


        if (latestUser) {
            updateRemainingGamesDisplay(latestUser.uid);
            // استدعاء setupPurchaseDropdown بعد التأكد من أن العناصر موجودة في DOM
            // setTimeout يضمن أن DOM قد تم تحديثه بالكامل قبل محاولة ربط الأحداث
            setTimeout(() => setupPurchaseDropdown(latestUser), 0);
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
        await syncGamesBalanceWithBackend(user.uid);

        if (currentPage === 'logged.html') {
            await setupProfilePage(user);
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
            // استخدام setTimeout للتأكد من أن setupPurchaseDropdown قد ربط الحدث بالفعل
            setTimeout(() => {
                if(document.getElementById('games-trigger')) { // Check again if it exists
                    document.getElementById('games-trigger').click();
                }
            }, 100);
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
window.RENDER_API_BASE_URL = RENDER_API_BASE_URL;

console.log("main.js loaded and initialized. Using Render API for backend interactions. Dropdown logic revised and const/let fixed.");
