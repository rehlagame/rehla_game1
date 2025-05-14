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
// MODIFIED: Point to your Render API
const RENDER_API_BASE_URL = 'https://your-rehla-api.onrender.com'; // <--- استبدل هذا بالـ URL الصحيح!
const PROMO_API_URL = `${RENDER_API_BASE_URL}/api/promos`; // Example endpoint

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
        default: return `حدث خطأ غير متوقع. (${errorCode})`;
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
    if (!userId) return;
    try {
        const token = await getIdToken(auth.currentUser);
        const response = await fetch(`${RENDER_API_BASE_URL}/api/user/${userId}/profile`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to fetch user profile from backend');
        const profileData = await response.json();
        if (typeof profileData.gamesBalance === 'number') {
            localStorage.setItem(getUserGamesKey(userId), profileData.gamesBalance.toString());
            updateRemainingGamesDisplay(userId);
            console.log(`Synced games balance for ${userId} from backend: ${profileData.gamesBalance}`);
        }
    } catch (error) {
        console.error("Error syncing games balance with backend:", error);
        // Fallback to localStorage if sync fails, or handle as appropriate
    }
}


function addGamesToBalance(userId, gamesToAdd, source = "localStorage") {
    if (!userId || typeof gamesToAdd !== 'number' || gamesToAdd <= 0) {
        console.warn("addGamesToBalance: Invalid userId or gamesToAdd.", { userId, gamesToAdd });
        return;
    }
    const currentGames = getRemainingGames(userId);
    const newTotalGames = currentGames + gamesToAdd;
    localStorage.setItem(getUserGamesKey(userId), newTotalGames.toString());
    updateRemainingGamesDisplay(userId);
    console.log(`Added ${gamesToAdd} games from ${source}. New balance for ${userId}: ${newTotalGames}`);
    // Optionally, you could also make an API call here to update the backend if the source wasn't already the backend.
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
        // Optionally, you could also make an API call here to inform the backend.
        // e.g., fetch(`${RENDER_API_BASE_URL}/api/user/${userId}/decrement-game`, { method: 'POST', headers: { 'Authorization': `Bearer <TOKEN>` }});
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
                // gamesBalance will be initialized by backend or set to 0 if not present
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
                const errorData = await response.json();
                console.error("Failed to save new user profile to backend:", errorData);
                // Decide how to handle this: maybe log out user, or proceed with a warning
            } else {
                console.log("New user profile saved to backend.");
                const backendProfile = await response.json();
                if (backendProfile && typeof backendProfile.gamesBalance === 'number') {
                    localStorage.setItem(getUserGamesKey(user.uid), backendProfile.gamesBalance.toString());
                } else {
                    localStorage.setItem(getUserGamesKey(user.uid), '0'); // Default if not returned
                }
            }
        } catch (error) {
            console.error("Error saving new user profile to backend:", error);
        }
    }

    // For both new and existing users, try to sync balance
    await syncGamesBalanceWithBackend(user.uid); // This will also update display

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
            await updateProfile(userCredential.user, { displayName: displayName }); // Update Firebase Auth profile

            const registrationData = { firstName, lastName, countryCode, phone, displayName };
            await handleAuthSuccess(userCredential.user, true, registrationData); // Pass isNewUser=true and registrationData
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
            .then((userCredential) => handleAuthSuccess(userCredential.user, false)) // isNewUser = false
            .catch((error) => {
                console.error("Login Error:", error);
                showAuthError(getFriendlyErrorMessage(error.code));
            });
    });
}

if (resetPasswordFormEl) {
    resetPasswordFormEl.addEventListener('submit', (e) => { /* ... (unchanged) ... */ });
}

const handleSocialSignIn = async (provider) => {
    hideAuthMessages();
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        // For social sign-in, Firebase usually populates displayName and photoURL.
        // We might need to check if this user profile exists in our backend.
        // Let handleAuthSuccess handle the initial sync or profile creation logic.
        // The isNewUser flag can be determined by checking if a profile already exists in your backend for this firebaseUid.
        // For simplicity here, we'll assume handleAuthSuccess will attempt to create/sync if needed.
        // A more robust way: check if user exists in your DB. If not, pass isNewUser=true.
        // For now, let's treat it like a login (isNewUser=false), and let backend handle potential profile creation if needed.
        await handleAuthSuccess(user, false);
    } catch (error) {
        // ... (error handling unchanged)
        console.error("Social Sign-In Error:", error);
        if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
            showAuthError(getFriendlyErrorMessage(error.code));
        }
    }
};


