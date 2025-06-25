// --- main.js ---
// src/main.js

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
    apiKey: "AIzaSyA5vUQpt15Y2INFgUoBMQgaNkashAhxWTM", // انتبه: هذا المفتاح ظاهر للعامة
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
// تحديد RENDER_API_BASE_URL بناءً على بيئة التشغيل (محلي أو إنتاج)
const RENDER_API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:'
    ? 'http://localhost:3001' // للخادم الخلفي المحلي
    : 'https://rehla-game-backend.onrender.com'; // عنوان URL للإنتاج على Render
const PROMO_API_URL = `${RENDER_API_BASE_URL}/api/promos`;


// --- Global Variable for Pending Registration Data ---
let _pendingRegistrationData = null;

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

// --- Global State ---
let isBackendProfileReady = false;

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

// --- Game Balance Management ---
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

// --- UPDATED: Ensure backend profile exists and is synced ---
async function ensureAndSyncBackendProfile(user, registrationDataForNewUser = null) {
    if (!user) {
        console.error("[MainJS ensureAndSync] Called with no user object.");
        isBackendProfileReady = false;
        throw new Error("User object is required for profile sync.");
    }
    console.log(`[MainJS ensureAndSync] Starting process for UID: ${user.uid}. RegistrationData received:`, registrationDataForNewUser);
    isBackendProfileReady = false;

    try {
        const token = await getIdToken(user);

        console.log(`[MainJS ensureAndSync] Fetching profile from backend for UID: ${user.uid}`);
        let profileResponse = await fetch(`${RENDER_API_BASE_URL}/api/user/${user.uid}/profile`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        let profileData;

        if (profileResponse.status === 404) {
            console.log(`[MainJS ensureAndSync] Profile not found for UID: ${user.uid}. Attempting to register.`);
            const regData = registrationDataForNewUser || {}; // Use passed data or empty object
            const nameParts = regData.displayName ? regData.displayName.split(' ') : (user.displayName ? user.displayName.split(' ') : ['']);
            const firstName = regData.firstName || nameParts[0] || user.email.split('@')[0];
            const lastName = regData.lastName || nameParts.slice(1).join(' ') || '';
            const phone = regData.countryCode && regData.phone ? `${regData.countryCode}${regData.phone}` : (user.phoneNumber || null);
            const displayName = regData.displayName || user.displayName || `${firstName} ${lastName}`.trim() || user.email.split('@')[0];

            const payload = {
                firebaseUid: user.uid,
                email: user.email,
                displayName: displayName,
                firstName: firstName,
                lastName: lastName,
                phone: phone,
                photoURL: user.photoURL || null,
            };
            console.log(`[MainJS ensureAndSync] Registration payload for UID ${user.uid}:`, payload);

            const registerResponse = await fetch(`${RENDER_API_BASE_URL}/api/user/register-profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            const regResponseStatus = registerResponse.status;
            const regResponseText = await registerResponse.text();
            console.log(`[MainJS ensureAndSync] Register-profile response for UID ${user.uid}: Status ${regResponseStatus}, Body: ${regResponseText}`);

            if (!registerResponse.ok) {
                isBackendProfileReady = false;
                throw new Error(`فشل تسجيل الملف الشخصي في الخادم (Code: BE-${regResponseStatus}). التفاصيل: ${regResponseText}`);
            }
            console.log(`[MainJS ensureAndSync] Profile registered for UID: ${user.uid}. Re-fetching profile.`);
            profileResponse = await fetch(`${RENDER_API_BASE_URL}/api/user/${user.uid}/profile`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!profileResponse.ok) {
                const fetchAfterRegStatus = profileResponse.status;
                const fetchAfterRegText = await profileResponse.text();
                console.error(`[MainJS ensureAndSync] CRITICAL: Failed to fetch profile for UID ${user.uid} immediately after registration. Status: ${fetchAfterRegStatus}, Body: ${fetchAfterRegText}`);
                isBackendProfileReady = false;
                throw new Error(`فشل جلب الملف الشخصي بعد التسجيل (Code: BE-FETCH-${fetchAfterRegStatus}).`);
            }
        } else if (!profileResponse.ok) {
            const errorStatus = profileResponse.status;
            const errorText = await profileResponse.text();
            console.error(`[MainJS ensureAndSync] Error fetching profile (not 404) for UID ${user.uid}: Status ${errorStatus}, Body: ${errorText}`);
            isBackendProfileReady = false;
            throw new Error(`خطأ في جلب بيانات الملف الشخصي من الخادم (Code: BE-FETCH-${errorStatus}).`);
        }

        profileData = await profileResponse.json();
        console.log(`[MainJS ensureAndSync] Successfully fetched/created profile for UID ${user.uid}:`, profileData);

        if (profileData && typeof profileData.games_balance === 'number') {
            localStorage.setItem(getUserGamesKey(user.uid), profileData.games_balance.toString());
            updateRemainingGamesDisplay(user.uid);
            console.log(`[MainJS ensureAndSync] Balance updated from backend for UID ${user.uid}: ${profileData.games_balance}`);
        } else {
            console.warn(`[MainJS ensureAndSync] games_balance missing or invalid in profile data for UID ${user.uid}. Using local or 0.`);
            if (!localStorage.getItem(getUserGamesKey(user.uid))) {
                localStorage.setItem(getUserGamesKey(user.uid), '0');
            }
            updateRemainingGamesDisplay(user.uid);
        }
        isBackendProfileReady = true;
        console.log(`[MainJS ensureAndSync] Process completed successfully for UID: ${user.uid}. isBackendProfileReady: true`);
        return profileData;
    } catch (error) {
        console.error(`[MainJS ensureAndSync] CRITICAL ERROR in ensureAndSyncBackendProfile for UID ${user.uid}:`, error);
        isBackendProfileReady = false;
        showAuthError(`حدث خطأ جسيم أثناء إعداد حسابك (Code: ENSURE-${error.message.includes('BE-') ? error.message.split('(')[1].split(')')[0].split('-')[1] : 'GENERIC'}). قد تحتاج إلى تسجيل الخروج وإعادة المحاولة.`);
        throw error;
    }
}

// --- SIMPLIFIED Authentication Success Handler ---
const handleAuthSuccess = (user) => {
    console.log(`[MainJS handleAuthSuccess] Basic success handling for UID: ${user.uid}.`);
    hideAuthMessages();
    const currentPage = window.location.pathname.toLowerCase().split('/').pop() || 'index.html';
    if (currentPage === 'auth.html') {
        console.log("[MainJS handleAuthSuccess] Redirecting from auth.html to index.html.");
        window.location.href = 'index.html';
    }
};

// --- Registration Form Listener ---
if (registerEmailFormEl) {
    registerEmailFormEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideAuthMessages();
        const email = registerEmailFormEl['register-email'].value;
        const password = registerEmailFormEl['register-password'].value;
        const confirmPassword = registerEmailFormEl['register-confirm-password'].value;
        const firstName = registerEmailFormEl['register-first-name'].value;
        const lastName = registerEmailFormEl['register-last-name'].value;
     

        if (password !== confirmPassword) { showAuthError("كلمتا المرور غير متطابقتين!"); return; }
        if (password.length < 6) { showAuthError("كلمة المرور يجب أن تكون 6 أحرف على الأقل."); return; }

        try {
            const displayName = `${firstName} ${lastName}`.trim() || email.split('@')[0];
            _pendingRegistrationData = { firstName, lastName, countryCode, phone, displayName };
            console.log("[MainJS RegisterForm] Stored _pendingRegistrationData:", _pendingRegistrationData);

            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            await updateProfile(user, { displayName: _pendingRegistrationData.displayName });

            console.log("[MainJS RegisterForm] User created in Firebase. UID:", user.uid);
            // onAuthStateChanged will now pick up _pendingRegistrationData
        } catch (error) {
            console.error("Registration Error:", error);
            showAuthError(getFriendlyErrorMessage(error.code));
            _pendingRegistrationData = null; // Clear on error
        }
    });
}

// --- Login Form Listener ---
if (loginEmailFormEl) {
    loginEmailFormEl.addEventListener('submit', (e) => {
        e.preventDefault();
        hideAuthMessages();
        _pendingRegistrationData = null; // Clear any pending data
        const email = loginEmailFormEl['login-email'].value;
        const password = loginEmailFormEl['login-password'].value;
        signInWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                console.log("[MainJS LoginForm] Firebase sign-in successful for:", email);
            })
            .catch((error) => {
                console.error("Login Error:", error);
                showAuthError(getFriendlyErrorMessage(error.code));
            });
    });
}

// --- Password Reset ---
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

// --- Social Sign-In (Google & Apple) ---
const handleSocialSignIn = async (provider) => {
    hideAuthMessages();
    _pendingRegistrationData = null; // Clear any pending data
    try {
        const result = await signInWithPopup(auth, provider);
        console.log("[MainJS SocialSignIn] Firebase social sign-in successful. User UID:", result.user.uid);
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


// --- Auth State Listener (MAIN LOGIC) ---
onAuthStateChanged(auth, async (user) => {
    const currentPage = window.location.pathname.toLowerCase().split('/').pop() || 'index.html';
    console.log(`[MainJS onAuthStateChanged] Fired on page: ${currentPage}. User state: ${user ? `Logged in (UID: ${user.uid})` : 'Logged out'}`);
    isBackendProfileReady = false; // Reset flag

    let dataFromRegistrationForm = null;

    if (user) {
        if (_pendingRegistrationData) {
            dataFromRegistrationForm = _pendingRegistrationData;
            _pendingRegistrationData = null;
        }

        try {
            await ensureAndSyncBackendProfile(user, dataFromRegistrationForm);
            updateHeaderUI(user);

            if (currentPage === 'logged.html' && typeof setupProfilePage === 'function') {
                await setupProfilePage(user);
            }
            if (currentPage === 'auth.html') {
                window.location.href = 'index.html';
            } else {
                handleAuthSuccess(user);
            }
        } catch (error) {
            console.error(`[MainJS onAuthStateChanged] CRITICAL ERROR during post-authentication setup for UID ${user.uid}:`, error);
        }
    } else {
        _pendingRegistrationData = null;
        updateHeaderUI(null);
        const protectedPages = ['logged.html', 'game.html'];
        if (protectedPages.includes(currentPage)) {
            window.location.href = 'auth.html';
        }
    }
});

// --- Profile Page (Logged.html) Logic ---
async function setupProfilePage(user) {
    const els = profilePageElements;

    if (!els.infoForm || !user) {
        console.warn("setupProfilePage: Missing elements or user object.");
        return;
    }

    if (els.userPhoto) {
        els.userPhoto.src = 'assets/images/default-avatar.png';
    }

    if (els.summaryName) els.summaryName.textContent = user.displayName || 'مستخدم رحلة';
    if (els.summaryEmail) els.summaryEmail.textContent = user.email;
    if (els.emailInput) els.emailInput.value = user.email;
    if (els.displayNameInput) els.displayNameInput.value = user.displayName || '';

    if (isBackendProfileReady) {
        try {
            const token = await getIdToken(user);
            const response = await fetch(`${RENDER_API_BASE_URL}/api/user/${user.uid}/profile`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok && response.status !== 404) {
                const errorText = await response.text().catch(() => `فشل جلب تفاصيل الملف الشخصي (Code: SPP-BE-${response.status})`);
                console.error(`Failed to fetch profile from backend (setupProfilePage): ${response.status} - ${errorText}`);
                const nameParts = user.displayName ? user.displayName.split(' ') : ['', ''];
                if (els.firstNameInput && !els.firstNameInput.value) els.firstNameInput.value = nameParts[0] || '';
                if (els.lastNameInput && !els.lastNameInput.value) els.lastNameInput.value = nameParts.slice(1).join(' ') || '';
            } else if (response.ok) {
                const profileData = await response.json();
                console.log("Backend profile data for setupProfilePage:", profileData);
                if (els.firstNameInput) els.firstNameInput.value = profileData.first_name || '';
                if (els.lastNameInput) els.lastNameInput.value = profileData.last_name || '';
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
                if (els.displayNameInput && profileData.display_name) els.displayNameInput.value = profileData.display_name;
                if (els.summaryName && profileData.display_name) els.summaryName.textContent = profileData.display_name;
            } else if (response.status === 404) {
                console.warn(`[MainJS setupProfilePage] Profile for user ${user.uid} still not found in backend. Using Firebase data as fallback.`);
                const nameParts = user.displayName ? user.displayName.split(' ') : ['', ''];
                if (els.firstNameInput) els.firstNameInput.value = nameParts[0] || '';
                if (els.lastNameInput) els.lastNameInput.value = nameParts.slice(1).join(' ') || '';
            }
        } catch (error) {
            console.error("Error in try-catch fetching/processing profile data (setupProfilePage):", error);
            const nameParts = user.displayName ? user.displayName.split(' ') : ['', ''];
            if (els.firstNameInput && !els.firstNameInput.value) els.firstNameInput.value = nameParts[0] || '';
            if (els.lastNameInput && !els.lastNameInput.value) els.lastNameInput.value = nameParts.slice(1).join(' ') || '';
        }
    } else {
        console.warn(`[MainJS setupProfilePage] Backend profile not ready for UID: ${user.uid}. Displaying data from Firebase Auth only.`);
        const nameParts = user.displayName ? user.displayName.split(' ') : ['', ''];
        if (els.firstNameInput && !els.firstNameInput.value) els.firstNameInput.value = nameParts[0] || '';
        if (els.lastNameInput && !els.lastNameInput.value) els.lastNameInput.value = nameParts.slice(1).join(' ') || '';
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

            if (!newDisplayName) {
                newDisplayName = `${newFirstName} ${newLastName}`.trim() || auth.currentUser.email.split('@')[0];
            }

            const updatedProfileDataForBackend = {
                firstName: newFirstName,
                lastName: newLastName,
                displayName: newDisplayName,
               
            };

            try {
                if (auth.currentUser.displayName !== newDisplayName) {
                    await updateProfile(auth.currentUser, { displayName: newDisplayName });
                }
                const token = await getIdToken(auth.currentUser);
                const response = await fetch(`${RENDER_API_BASE_URL}/api/user/${auth.currentUser.uid}/profile`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(updatedProfileDataForBackend)
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({message: "فشل تحديث الملف الشخصي في الخادم."}));
                    throw new Error(errorData.message);
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
        els.changePasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideAuthMessages(els.passwordChangeErrorDiv, els.passwordChangeSuccessDiv);
            if (!auth.currentUser) return;

            const currentPassword = els.changePasswordForm['current-password'].value;
            const newPassword = els.changePasswordForm['new-password'].value;
            const confirmNewPassword = els.changePasswordForm['confirm-new-password'].value;

            if (newPassword !== confirmNewPassword) {
                showAuthError("كلمتا المرور الجديدتان غير متطابقتين!", els.passwordChangeErrorDiv);
                return;
            }
            if (newPassword.length < 6) {
                showAuthError("كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.", els.passwordChangeErrorDiv);
                return;
            }

            try {
                const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
                await reauthenticateWithCredential(auth.currentUser, credential);
                await updatePassword(auth.currentUser, newPassword);
                showSuccessMessage("تم تغيير كلمة المرور بنجاح!", els.passwordChangeSuccessDiv);
                els.changePasswordForm.reset();
            } catch (error) {
                console.error("Password Change Error:", error);
                showAuthError(getFriendlyErrorMessage(error.code), els.passwordChangeErrorDiv);
            }
        });
        els.changePasswordForm.dataset.listenerAttached = 'true';
    }

    if (els.tabLinks.length > 0 && (!els.tabLinks[0] || !els.tabLinks[0].dataset.tabListenerAttached)) {
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
        if(els.tabLinks[0]) els.tabLinks[0].dataset.tabListenerAttached = 'true';
    }


    if (els.logoutBtnSidebar && !els.logoutBtnSidebar.dataset.listenerAttached) {
        els.logoutBtnSidebar.addEventListener('click', () => {
            signOut(auth).catch(err => console.error("Sidebar Logout Error:", err));
        });
        els.logoutBtnSidebar.dataset.listenerAttached = 'true';
    }

    if (els.deleteAccountBtn && !els.deleteAccountBtn.dataset.listenerAttached) {
        els.deleteAccountBtn.addEventListener('click', async () => {
            if (!auth.currentUser) return;
            if (confirm("هل أنت متأكد أنك تريد حذف حسابك نهائياً؟ هذا الإجراء لا يمكن التراجع عنه.")) {
                const currentPassword = prompt("لحذف حسابك، يرجى إدخال كلمة المرور الحالية:");
                if (currentPassword === null) return;

                try {
                    const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
                    await reauthenticateWithCredential(auth.currentUser, credential);

                    const token = await getIdToken(auth.currentUser);
                    const backendDeleteResponse = await fetch(`${RENDER_API_BASE_URL}/api/user/${auth.currentUser.uid}/delete-account`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    if (!backendDeleteResponse.ok && backendDeleteResponse.status !== 404) {
                        const errorData = await backendDeleteResponse.json().catch(() => ({message: "فشل حذف بيانات المستخدم من الخادم."}));
                        throw new Error(errorData.message);
                    }
                    console.log("User data processed by backend for deletion.");

                    await auth.currentUser.delete();
                    alert("تم حذف حسابك بنجاح.");
                    window.location.href = 'index.html';
                } catch (error) {
                    console.error("Account Deletion Error:", error);
                    alert("خطأ في حذف الحساب: " + getFriendlyErrorMessage(error.code || error.message));
                }
            }
        });
        els.deleteAccountBtn.dataset.listenerAttached = 'true';
    }
}

// --- Purchase Dropdown Logic ---
function setupPurchaseDropdown(userInstance) {
    const purchaseDropdown = document.getElementById('purchase-dropdown');
    if (!purchaseDropdown) { return { resetDropdownStateForNewOpen: () => {} }; }

    const purchaseOptions = Array.from(purchaseDropdown.querySelectorAll('.purchase-option'));
    const promoInput = document.getElementById('promo-code-input');
    const applyPromoBtn = document.getElementById('apply-promo-btn');
    const totalPriceDisplay = document.getElementById('total-price-display');
    const payNowBtn = document.getElementById('pay-now-btn');
    let promoStatusDiv = purchaseDropdown.querySelector('.promo-status-feedback');

    if (!promoStatusDiv) {
        promoStatusDiv = document.createElement('div');
        promoStatusDiv.className = 'promo-status-feedback';
        promoStatusDiv.style.cssText = "font-size: 0.85em; margin-top: -10px; margin-bottom: 15px; text-align: center; min-height: 1.2em; font-weight: bold; color: var(--primary-color);";
        const totalSection = purchaseDropdown.querySelector('.total-section');
        if (totalSection) purchaseDropdown.insertBefore(promoStatusDiv, totalSection);
        else if (payNowBtn) purchaseDropdown.insertBefore(promoStatusDiv, payNowBtn);
        else purchaseDropdown.appendChild(promoStatusDiv);
    }

    let selectedPrice = 0, selectedGames = 0, selectedPackageName = "", finalPrice = 0, currentPromo = null, gamesToGrantFromPromo = 0;

    const resetDropdownStateForNewOpen = () => {
        selectedPrice = 0; selectedGames = 0; selectedPackageName = ""; gamesToGrantFromPromo = 0;
        purchaseOptions.forEach(opt => opt.classList.remove('selected'));
        resetPromoState(true);
    };

    function resetPromoState(clearInput = true) {
        currentPromo = null;
        if (clearInput && promoInput) promoInput.value = '';
        if (promoInput) promoInput.disabled = false;
        if (applyPromoBtn) { applyPromoBtn.disabled = false; applyPromoBtn.textContent = 'تطبيق';}
        if (promoStatusDiv) promoStatusDiv.textContent = '';
        purchaseOptions.forEach(opt => { opt.style.pointerEvents = 'auto'; opt.style.opacity = '1'; });
        updateFinalPrice();
    }

    function showPromoStatus(message, type = "info") {
        if (!promoStatusDiv) return;
        promoStatusDiv.textContent = message;
        promoStatusDiv.className = 'promo-status-feedback'; // Reset classes
        if (type === "success") promoStatusDiv.style.color = 'var(--success-color)';
        else if (type === "error") promoStatusDiv.style.color = 'var(--danger-color)';
        else promoStatusDiv.style.color = 'var(--primary-color)';
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
                payNowBtn.textContent = 'اختر عرضًا صالحًا';
            }
        } else if (selectedGames > 0) {
            let discountMultiplier = 0;
            if (currentPromo && currentPromo.type === 'percentage' && currentPromo.value > 0) {
                discountMultiplier = currentPromo.value / 100;
            }
            finalPrice = selectedPrice * (1 - discountMultiplier);
            finalPrice = parseFloat(finalPrice.toFixed(2)); // Ensure two decimal places for calculations
            payNowBtn.disabled = false;
            payNowBtn.textContent = 'ادفع الآن';
        } else {
            finalPrice = 0;
            payNowBtn.textContent = 'اختر باقة أولاً';
        }
        totalPriceDisplay.textContent = `${finalPrice.toFixed(3)} KWD`; // KWD uses 3 decimal places for display
    }

    purchaseOptions.forEach(option => {
        if (!option.dataset.listenerAttachedPurchase) {
            option.addEventListener('click', () => {
                if (currentPromo && currentPromo.type === 'free_games') return;
                purchaseOptions.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                selectedPrice = parseFloat(option.dataset.price) || 0;
                selectedGames = parseInt(option.dataset.games) || 0;
                selectedPackageName = option.querySelector('span:first-child').textContent;
                updateFinalPrice();
            });
            option.dataset.listenerAttachedPurchase = 'true';
        }
    });

    if (applyPromoBtn && !applyPromoBtn.dataset.listenerAttachedPromo) {
        applyPromoBtn.addEventListener('click', async () => {
            const currentUserForPromo = auth.currentUser;
            if (!currentUserForPromo) { alert("الرجاء تسجيل الدخول أولاً لتطبيق كود الخصم."); return; }
            if (!promoInput) return;
            const promoCodeValue = promoInput.value.trim().toUpperCase();
            if (!promoCodeValue) { showPromoStatus("الرجاء إدخال كود الخصم.", "error"); return; }

            applyPromoBtn.disabled = true;
            applyPromoBtn.textContent = 'جار التحقق...';
            showPromoStatus("جار التحقق من الكود...", "info");
            try {
                const token = await getIdToken(currentUserForPromo);
                const response = await fetch(`${PROMO_API_URL}/validate/${promoCodeValue}`, { headers: { 'Authorization': `Bearer ${token}` }});
                const responseData = await response.json();
                if (!response.ok) { throw new Error(responseData.message || "كود الخصم غير صالح أو منتهي الصلاحية."); }
                currentPromo = responseData;
                if (responseData.type === 'free_games' && responseData.value > 0) {
                    gamesToGrantFromPromo = responseData.value;
                    selectedGames = 0; selectedPrice = 0; selectedPackageName = `${responseData.value} لعبة/ألعاب مجانية (عرض)`;
                    showPromoStatus(`تم تطبيق العرض! ستحصل على ${gamesToGrantFromPromo} ألعاب مجانية.`, "success");
                    purchaseOptions.forEach(opt => { opt.classList.remove('selected'); opt.style.pointerEvents = 'none'; opt.style.opacity = '0.5'; });
                    if (promoInput) promoInput.disabled = true;
                } else if (responseData.type === 'percentage' && responseData.value > 0) {
                    gamesToGrantFromPromo = 0;
                    showPromoStatus(`تم تطبيق خصم ${responseData.value}% بنجاح!`, "success");
                    if (selectedGames === 0) { showPromoStatus(`تم تطبيق خصم ${responseData.value}%. اختر باقة للاستفادة من الخصم.`, "info"); }
                } else { throw new Error("نوع كود الخصم غير مدعوم أو قيمة الخصم غير صالحة."); }
            } catch (error) {
                console.error("Promo validation error:", error);
                showPromoStatus(error.message || "خطأ في تطبيق كود الخصم.", "error");
                currentPromo = null; gamesToGrantFromPromo = 0;
                resetPromoState(false); // Don't clear input on error, let user retry
            } finally {
                if(applyPromoBtn) { applyPromoBtn.disabled = (currentPromo && currentPromo.type === 'free_games'); applyPromoBtn.textContent = 'تطبيق';}
                updateFinalPrice();
            }
        });
        applyPromoBtn.dataset.listenerAttachedPromo = 'true';
    }

    if (payNowBtn && !payNowBtn.dataset.listenerAttachedPay) {
        payNowBtn.addEventListener('click', async () => {
            const currentUserForPayment = auth.currentUser;
            if (!currentUserForPayment) { alert("الرجاء تسجيل الدخول أولاً لإتمام العملية."); if(payNowBtn) {payNowBtn.disabled = false; updateFinalPrice();} return; }

            payNowBtn.disabled = true;
            payNowBtn.textContent = 'جاري المعالجة...';
            const userId = currentUserForPayment.uid;
            const token = await getIdToken(currentUserForPayment);
            const currentPurchaseDropdownElement = document.getElementById('purchase-dropdown');

            console.log("[MainJS PayNowBtn] Attempting purchase/grant. UID:", userId);

            if (currentPromo && currentPromo.type === 'free_games' && gamesToGrantFromPromo > 0) {
                console.log("[MainJS PayNowBtn] Granting free games. Promo:", currentPromo.code, "Games:", gamesToGrantFromPromo);
                try {
                    const response = await fetch(`${RENDER_API_BASE_URL}/api/user/${userId}/grant-free-games`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ promoCode: currentPromo.code, gamesToGrant: gamesToGrantFromPromo, source: `Promo: ${currentPromo.code}` })
                    });
                    const responseData = await response.json();
                    if (!response.ok) { throw new Error(responseData.message || 'فشل في الحصول على الألعاب المجانية من الخادم.'); }

                    if (responseData && typeof responseData.newBalance === 'number') {
                        localStorage.setItem(getUserGamesKey(userId), responseData.newBalance.toString());
                        updateRemainingGamesDisplay(userId);
                        alert(`تهانينا! لقد حصلت على ${gamesToGrantFromPromo} ${gamesToGrantFromPromo === 1 ? 'لعبة' : (gamesToGrantFromPromo === 2 ? 'لعبتين' : `${gamesToGrantFromPromo} ألعاب`)} مجانية. رصيدك الآن ${responseData.newBalance}.`);
                    } else {
                        console.warn("Grant free games response did not contain newBalance, syncing from profile. UID:", userId);
                        await ensureAndSyncBackendProfile(currentUserForPayment, null); // Attempt to sync
                        alert(`تهانينا! لقد حصلت على ${gamesToGrantFromPromo} ألعاب مجانية. يتم تحديث رصيدك.`);
                    }
                    if(currentPurchaseDropdownElement) currentPurchaseDropdownElement.classList.remove('show');
                    if (window.currentPurchaseDropdownSetup && typeof window.currentPurchaseDropdownSetup.resetDropdownStateForNewOpen === 'function') {
                        window.currentPurchaseDropdownSetup.resetDropdownStateForNewOpen();
                    }
                } catch (error) {
                    console.error("Error granting free games. UID:", userId, "Error:", error);
                    alert(error.message || `حدث خطأ أثناء الحصول على الألعاب المجانية. حاول مرة أخرى أو تواصل مع الدعم.`);
                } finally {
                    if(payNowBtn) {payNowBtn.disabled = false; updateFinalPrice();}
                }
            } else if (selectedGames > 0 && finalPrice >= 0) { // Allow 0 price for 100% discount
                console.log("[MainJS PayNowBtn] Initiating Tap Payment. UID:", userId, "Amount:", finalPrice, "Package:", selectedPackageName);
                try {
                    const paymentPayload = {
                        amount: finalPrice, // finalPrice is already calculated with discount
                        currency: "KWD",
                        packageName: selectedPackageName,
                        gamesInPackage: selectedGames,
                        customerName: currentUserForPayment.displayName || currentUserForPayment.email.split('@')[0],
                        customerEmail: currentUserForPayment.email,
                        appliedPromoCode: (currentPromo && currentPromo.type === 'percentage') ? currentPromo.code : null
                    };
                    // !!! --- CHANGED ENDPOINT FOR TAP PAYMENTS --- !!!
                    const paymentResponse = await fetch(`${RENDER_API_BASE_URL}/api/payment/initiate-tap-payment`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify(paymentPayload)
                    });

                    if (!paymentResponse.ok) {
                        const errorData = await paymentResponse.json().catch(() => ({ message: "فشل في بدء عملية الدفع مع Tap." }));
                        throw new Error(errorData.message);
                    }
                    const paymentData = await paymentResponse.json();
                    if (paymentData.paymentURL) {
                        console.log("[MainJS PayNowBtn] Received paymentURL from backend for Tap:", paymentData.paymentURL);
                        window.location.href = paymentData.paymentURL; // Redirect user to Tap payment page
                    } else {
                        throw new Error("لم يتم استلام رابط الدفع من الخادم (Tap).");
                    }
                } catch (error) {
                    console.error("Tap Payment initiation error. UID:", userId, "Error:", error);
                    alert(`خطأ في بدء عملية الدفع مع Tap: ${error.message}`);
                    if(payNowBtn) {payNowBtn.disabled = false; payNowBtn.textContent = 'ادفع الآن';}
                }
            } else {
                alert("الرجاء اختيار باقة أولاً أو التأكد من صلاحية كود الخصم.");
                if(payNowBtn) {payNowBtn.disabled = false; updateFinalPrice();}
            }
        });
        payNowBtn.dataset.listenerAttachedPay = 'true';
    }

    if (userInstance) updateRemainingGamesDisplay(userInstance.uid);
    updateFinalPrice(); // Ensure price is updated when dropdown is setup
    return { resetDropdownStateForNewOpen };
}

// --- Header UI Update ---
function updateHeaderUI(user) {
    if (!userActionsContainer) return;

    if (user) {
        const latestUser = auth.currentUser || user;
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
                        <li class="purchase-option" data-games="1" data-price="1.00"><span>لعبة واحدة</span> <span class="price">1.00 KWD</span></li>
                        <li class="purchase-option" data-games="2" data-price="2.00"><span>لعبتين</span> <span class="price">2.00 KWD</span></li>
                        <li class="purchase-option" data-games="5" data-price="4.00"><span>5 ألعاب</span> <span class="price">4.00 KWD</span></li>
                        <li class="purchase-option" data-games="10" data-price="8.00"><span>10 ألعاب</span> <span class="price">8.00 KWD</span></li>
                    </ul>
                    <div class="promo-section">
                        <input type="text" id="promo-code-input" placeholder="أدخل كود الخصم" style="text-transform: uppercase;">
                        <button id="apply-promo-btn" class="btn btn-secondary btn-sm">تطبيق</button>
                    </div>
                    <div class="promo-status-feedback" style="font-size: 0.85em; margin-top: -10px; margin-bottom: 15px; text-align: center; min-height: 1.2em; font-weight: bold; color: var(--primary-color);"></div>
                    <div class="total-section">
                        <span>المجموع:</span>
                        <strong id="total-price-display">0.000 KWD</strong>
                    </div>
                    <button id="pay-now-btn" class="btn btn-primary btn-block" disabled>اختر باقة أولاً</button>
                </div>
            </div>
            <a href="Logged.html" class="btn btn-logout" style="color: white;">حسابي</a>
            <button class="btn btn-logout" id="logout-btn-header">تسجيل الخروج</button>
        `;
        const logoutButtonHeader = document.getElementById('logout-btn-header');
        if (logoutButtonHeader && !logoutButtonHeader.dataset.listenerAttachedLogout) {
            logoutButtonHeader.addEventListener('click', () => {
                signOut(auth).catch((error) => console.error("Sign Out Error:", error));
            });
            logoutButtonHeader.dataset.listenerAttachedLogout = 'true';
        }
        if (latestUser) {
            updateRemainingGamesDisplay(latestUser.uid);
            const purchaseDropdownElement = document.getElementById('purchase-dropdown');
            if (purchaseDropdownElement) {
                window.currentPurchaseDropdownSetup = setupPurchaseDropdown(latestUser);
            }
        }
    } else {
        userActionsContainer.innerHTML = `<a href="auth.html" class="btn btn-register">تسجيل / دخول</a>`;
        window.currentPurchaseDropdownSetup = null;
    }
}


// --- Event Delegation for Purchase Dropdown ---
if (userActionsContainer && !userActionsContainer.dataset.delegatedListenerAttached) {
    userActionsContainer.addEventListener('click', function(event) {
        const gamesTriggerButton = event.target.closest('#games-trigger');
        const purchaseDropdownElement = document.getElementById('purchase-dropdown');
        if (gamesTriggerButton && purchaseDropdownElement) {
            event.stopPropagation();
            const isOpening = !purchaseDropdownElement.classList.contains('show');
            if (isOpening && window.currentPurchaseDropdownSetup && typeof window.currentPurchaseDropdownSetup.resetDropdownStateForNewOpen === 'function') {
                window.currentPurchaseDropdownSetup.resetDropdownStateForNewOpen();
            }
            purchaseDropdownElement.classList.toggle('show');
        }
    });
    userActionsContainer.dataset.delegatedListenerAttached = 'true';
}
if (!document.body.dataset.globalDropdownCloseListener) {
    document.addEventListener('click', function(event) {
        const purchaseDropdownElement = document.getElementById('purchase-dropdown');
        const gamesCounterContainer = document.querySelector('.games-counter-container');
        if (purchaseDropdownElement && purchaseDropdownElement.classList.contains('show')) {
            if (gamesCounterContainer && !gamesCounterContainer.contains(event.target)) {
                purchaseDropdownElement.classList.remove('show');
            }
        }
    });
    document.body.dataset.globalDropdownCloseListener = 'true';
}

// --- Play Button Logic (index.html - Balance Check Only) ---
function handlePlayAttemptCheckBalanceOnly() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        alert("يجب تسجيل الدخول أولاً لتتمكن من اللعب.");
        window.location.href = 'auth.html';
        return false;
    }
    if (!isBackendProfileReady) {
        alert("جاري مزامنة بيانات حسابك، يرجى الانتظار لحظات ثم حاول مرة أخرى.");
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
            setTimeout(() => {
                if(document.getElementById('games-trigger')) {
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

// --- Expose functions/variables needed by game.js or other modules ---
window.firebaseAuth = auth;
window.getRemainingGamesForUser = getRemainingGames;
window.updateRemainingGamesDisplay = updateRemainingGamesDisplay;
window.RENDER_API_BASE_URL = RENDER_API_BASE_URL;
window.isUserBackendProfileReady = () => isBackendProfileReady;
window.getUserGamesKey = getUserGamesKey;

console.log("main.js loaded. RENDER_API_BASE_URL is set to:", RENDER_API_BASE_URL);

// --- معالجة بارامترات الـ Callback من بوابة الدفع ---
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('status');
    const paymentRef = urlParams.get('ref');
    const chargeId = urlParams.get('charge_id');

    if (paymentStatus && paymentRef) {
        const currentPagePath = window.location.pathname.toLowerCase();
        // التأكد من أننا في صفحة نجاح أو فشل الدفع قبل محاولة تعديل DOM
        if (currentPagePath.includes('payment-success.html') || currentPagePath.includes('payment-failure.html')) {
            const messageContainer = document.getElementById('payment-result-message'); // افترض وجود هذا العنصر
            const refElement = document.getElementById('payment-ref'); // افترض وجود هذا العنصر

            if (currentPagePath.includes('payment-success.html')) {
                if (messageContainer) messageContainer.textContent = `تمت عملية الدفع بنجاح!`;
                if (refElement) refElement.textContent = `رقم المرجع: ${paymentRef} (معرف الشحنة: ${chargeId || 'N/A'})`;
                console.log(`Payment successful for ref: ${paymentRef}, charge: ${chargeId}`);
            } else if (currentPagePath.includes('payment-failure.html')) {
                const reason = urlParams.get('reason') || 'سبب غير معروف';
                if (messageContainer) messageContainer.textContent = `فشلت عملية الدفع. (السبب: ${reason})`;
                if (refElement) refElement.textContent = `رقم المرجع: ${paymentRef} (معرف الشحنة: ${chargeId || 'N/A'})`;
                console.error(`Payment failed for ref: ${paymentRef}, charge: ${chargeId}. Reason: ${reason}`);
            }

            // تحديث رصيد الألعاب للمستخدم بغض النظر عن حالة الدفع، لأن الخادم هو مصدر الحقيقة
            if (auth.currentUser) {
                ensureAndSyncBackendProfile(auth.currentUser)
                    .then(() => {
                        console.log("User balance synced after payment callback page load.");
                    })
                    .catch(err => {
                        console.error("Error syncing balance on payment callback page:", err);
                    });
            }
        }
        // إزالة البارامترات من الـ URL
        if (window.history.replaceState) {
            const cleanURL = window.location.pathname;
            window.history.replaceState({ path: cleanURL }, document.title, cleanURL);
        }
    }
});
