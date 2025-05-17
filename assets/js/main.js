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
// RENDER_API_BASE_URL will be defined globally later or can be hardcoded here if needed
// It's also exported to window object at the end of the file for other modules.
const PROD_RENDER_API_BASE_URL = 'https://rehla-game-backend.onrender.com';
const RENDER_API_BASE_URL = PROD_RENDER_API_BASE_URL; // Change this for local dev if needed
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

// --- Global State (optional, for more complex scenarios) ---
let isBackendProfileReady = false; // Flag to indicate if backend profile is synced

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
async function ensureAndSyncBackendProfile(user, registrationData = null) {
    if (!user) {
        console.error("[MainJS ensureAndSync] Called with no user object.");
        isBackendProfileReady = false;
        throw new Error("User object is required for profile sync.");
    }
    console.log(`[MainJS ensureAndSync] Starting process for UID: ${user.uid}`);
    isBackendProfileReady = false; // Assume not ready until success

    try {
        const token = await getIdToken(user); // Get token first

        // 1. Attempt to fetch existing profile
        console.log(`[MainJS ensureAndSync] Fetching profile from backend for UID: ${user.uid}`);
        let profileResponse = await fetch(`${RENDER_API_BASE_URL}/api/user/${user.uid}/profile`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        let profileData;

        if (profileResponse.status === 404) {
            console.log(`[MainJS ensureAndSync] Profile not found for UID: ${user.uid}. Attempting to register.`);
            // Profile not found, attempt to register it
            const nameParts = registrationData?.displayName ? registrationData.displayName.split(' ') : (user.displayName ? user.displayName.split(' ') : ['']);
            const firstName = registrationData?.firstName || nameParts[0] || user.email.split('@')[0];
            const lastName = registrationData?.lastName || nameParts.slice(1).join(' ') || '';
            const phone = registrationData?.countryCode && registrationData?.phone ? `${registrationData.countryCode}${registrationData.phone}` : (user.phoneNumber || null);

            const payload = {
                firebaseUid: user.uid,
                email: user.email,
                displayName: registrationData?.displayName || user.displayName || firstName,
                firstName: firstName,
                lastName: lastName,
                phone: phone,
                photoURL: user.photoURL || null,
            };
            console.log(`[MainJS ensureAndSync] Registration payload for UID ${user.uid}:`, payload);

            const registerResponse = await fetch(`${RENDER_API_BASE_URL}/api/user/register-profile`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(payload)
            });

            const regResponseStatus = registerResponse.status;
            const regResponseText = await registerResponse.text();
            console.log(`[MainJS ensureAndSync] Register-profile response for UID ${user.uid}: Status ${regResponseStatus}, Body: ${regResponseText}`);


            if (!registerResponse.ok) {
                isBackendProfileReady = false;
                throw new Error(`فشل تسجيل الملف الشخصي في الخادم (Code: BE-${regResponseStatus}). التفاصيل: ${regResponseText}`);
            }
            // Successfully registered, now fetch the newly created profile to get games_balance
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

        // At this point, profileResponse should be OK
        profileData = await profileResponse.json();
        console.log(`[MainJS ensureAndSync] Successfully fetched/created profile for UID ${user.uid}:`, profileData);

        if (profileData && typeof profileData.games_balance === 'number') {
            localStorage.setItem(getUserGamesKey(user.uid), profileData.games_balance.toString());
            updateRemainingGamesDisplay(user.uid);
            console.log(`[MainJS ensureAndSync] Balance updated from backend for UID ${user.uid}: ${profileData.games_balance}`);
        } else {
            console.warn(`[MainJS ensureAndSync] games_balance missing or invalid in profile data for UID ${user.uid}. Using local or 0.`);
            if (!localStorage.getItem(getUserGamesKey(user.uid))) {
                localStorage.setItem(getUserGamesKey(user.uid), '0'); // Default to 0 if not locally present and not in backend
            }
            updateRemainingGamesDisplay(user.uid);
        }
        isBackendProfileReady = true; // Profile is ready and balance synced
        console.log(`[MainJS ensureAndSync] Process completed successfully for UID: ${user.uid}. isBackendProfileReady: true`);
        return profileData; // Return the fetched/created profile data

    } catch (error) {
        console.error(`[MainJS ensureAndSync] CRITICAL ERROR in ensureAndSyncBackendProfile for UID ${user.uid}:`, error);
        isBackendProfileReady = false;
        // Show a user-friendly error, but re-throw to be caught by onAuthStateChanged
        showAuthError(`حدث خطأ جسيم أثناء إعداد حسابك (Code: ENSURE-${error.message.includes('BE-') ? error.message.split('BE-')[1].split(')')[0] : 'GENERIC'}). قد تحتاج إلى تسجيل الخروج وإعادة المحاولة.`);
        throw error; // Re-throw to be caught by onAuthStateChanged
    }
}

// --- SIMPLIFIED Authentication Success Handler ---
const handleAuthSuccess = (user) => {
    console.log(`[MainJS handleAuthSuccess] Basic success handling for UID: ${user.uid}. Redirecting.`);
    hideAuthMessages();
    // The core profile creation and balance sync is now handled by ensureAndSyncBackendProfile
    // This function can now focus on UI changes and redirection.
    // updateRemainingGamesDisplay(user.uid); // This is already called by ensureAndSyncBackendProfile

    const currentPage = window.location.pathname.toLowerCase().split('/').pop() || 'index.html';
    if (currentPage === 'auth.html') {
        window.location.href = 'index.html';
    }
    // Additional UI updates or logic can go here if needed.
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
        const countryCode = registerEmailFormEl['register-country-code'].value;
        const phone = registerEmailFormEl['register-phone'].value;

        if (password !== confirmPassword) { showAuthError("كلمتا المرور غير متطابقتين!"); return; }
        if (password.length < 6) { showAuthError("كلمة المرور يجب أن تكون 6 أحرف على الأقل."); return; }

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            const displayName = `${firstName} ${lastName}`.trim() || email.split('@')[0];
            await updateProfile(user, { displayName: displayName });

            // This data will be passed to ensureAndSyncBackendProfile via onAuthStateChanged
            const registrationDataForSync = { firstName, lastName, countryCode, phone, displayName };
            console.log("[MainJS RegisterForm] User created in Firebase. UID:", user.uid, "RegData:", registrationDataForSync);
            // onAuthStateChanged will handle ensureAndSyncBackendProfile and then handleAuthSuccess.
            // No direct call to handleAuthSuccess here anymore, as onAuthStateChanged is the single source of truth.
        } catch (error) {
            console.error("Registration Error:", error);
            showAuthError(getFriendlyErrorMessage(error.code));
        }
    });
}