if (googleSignInButtonEl) { /* ... (unchanged) ... */ }
if (appleSignInButtonEl) { /* ... (unchanged) ... */ }


// --- Profile Page (Logged.html) Logic ---
async function setupProfilePage(user) {
    const els = profilePageElements;
    if (!els.infoForm || !user) return;

    // Load initial data from Firebase Auth (local cache)
    if (els.userPhoto) els.userPhoto.src = user.photoURL || 'assets/images/default-avatar.png';
    if (els.summaryName) els.summaryName.textContent = user.displayName || 'مستخدم رحلة';
    if (els.summaryEmail) els.summaryEmail.textContent = user.email;
    if (els.emailInput) els.emailInput.value = user.email; // Email is readonly
    if (els.displayNameInput) els.displayNameInput.value = user.displayName || '';


    // Fetch full profile data from your backend (Render API)
    try {
        const token = await getIdToken(user);
        const response = await fetch(`${RENDER_API_BASE_URL}/api/user/${user.uid}/profile`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to fetch profile from backend');
        const profileData = await response.json();

        if (els.firstNameInput) els.firstNameInput.value = profileData.firstName || '';
        if (els.lastNameInput) els.lastNameInput.value = profileData.lastName || '';
        if (profileData.phone) {
            // Attempt to parse country code and phone number
            // This is a simple heuristic, might need refinement based on how you store phone numbers
            let fullPhone = profileData.phone;
            let countryCode = "+965"; // Default
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
        if (els.userPhoto && profileData.photoURL) els.userPhoto.src = profileData.photoURL; // Update with backend URL if different/more up-to-date
        if (els.summaryName && profileData.displayName) els.summaryName.textContent = profileData.displayName;


    } catch (error) {
        console.error("Error fetching profile data from backend:", error);
        // Fallback to Firebase Auth data if backend fetch fails for non-critical fields
        const nameParts = user.displayName ? user.displayName.split(' ') : ['', ''];
        if (els.firstNameInput && !els.firstNameInput.value) els.firstNameInput.value = nameParts[0] || '';
        if (els.lastNameInput && !els.lastNameInput.value) els.lastNameInput.value = nameParts.slice(1).join(' ') || '';
    }


    if (els.photoUploadInput && els.userPhoto) {
        els.photoUploadInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file || !user) return;

            const imageRef = storageRef(storage, `profile_pictures/${user.uid}/${file.name}`);
            try {
                profilePageElements.userPhoto.src = 'assets/images/loading-spinner.gif'; // Show loading
                await uploadBytes(imageRef, file);
                const downloadURL = await getDownloadURL(imageRef);

                // 1. Update Firebase Auth profile (for immediate local reflection and Firebase sync)
                await updateProfile(user, { photoURL: downloadURL });

                // 2. Update your backend database with the new photoURL
                const token = await getIdToken(user);
                const updateResponse = await fetch(`${RENDER_API_BASE_URL}/api/user/${user.uid}/profile`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ photoURL: downloadURL }) // Send only the photoURL or other fields as needed
                });

                if (!updateResponse.ok) {
                    throw new Error('Failed to update profile photo URL in backend.');
                }

                if (els.userPhoto) els.userPhoto.src = downloadURL;
                showSuccessMessage("تم تحديث صورة الملف الشخصي بنجاح!", els.updateSuccessDiv);
                setTimeout(() => { if (els.updateSuccessDiv) els.updateSuccessDiv.style.display = 'none'; }, 3000);

            } catch (error) {
                console.error("Error uploading profile picture or updating backend:", error);
                showAuthError(getFriendlyErrorMessage(error.code || 'PROFILE_PIC_UPLOAD_ERROR'), els.updateErrorDiv);
                if (els.userPhoto) els.userPhoto.src = user.photoURL || 'assets/images/default-avatar.png'; // Revert to old or default
            }
        });
    }

    els.infoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideAuthMessages(els.updateErrorDiv, els.updateSuccessDiv);
        if (!user) return;

        const newFirstName = els.firstNameInput.value;
        const newLastName = els.lastNameInput.value;
        const newCountryCode = els.countryCodeSelect.value;
        const newPhone = els.phoneInput.value;
        let newDisplayName = els.displayNameInput.value.trim();

        if (!newDisplayName) {
            newDisplayName = `${newFirstName} ${newLastName}`.trim() || user.email.split('@')[0];
        }

        const updatedProfileData = {
            firstName: newFirstName,
            lastName: newLastName,
            displayName: newDisplayName,
            phone: newCountryCode && newPhone ? `${newCountryCode}${newPhone}` : user.phoneNumber, // Keep existing if new one is empty
            // email is not updated here, photoURL is updated separately
        };

        try {
            // 1. Update Firebase Auth profile (primarily for displayName)
            await updateProfile(user, { displayName: newDisplayName });

            // 2. Update your backend database
            const token = await getIdToken(user);
            const response = await fetch(`${RENDER_API_BASE_URL}/api/user/${user.uid}/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(updatedProfileData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to update profile in backend.');
            }

            if (els.summaryName) els.summaryName.textContent = newDisplayName; // Update sidebar display name
            showSuccessMessage("تم تحديث بيانات الملف الشخصي بنجاح!", els.updateSuccessDiv);
            setTimeout(() => { if (els.updateSuccessDiv) els.updateSuccessDiv.style.display = 'none'; }, 3000);

        } catch (error) {
            console.error("Profile Update Error:", error);
            showAuthError(error.message || getFriendlyErrorMessage(error.code), els.updateErrorDiv);
        }
    });

    if (els.changePasswordForm) {
        els.changePasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideAuthMessages(els.passwordChangeErrorDiv, els.passwordChangeSuccessDiv);
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
                const credential = EmailAuthProvider.credential(user.email, currentPassword);
                await reauthenticateWithCredential(user, credential);
                await updatePassword(user, newPassword);
                showSuccessMessage("تم تغيير كلمة المرور بنجاح!", els.passwordChangeSuccessDiv);
                els.changePasswordForm.reset();
                setTimeout(() => { if (els.passwordChangeSuccessDiv) els.passwordChangeSuccessDiv.style.display = 'none'; }, 3000);
            } catch (error) {
                console.error("Password Change Error:", error);
                showAuthError(getFriendlyErrorMessage(error.code), els.passwordChangeErrorDiv);
            }
        });
    }
    els.tabLinks.forEach(link => { /* ... (unchanged, UI only) ... */ });
    if (els.logoutBtnSidebar) { /* ... (unchanged) ... */ }
    if (els.deleteAccountBtn) { /* ... (unchanged, but would need a backend API call too) ... */ }
}


// --- Purchase Dropdown Logic (REVISED to use Render API for MyFatoorah) ---
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
    // ... (promoStatusDiv creation if not exists - unchanged) ...
    if (!promoStatusDiv) {
        promoStatusDiv = document.createElement('div');
        promoStatusDiv.className = 'promo-status-feedback';
        // Ensure this style is appropriate or defined in CSS
        promoStatusDiv.style.cssText = "font-size: 0.85em; margin-top: -10px; margin-bottom: 15px; text-align: center; min-height: 1.2em; font-weight: bold;";
        const totalSection = purchaseDropdown.querySelector('.total-section');
        if (totalSection) purchaseDropdown.insertBefore(promoStatusDiv, totalSection);
        else purchaseDropdown.insertBefore(promoStatusDiv, payNowBtn);
    }


    updateRemainingGamesDisplay(user.uid);

    let selectedPrice = 0;
    let selectedGames = 0;
    let selectedPackageName = ""; // To send to backend
    let finalPrice = 0;
    let currentPromo = null;
    let gamesToGrantFromPromo = 0;

    function resetPromoState(clearInput = true) { /* ... (unchanged) ... */ }
    function showPromoStatus(message, type = "info") { /* ... (unchanged) ... */ }

    function updateFinalPrice() {
        if (!totalPriceDisplay || !payNowBtn) return;
        payNowBtn.disabled = true;

        if (currentPromo && currentPromo.type === 'free_games') {
            finalPrice = 0;
            selectedGames = 0; // No package games if free games promo is active
            selectedPackageName = `Free Games (${currentPromo.code})`; // Or similar identifier
            if (gamesToGrantFromPromo > 0) {
                payNowBtn.disabled = false;
                payNowBtn.textContent = `الحصول على ${gamesToGrantFromPromo} ${gamesToGrantFromPromo === 1 ? 'لعبة' : 'ألعاب'} مجاناً`;
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
            gamesToGrantFromPromo = 0;
        } else {
            finalPrice = 0;
            selectedGames = 0;
            selectedPackageName = "";
            gamesToGrantFromPromo = 0;
            payNowBtn.textContent = 'ادفع الآن';
        }
        totalPriceDisplay.textContent = `${finalPrice.toFixed(2)} KWD`;
    }

    // Event listeners for dropdown toggle, option selection (unchanged)
    if (!gamesTrigger.dataset.dropdownListenerAttached) { /* ... (unchanged) ... */ }
    if (!document.body.dataset.globalDropdownListenerAttached) { /* ... (unchanged) ... */ }

    purchaseOptions.forEach(option => {
        if (!option.dataset.optionListenerAttached) {
            option.addEventListener('click', () => {
                if (currentPromo && currentPromo.type === 'free_games') return;

                purchaseOptions.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                selectedPrice = parseFloat(option.dataset.price) || 0;
                selectedGames = parseInt(option.dataset.games) || 0;
                selectedPackageName = option.querySelector('span:first-child').textContent; // Get package name
                resetPromoState(false); // Keep promo input if user wants to re-apply
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
                const token = await getIdToken(user); // Get Firebase token
                const response = await fetch(`${PROMO_API_URL}/validate/${code}`, {
                    headers: { 'Authorization': `Bearer ${token}` } // Send token
                });
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
                    selectedGames = 0; selectedPrice = 0; selectedPackageName = `Free Games (${currentPromo.code})`;
                    gamesToGrantFromPromo = currentPromo.value;
                } else { // Percentage promo
                    gamesToGrantFromPromo = 0;
                    purchaseOptions.forEach(opt => {
                        opt.style.pointerEvents = 'auto';
                        opt.style.opacity = '1';
                    });
                    // If a package was already selected, the price will update.
                    // If not, user needs to select one.
                }
            } catch (error) {
                console.error("Promo validation error:", error);
                showPromoStatus(error.message || "خطأ في التحقق من الكود.", "error");
                resetPromoState(false); // Keep promo input content for re-try
            } finally {
                if (!currentPromo && applyPromoBtn) {
                    applyPromoBtn.disabled = false;
                    applyPromoBtn.textContent = 'تطبيق';
                }
                updateFinalPrice();
            }
        });
        applyPromoBtn.dataset.promoListenerAttached = 'true';
    }

    if (payNowBtn && !payNowBtn.dataset.payListenerAttached) {
        payNowBtn.addEventListener('click', async () => {
            let isFreeClaim = currentPromo && currentPromo.type === 'free_games' && gamesToGrantFromPromo > 0;
            let itemsToProcess = isFreeClaim ? gamesToGrantFromPromo : selectedGames;

            if (itemsToProcess <= 0) {
                alert("الرجاء اختيار باقة ألعاب أو تطبيق كود ألعاب صالح.");
                return;
            }

            payNowBtn.disabled = true;
            payNowBtn.textContent = 'جار المعالجة...';

            try {
                const token = await getIdToken(user);
                const payload = {
                    userId: user.uid,
                    email: user.email, // MyFatoorah might need customer email
                    amount: finalPrice, // Send final calculated price
                    packageName: selectedPackageName,
                    gamesInPackage: selectedGames, // Original games in package before discount
                    promoCode: currentPromo ? currentPromo.code : null,
                    isFreeClaim: isFreeClaim,
                    gamesToGrantFromPromo: gamesToGrantFromPromo, // For backend to verify free claim
                };

                // If it's a free claim from a promo code, directly update balance (or let backend do it)
                if (isFreeClaim) {
                    console.log(`Claiming ${gamesToGrantFromPromo} free games for user ${user.uid} via promo ${currentPromo.code}.`);
                    // Backend should verify promo and add games.
                    // For frontend-only simulation (if backend doesn't handle free claim logic directly):
                    // addGamesToBalance(user.uid, gamesToGrantFromPromo, "promo_claim");
                    // alert(`تمت إضافة ${gamesToGrantFromPromo} لعبة مجانية إلى رصيدك!`);

                    // Assuming backend handles the free claim and games addition:
                    const freeClaimResponse = await fetch(`${RENDER_API_BASE_URL}/api/payments/claim-free-games`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(payload)
                    });

                    if (!freeClaimResponse.ok) {
                        const errorData = await freeClaimResponse.json();
                        throw new Error(errorData.message || "فشل في الحصول على الألعاب المجانية.");
                    }
                    const claimResult = await freeClaimResponse.json();
                    addGamesToBalance(user.uid, claimResult.gamesAdded || gamesToGrantFromPromo, "promo_backend_claim");
                    alert(claimResult.message || `تمت إضافة ${claimResult.gamesAdded || gamesToGrantFromPromo} لعبة مجانية!`);

                } else { // Regular payment processing
                    const response = await fetch(`${RENDER_API_BASE_URL}/api/payments/initiate`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(payload)
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.message || "فشل بدء عملية الدفع.");
                    }

                    const paymentData = await response.json();
                    if (paymentData.paymentUrl) {
                        // Redirect to MyFatoorah payment page
                        window.location.href = paymentData.paymentUrl;
                        // Backend will handle callback from MyFatoorah and update game balance.
                        // The user will be redirected back to a success/failure page you configure in MyFatoorah.
                        // On return to your app, onAuthStateChanged and syncGamesBalanceWithBackend should update the UI.
                        return; // Stop further execution here as user is redirected
                    } else {
                        throw new Error("لم يتم استقبال رابط الدفع.");
                    }
                }

                // Reset dropdown if not redirected (e.g., for free claims processed here)
                if (purchaseDropdown) purchaseDropdown.classList.remove('show');
                selectedPrice = 0; selectedGames = 0; gamesToGrantFromPromo = 0; selectedPackageName = "";
                purchaseOptions.forEach(opt => opt.classList.remove('selected'));
                resetPromoState(true);

            } catch (error) {
                console.error("Payment/Claim Error:", error);
                alert(error.message || "حدث خطأ أثناء محاولة الشراء/الحصول على الألعاب.");
                payNowBtn.disabled = false;
                updateFinalPrice(); // Reset button text and state
            }
        });
        payNowBtn.dataset.payListenerAttached = 'true';
    }
}

// --- Header UI Update ---
function updateHeaderUI(user) {
    if (!userActionsContainer) return;

    if (user) {
        const latestUser = auth.currentUser; // Get the most up-to-date user object
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
                    {/* Promo status div will be inserted here by JS if not present */}
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
            setupPurchaseDropdown(latestUser); // Ensure it's called with the fresh user object
        }
    } else {
        userActionsContainer.innerHTML = `<a href="auth.html" class="btn btn-register">تسجيل / دخول</a>`;
    }
}

// --- Auth State Listener ---
onAuthStateChanged(auth, async (user) => {
    const currentPage = window.location.pathname.toLowerCase().split('/').pop() || 'index.html';
    console.log(`Auth state change on: ${currentPage}. User: ${user ? user.uid : 'Logged out'}`);

    updateHeaderUI(user); // Update header first, this might re-create dropdown elements

    if (user) {
        await syncGamesBalanceWithBackend(user.uid); // Sync balance after login/auth state change

        if (currentPage === 'logged.html') {
            await setupProfilePage(user); // Pass the user object
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
function handlePlayAttemptCheckBalanceOnly() { /* ... (unchanged) ... */ }
if (mainPlayButtonEl && (window.location.pathname.endsWith('/') || window.location.pathname.endsWith('index.html'))) { /* ... (unchanged) ... */ }

// --- Expose functions needed by game.js or other modules ---
window.firebaseAuth = auth;
window.getRemainingGamesForUser = getRemainingGames;
window.deductGameFromUserBalance = deductGameFromBalance;

console.log("main.js loaded and initialized. Using Render API for backend interactions.");