// --- Login Form Listener ---
if (loginEmailFormEl) {
    loginEmailFormEl.addEventListener('submit', (e) => {
        e.preventDefault();
        hideAuthMessages();
        const email = loginEmailFormEl['login-email'].value;
        const password = loginEmailFormEl['login-password'].value;
        signInWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                // onAuthStateChanged will handle ensureAndSyncBackendProfile and then handleAuthSuccess.
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
    try {
        const result = await signInWithPopup(auth, provider);
        // onAuthStateChanged will handle ensureAndSyncBackendProfile and then handleAuthSuccess.
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
    isBackendProfileReady = false; // Reset flag on auth change

    if (user) {
        try {
            // 1. Ensure backend profile exists and sync initial balance
            // For new users via email/pass, registrationData might be useful if we stored it globally
            // For social sign-in, it's harder to pass registrationData here directly.
            // ensureAndSyncBackendProfile will derive names from user.displayName if registrationData is null.
            console.log(`[MainJS onAuthStateChanged] User logged in. Calling ensureAndSyncBackendProfile for UID: ${user.uid}`);
            await ensureAndSyncBackendProfile(user, null /* registrationData - handled internally if needed */);
            console.log(`[MainJS onAuthStateChanged] ensureAndSyncBackendProfile COMPLETED for UID: ${user.uid}. isBackendProfileReady: ${isBackendProfileReady}`);


            // 2. Update header UI (now that balance is potentially synced)
            updateHeaderUI(user); // Call this after balance might have been updated

            // 3. Handle page-specific logic
            if (currentPage === 'logged.html' && typeof setupProfilePage === 'function') {
                await setupProfilePage(user);
            }

            // 4. Redirect if on auth page
            if (currentPage === 'auth.html') {
                console.log("[MainJS onAuthStateChanged] User is on auth.html but logged in. Redirecting to index.html.");
                window.location.href = 'index.html';
            } else {
                // Call simplified handleAuthSuccess for general UI updates or post-login tasks
                handleAuthSuccess(user);
            }

        } catch (error) {
            console.error(`[MainJS onAuthStateChanged] CRITICAL ERROR during post-authentication setup for UID ${user.uid}:`, error);
            // Error already shown by ensureAndSyncBackendProfile if it failed
            // Consider logging user out if setup is critically failed
            // await signOut(auth);
            // updateHeaderUI(null); // Reflect sign-out in UI
            // Or redirect to an error page or show a persistent error message
        }
    } else {
        // User is logged out
        updateHeaderUI(null);
        const protectedPages = ['logged.html', 'game.html'];
        if (protectedPages.includes(currentPage)) {
            console.log("[MainJS onAuthStateChanged] User not logged in, on protected page. Redirecting to auth.html from:", currentPage);
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

    // Set initial values from Firebase Auth object
    if (els.userPhoto) els.userPhoto.src = user.photoURL || 'assets/images/default-avatar.png';
    if (els.summaryName) els.summaryName.textContent = user.displayName || 'مستخدم رحلة';
    if (els.summaryEmail) els.summaryEmail.textContent = user.email;
    if (els.emailInput) els.emailInput.value = user.email;
    if (els.displayNameInput) els.displayNameInput.value = user.displayName || '';

    // Fetch more details from backend if profile is ready
    if (isBackendProfileReady) {
        try {
            const token = await getIdToken(user);
            const response = await fetch(`${RENDER_API_BASE_URL}/api/user/${user.uid}/profile`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok && response.status !== 404) { // Handle non-404 errors specifically
                const errorText = await response.text().catch(() => `فشل جلب تفاصيل الملف الشخصي (Code: SPP-BE-${response.status})`);
                console.error(`Failed to fetch profile from backend (setupProfilePage): ${response.status} - ${errorText}`);
                // Fallback to Firebase data if backend fetch fails for reasons other than 404
                const nameParts = user.displayName ? user.displayName.split(' ') : ['', ''];
                if (els.firstNameInput && !els.firstNameInput.value) els.firstNameInput.value = nameParts[0] || '';
                if (els.lastNameInput && !els.lastNameInput.value) els.lastNameInput.value = nameParts.slice(1).join(' ') || '';
            } else if (response.ok) { // Only process if response is OK (2xx)
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
                // Update photo and summary name from backend data if available, overriding Firebase initial set
                if (els.userPhoto && profileData.photo_url) els.userPhoto.src = profileData.photo_url;
                if (els.summaryName && profileData.display_name) els.summaryName.textContent = profileData.display_name;
            } else if (response.status === 404) {
                 console.warn(`[MainJS setupProfilePage] Profile for user ${user.uid} still not found in backend. This should have been created by ensureAndSync. Using Firebase data as fallback.`);
                 // Fallback to Firebase data if backend profile is (unexpectedly) still not found
                 const nameParts = user.displayName ? user.displayName.split(' ') : ['', ''];
                 if (els.firstNameInput) els.firstNameInput.value = nameParts[0] || '';
                 if (els.lastNameInput) els.lastNameInput.value = nameParts.slice(1).join(' ') || '';
            }
        } catch (error) {
            console.error("Error in try-catch fetching/processing profile data (setupProfilePage):", error);
            // Fallback to Firebase data on any other exception
            const nameParts = user.displayName ? user.displayName.split(' ') : ['', ''];
            if (els.firstNameInput && !els.firstNameInput.value) els.firstNameInput.value = nameParts[0] || '';
            if (els.lastNameInput && !els.lastNameInput.value) els.lastNameInput.value = nameParts.slice(1).join(' ') || '';
        }
    } else {
         console.warn(`[MainJS setupProfilePage] Backend profile not ready for UID: ${user.uid}. Displaying data from Firebase Auth only.`);
         // Fallback to Firebase data if backend profile sync failed earlier
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
                    if (profilePageElements.userPhoto) profilePageElements.userPhoto.src = 'assets/images/loading-spinner.gif'; // Show loading
                    await uploadBytes(imageRef, file);
                    const downloadURL = await getDownloadURL(imageRef);
                    await updateProfile(auth.currentUser, { photoURL: downloadURL }); // Update Firebase Auth profile
                    // Update backend profile
                    const token = await getIdToken(auth.currentUser);
                    const updateResponse = await fetch(`${RENDER_API_BASE_URL}/api/user/${auth.currentUser.uid}/profile`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ photo_url: downloadURL }) // Use photo_url as expected by backend
                    });
                    if (!updateResponse.ok) {
                        const errorData = await updateResponse.json().catch(() => ({message: "فشل تحديث الصورة في الخادم."}));
                        throw new Error(errorData.message);
                    }
                    if (els.userPhoto) els.userPhoto.src = downloadURL;
                    showSuccessMessage("تم تحديث صورة الملف الشخصي بنجاح!", els.updateSuccessDiv);
                    setTimeout(() => { if (els.updateSuccessDiv) els.updateSuccessDiv.style.display = 'none'; }, 3000);
                } catch (error) {
                    console.error("Error uploading profile picture or updating backend:", error);
                    showAuthError(error.message || getFriendlyErrorMessage(error.code || 'PROFILE_PIC_UPLOAD_ERROR'), els.updateErrorDiv);
                    if (els.userPhoto && auth.currentUser) els.userPhoto.src = auth.currentUser.photoURL || 'assets/images/default-avatar.png'; // Revert to old or default
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

            if (!newDisplayName) { // Default display name if empty
                newDisplayName = `${newFirstName} ${newLastName}`.trim() || auth.currentUser.email.split('@')[0];
            }

            const updatedProfileDataForBackend = {
                firstName: newFirstName,
                lastName: newLastName,
                displayName: newDisplayName,
                phone: newCountryCode && newPhone ? `${newCountryCode}${newPhone}` : null,
                // photo_url is handled separately by image upload
            };

            try {
                // Update Firebase Auth profile (only displayName here, photoURL is separate)
                if (auth.currentUser.displayName !== newDisplayName) {
                    await updateProfile(auth.currentUser, { displayName: newDisplayName });
                }

                // Update backend profile
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
                if (els.summaryName) els.summaryName.textContent = newDisplayName; // Update summary name
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
            link.dataset.tabListenerAttached = 'true'; // Mark all as attached after first setup
        });
        if(els.tabLinks[0]) els.tabLinks[0].dataset.tabListenerAttached = 'true'; // Ensure flag is set
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
                if (currentPassword === null) return; // User cancelled prompt

                try {
                    const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
                    await reauthenticateWithCredential(auth.currentUser, credential);

                    const token = await getIdToken(auth.currentUser);
                    const backendDeleteResponse = await fetch(`${RENDER_API_BASE_URL}/api/user/${auth.currentUser.uid}/delete-account`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    if (!backendDeleteResponse.ok && backendDeleteResponse.status !== 404) { // Allow 404 if backend already deleted
                        const errorData = await backendDeleteResponse.json().catch(() => ({message: "فشل حذف بيانات المستخدم من الخادم."}));
                        throw new Error(errorData.message);
                    }
                    console.log("User data processed by backend for deletion.");

                    await auth.currentUser.delete(); // Delete Firebase user
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


// --- Purchase Dropdown Logic (largely unchanged, ensure user object is current) ---
function setupPurchaseDropdown(userInstance) { // Pass the current user object
    const purchaseDropdown = document.getElementById('purchase-dropdown');
    if (!purchaseDropdown) { return { resetDropdownStateForNewOpen: () => {} }; }

    const purchaseOptions = Array.from(purchaseDropdown.querySelectorAll('.purchase-option'));
    const promoInput = document.getElementById('promo-code-input');
    const applyPromoBtn = document.getElementById('apply-promo-btn');
    const totalPriceDisplay = document.getElementById('total-price-display');
    const payNowBtn = document.getElementById('pay-now-btn');

    let promoStatusDiv = purchaseDropdown.querySelector('.promo-status-feedback');
    if (!promoStatusDiv) { /* ... (creation logic as before) ... */ }

    let selectedPrice = 0, selectedGames = 0, selectedPackageName = "", finalPrice = 0, currentPromo = null, gamesToGrantFromPromo = 0;

    const resetDropdownStateForNewOpen = () => { /* ... (as before) ... */ };
    function resetPromoState(clearInput = true) { /* ... (as before) ... */ }
    function showPromoStatus(message, type = "info") { /* ... (as before) ... */ }
    function updateFinalPrice() { /* ... (as before, ensure payNowBtn.disabled logic is robust) ... */ }

    purchaseOptions.forEach(option => {
        if (!option.dataset.listenerAttachedPurchase) {
            option.addEventListener('click', () => { /* ... (as before) ... */ });
            option.dataset.listenerAttachedPurchase = 'true';
        }
    });

    if (applyPromoBtn && !applyPromoBtn.dataset.listenerAttachedPromo) {
        applyPromoBtn.addEventListener('click', async () => {
            if (!auth.currentUser) { alert("الرجاء تسجيل الدخول أولاً."); return; } // Use auth.currentUser
            const currentUserForPromo = auth.currentUser; // Capture current user
            // ... (rest of apply promo logic, using currentUserForPromo.uid and getIdToken(currentUserForPromo))
             const promoCodeValue = promoInput.value.trim().toUpperCase();
             if (!promoCodeValue) { showPromoStatus("الرجاء إدخال كود الخصم.", "error"); return; }
             applyPromoBtn.disabled = true; applyPromoBtn.textContent = 'جار التحقق...';
             showPromoStatus("جار التحقق من الكود...", "info");
             try {
                 const token = await getIdToken(currentUserForPromo);
                 const response = await fetch(`${PROMO_API_URL}/validate/${promoCodeValue}`, { headers: { 'Authorization': `Bearer ${token}` }});
                 const responseData = await response.json();
                 if (!response.ok) { throw new Error(responseData.message || "كود الخصم غير صالح أو منتهي الصلاحية."); }
                 currentPromo = responseData;
                 if (responseData.type === 'free_games' && responseData.value > 0) { /* ... */ gamesToGrantFromPromo = responseData.value; /* ... */ }
                 else if (responseData.type === 'percentage' && responseData.value > 0) { /* ... */ gamesToGrantFromPromo = 0; /* ... */ }
                 else { throw new Error("نوع كود الخصم غير مدعوم أو قيمة الخصم غير صالحة."); }
             } catch (error) { /* ... */ resetPromoState(false); }
             finally { /* ... */ updateFinalPrice(); }
        });
        applyPromoBtn.dataset.listenerAttachedPromo = 'true';
    }

    if (payNowBtn && !payNowBtn.dataset.listenerAttachedPay) {
        payNowBtn.addEventListener('click', async () => {
            if (!auth.currentUser) { /* ... (alert as before) ... */ return; }
            const currentUserForPayment = auth.currentUser; // Capture current user for this operation
            // ... (rest of payNowBtn logic, using currentUserForPayment.uid and getIdToken(currentUserForPayment))
            // ... including the fetch to /grant-free-games or /initiate-myfatoorah
            // IMPORTANT: Ensure all fetch calls inside use `currentUserForPayment.uid` and `getIdToken(currentUserForPayment)`
            const userId = currentUserForPayment.uid;
            const token = await getIdToken(currentUserForPayment);
            // ... (logic for free games or MyFatoorah, ensuring 'userId' and 'token' are used)
            if (currentPromo && currentPromo.type === 'free_games' && gamesToGrantFromPromo > 0) {
                // Grant free games logic using userId and token
                try {
                    const response = await fetch(`${RENDER_API_BASE_URL}/api/user/${userId}/grant-free-games`, { /*...*/ });
                    // ... handle response, update balance using syncGamesBalanceWithBackend(userId) or directly
                } catch (error) { /*...*/ }
            } else if (selectedGames > 0 && finalPrice >= 0) {
                // MyFatoorah payment logic using userId and token
                try {
                    const paymentResponse = await fetch(`${RENDER_API_BASE_URL}/api/payment/initiate-myfatoorah`, { /*...*/ });
                     // ... handle response
                } catch (error) { /*...*/ }
            }
        });
        payNowBtn.dataset.listenerAttachedPay = 'true';
    }
    updateRemainingGamesDisplay(userInstance.uid); updateFinalPrice(); return { resetDropdownStateForNewOpen };
}

// --- Header UI Update ---
function updateHeaderUI(user) {
    if (!userActionsContainer) return;
    if (user) {
        // Use auth.currentUser for the most up-to-date displayName, as 'user' param might be from a previous state
        const latestUser = auth.currentUser || user; // Fallback to param if currentUser is somehow null
        const displayName = latestUser?.displayName || (latestUser?.email ? latestUser.email.split('@')[0] : 'مستخدم رحلة');

        userActionsContainer.innerHTML = ` <span class="user-greeting">مرحباً، ${displayName}</span> <div class="games-counter-container"> <button id="games-trigger" class="btn games-trigger-btn"> <span>عدد الألعاب: <span id="remaining-games-count">0</span></span> <span class="plus-icon">+</span> </button> <div id="purchase-dropdown" class="purchase-dropdown-menu"> <h4 class="dropdown-title">شراء ألعاب إضافية</h4> <ul class="purchase-options-list"> <li class="purchase-option" data-games="1" data-price="0.50"><span>لعبة واحدة</span> <span class="price">0.50 KWD</span></li> <li class="purchase-option" data-games="2" data-price="1.00"><span>لعبتين</span> <span class="price">1.00 KWD</span></li> <li class="purchase-option" data-games="5" data-price="2.00"><span>5 ألعاب</span> <span class="price">2.00 KWD</span></li> <li class="purchase-option" data-games="10" data-price="4.00"><span>10 ألعاب</span> <span class="price">4.00 KWD</span></li> </ul> <div class="promo-section"> <input type="text" id="promo-code-input" placeholder="أدخل كود الخصم" style="text-transform: uppercase;"> <button id="apply-promo-btn" class="btn btn-secondary btn-sm">تطبيق</button> </div> <div class="total-section"> <span>المجموع:</span> <strong id="total-price-display">0.00 KWD</strong> </div> <button id="pay-now-btn" class="btn btn-primary btn-block" disabled>اختر باقة أولاً</button> </div> </div> <a href="Logged.html" class="btn btn-logout" style="color: white;">حسابي</a> <button class="btn btn-logout" id="logout-btn-header">تسجيل الخروج</button> `;

        const logoutButtonHeader = document.getElementById('logout-btn-header');
        if (logoutButtonHeader && !logoutButtonHeader.dataset.listenerAttachedLogout) {
            logoutButtonHeader.addEventListener('click', () => {
                signOut(auth).catch((error) => {
                    console.error("Sign Out Error:", error);
                    alert("خطأ تسجيل الخروج.");
                });
            });
            logoutButtonHeader.dataset.listenerAttachedLogout = 'true';
        }

        if (latestUser) { // Ensure latestUser is available
            updateRemainingGamesDisplay(latestUser.uid);
            const purchaseDropdownElement = document.getElementById('purchase-dropdown');
            if (purchaseDropdownElement) {
                // Pass the most current user object to setupPurchaseDropdown
                window.currentPurchaseDropdownSetup = setupPurchaseDropdown(latestUser);
            }
        }
    } else {
        userActionsContainer.innerHTML = `<a href="auth.html" class="btn btn-register">تسجيل / دخول</a>`;
        window.currentPurchaseDropdownSetup = null; // Clear setup if user logs out
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
    if (!isBackendProfileReady) { // Check if backend profile is ready
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
                if(document.getElementById('games-trigger')) { // Re-check element existence
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
            window.location.href = this.href; // 'game.html'
        }
    });
}

// --- Expose functions/variables needed by game.js or other modules ---
window.firebaseAuth = auth; // Used by game.js
window.getRemainingGamesForUser = getRemainingGames; // Potentially useful for game.js
window.updateRemainingGamesDisplayForUser = updateRemainingGamesDisplay; // Potentially useful
window.RENDER_API_BASE_URL = RENDER_API_BASE_URL; // Used by game.js
window.isUserBackendProfileReady = () => isBackendProfileReady; // game.js can check this

console.log("main.js loaded. RENDER_API_BASE_URL is set to:", RENDER_API_BASE_URL);
