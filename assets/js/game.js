/* --- START OF FILE assets/js/game.js --- */

// --- عناصر واجهة المستخدم (Setup) ---
const gameSetupSection = document.getElementById('game-setup-section');
const gameSetupForm = document.getElementById('game-setup-form');
const team1NameInput = document.getElementById('team1-name');
const team1StartInput = document.getElementById('team1-start');
const team2NameInput = document.getElementById('team2-name');
const team2StartInput = document.getElementById('team2-start');

// --- عناصر واجهة المستخدم (Game Play Area) ---
const gamePlayArea = document.getElementById('game-play-area');
const currentTeamTurnDisplay = document.getElementById('current-team-turn');
const team1InfoCard = document.getElementById('team1-info');
const team1DisplayName = document.getElementById('team1-display-name');
const team1ScoreDisplay = document.getElementById('team1-score');
const team1CurrentStationName = document.getElementById('team1-current-station-name');
const team1PathList = document.getElementById('team1-path-list');
const team2InfoCard = document.getElementById('team2-info');
const team2DisplayName = document.getElementById('team2-display-name');
const team2ScoreDisplay = document.getElementById('team2-score');
const team2CurrentStationName = document.getElementById('team2-current-station-name');
const team2PathList = document.getElementById('team2-path-list');
const questionInteractionArea = document.getElementById('question-interaction-area');
const questionTitle = document.getElementById('question-title');
const questionDifficulty = document.getElementById('question-difficulty');
const questionPoints = document.getElementById('question-points');
const questionText = document.getElementById('question-text');
const answerOptionsWrapper = document.getElementById('answer-options-wrapper');
const answerOptionsContainer = document.getElementById('answer-options');
const revealAnswerBtn = document.getElementById('reveal-answer-btn');
const answerRevealSection = document.getElementById('answer-reveal-section');
const correctAnswerText = document.getElementById('correct-answer-text');
const assignPointsTeam1Btn = document.getElementById('assign-points-team1');
const assignPointsTeam2Btn = document.getElementById('assign-points-team2');
const assignPointsNoneBtn = document.getElementById('assign-points-none');
const previousCorrectAnswerDisplay = document.getElementById('previous-correct-answer-display');
const previousCorrectAnswerText = document.getElementById('previous-correct-answer-text');
const feedbackMessage = document.getElementById('feedback-message');
const gameOverSection = document.getElementById('game-over-section');
const finalResultsDisplay = document.getElementById('final-results');
const playAgainBtn = document.getElementById('play-again-btn');
const timerDisplayElement = document.getElementById('question-timer');
const viewPreviousBtn = document.getElementById('view-previous-btn');
const returnToCurrentBtn = document.getElementById('return-to-current-btn');

// --- عناصر الصورة المضافة ---
const questionImageContainer = document.getElementById('question-image-container');
const questionImage = document.getElementById('question-image');
const previousQuestionImage = document.getElementById('previous-question-image');

// ===> إضافة عناصر أزرار تعديل النقاط اليدوية <===
const incScoreTeam1Btn = document.getElementById('inc-score-team1');
const decScoreTeam1Btn = document.getElementById('dec-score-team1');
const incScoreTeam2Btn = document.getElementById('inc-score-team2');
const decScoreTeam2Btn = document.getElementById('dec-score-team2');
// ===> نهاية الإضافة <===

// --- إعدادات اللعبة ---
const STATIONS_PER_TEAM = 4;
const QUESTIONS_PER_STATION = 3;
const QUESTION_TIME_LIMIT = 60; // seconds
const POINT_ASSIGNMENT_DELAY = 2500; // milliseconds

const RENDER_API_BASE_URL_GAME = typeof window !== 'undefined' && window.RENDER_API_BASE_URL ? window.RENDER_API_BASE_URL : 'https://rehla-game-backend.onrender.com';
const RENDER_API_QUESTIONS_ENDPOINT = `${RENDER_API_BASE_URL_GAME}/api/game/questions-data`;

// --- حالة اللعبة (Game State) ---
let gameState = {};
let allLandmarkNames = [];
let generalQuestions = [];         // *** للأسئلة العامة (التي هي صعبة بشكل افتراضي) ***
let generalMediumQuestions = []; // *** للأسئلة العامة المتوسطة ***
let questionsByLandmark = {};
let questionTimerInterval = null;
let isGameDataLoaded = false;


async function fetchGameDataFromAPI() {
    try {
        let headers = { 'Content-Type': 'application/json' };
        if (window.firebaseAuth && window.firebaseAuth.currentUser) {
            try {
                const token = await window.firebaseAuth.currentUser.getIdToken(true);
                headers['Authorization'] = `Bearer ${token}`;
            } catch (tokenError) {
                console.warn("Could not get Firebase ID token for game data fetch:", tokenError);
            }
        }

        const response = await fetch(RENDER_API_QUESTIONS_ENDPOINT, { headers });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: `فشل جلب بيانات اللعبة: ${response.status}` }));
            throw new Error(errorData.message || `فشل جلب بيانات اللعبة: ${response.status}`);
        }
        const apiData = await response.json();

        allLandmarkNames = apiData.allLandmarks || [];
        generalQuestions = apiData.generalQs || [];           // *** استقبال الأسئلة العامة (الصعبة) ***
        generalMediumQuestions = apiData.generalMediumQs || []; // *** استقبال الأسئلة العامة المتوسطة ***
        questionsByLandmark = apiData.landmarkQs || {};

        if (allLandmarkNames.length < 2) {
            console.error("CRITICAL: Not enough landmarks from API (< 2). Game might not function correctly.");
        }
        console.log(`Fetched from API: ${allLandmarkNames.length} landmarks, ${generalQuestions.length} general (hard) Qs, ${generalMediumQuestions.length} general MEDIUM Qs.`);
        isGameDataLoaded = true;
        return true;
    } catch (error) {
        console.error("Error fetching game data from API:", error);
        isGameDataLoaded = false;
        if(gameSetupForm) gameSetupForm.style.display = 'none';
        const errDiv = document.createElement('div');
        errDiv.innerHTML = `<h2 style="color:red; text-align:center;">خطأ فادح!</h2><p style="text-align:center;">فشل تحميل بيانات اللعبة من الخادم.<br>${error.message}</p><p style="text-align:center; margin-top:10px;"><button onclick="location.reload()">حاول مرة أخرى</button></p>`;
        errDiv.style.cssText='color:red;padding:1em;border:1px solid red;margin: 20px auto; max-width: 500px; background-color: #fff0f0;';
        const gameContentContainer = document.querySelector('main.game-content > .container');
        if(gameContentContainer && !gameContentContainer.querySelector('.api-error-msg')) {
            const existingError = gameContentContainer.querySelector('.api-error-msg');
            if(existingError) existingError.remove();
            errDiv.classList.add('api-error-msg');
            gameContentContainer.insertBefore(errDiv, gameContentContainer.firstChild);
        }
        return false;
    }
}


// ===========================================
// ===== الدوال المساعدة والتعريفات أولاً =====
// ===========================================

function stopQuestionTimer() { if (questionTimerInterval) { clearInterval(questionTimerInterval); questionTimerInterval = null; } }
function formatTime(s) { const m = Math.floor(s / 60); const rs = s % 60; return `${m}:${rs.toString().padStart(2, '0')}`; }

function startQuestionTimer(duration) {
    stopQuestionTimer();
    if (!timerDisplayElement) { console.error("Timer element missing!"); return; }
    let remaining = duration;
    timerDisplayElement.textContent = formatTime(remaining);
    timerDisplayElement.style.backgroundColor = 'var(--black-color)';
    questionTimerInterval = setInterval(() => {
        remaining--;
        if (!timerDisplayElement) { stopQuestionTimer(); return; }
        timerDisplayElement.textContent = formatTime(remaining);
        if (remaining <= 10 && remaining > 0) { timerDisplayElement.style.backgroundColor = 'var(--danger-color)'; }
        else if (remaining > 10) { timerDisplayElement.style.backgroundColor = 'var(--black-color)'; }
        if (remaining <= 0) {
            stopQuestionTimer();
            timerDisplayElement.textContent = "0:00";
            timerDisplayElement.style.backgroundColor = 'var(--danger-color)';
            if (answerOptionsContainer) {
                answerOptionsContainer.querySelectorAll('.option-btn').forEach(btn => btn.disabled = true);
            }
        }
    }, 1000);
}

function resetGameState(isFullReset = true) {
    stopQuestionTimer();
    if (isFullReset) {
        gameState = {
            team1: { name:'', score:0, path:[], currentStationIndex:0, currentQuestionIndexInStation:0 },
            team2: { name:'', score:0, path:[], currentStationIndex:0, currentQuestionIndexInStation:0 },
            currentTurn:'team1',
            currentQuestion:null,
            isGameOver:false,
            answeredQuestionsCount:0,
            askedQuestions:{
                "kuwait_general": new Set(),          // *** مفتاح للأسئلة العامة (الصعبة) ***
                "kuwait_general_medium": new Set()  // للأسئلة العامة المتوسطة
                // سيتم إضافة مفاتيح المعالم ديناميكيًا عند الحاجة
            },
            previousQuestion:null,
            isViewingPrevious:false
        };
        if(team1PathList) team1PathList.innerHTML='';
        if(team2PathList) team2PathList.innerHTML='';
        if(team1ScoreDisplay) team1ScoreDisplay.textContent='0';
        if(team2ScoreDisplay) team2ScoreDisplay.textContent='0';
        if(team1CurrentStationName) team1CurrentStationName.textContent='-';
        if(team2CurrentStationName) team2CurrentStationName.textContent='-';
    }

    if(feedbackMessage) { feedbackMessage.textContent=''; feedbackMessage.className=''; }
    if(gameOverSection) { gameOverSection.classList.remove('visible'); gameOverSection.classList.add('hidden'); }

    if(revealAnswerBtn) revealAnswerBtn.disabled=false;
    if(answerOptionsWrapper) answerOptionsWrapper.classList.remove('hidden');
    if(answerOptionsContainer) answerOptionsContainer.innerHTML='';
    if(answerRevealSection) answerRevealSection.classList.add('hidden');
    if(previousCorrectAnswerDisplay) previousCorrectAnswerDisplay.classList.add('hidden');
    if(viewPreviousBtn) viewPreviousBtn.classList.add('hidden');
    if(returnToCurrentBtn) returnToCurrentBtn.classList.add('hidden');
    if(timerDisplayElement) { timerDisplayElement.textContent = formatTime(QUESTION_TIME_LIMIT); timerDisplayElement.style.backgroundColor = 'var(--black-color)'; }

    if (questionImageContainer) questionImageContainer.classList.add('hidden');
    if (questionImage) { questionImage.src = '#'; questionImage.alt = 'صورة السؤال'; }
    if (previousQuestionImage) { previousQuestionImage.src = '#'; previousQuestionImage.alt = 'صورة السؤال السابق'; previousQuestionImage.style.display = 'none'; }

    if (playAgainBtn) {
        playAgainBtn.disabled = false;
        playAgainBtn.style.opacity = "1";
        playAgainBtn.style.cursor = "pointer";
    }
    const noBalanceMessage = document.getElementById('no-balance-message');
    if (noBalanceMessage) {
        noBalanceMessage.remove();
    }
    const apiErrorMsg = document.querySelector('.api-error-msg');
    if (apiErrorMsg) apiErrorMsg.remove();

    console.log("Game state reset performed. Full reset:", isFullReset);
}


function getRandomUniqueItems(arr, num) { if (!Array.isArray(arr)) { return []; } const n=Math.min(num, arr.length); if(n===0) return []; const sh=[...arr].sort(()=>0.5-Math.random()); return sh.slice(0,n); }
function shuffleArray(arr) { if (!Array.isArray(arr)) { return []; } for (let i=arr.length-1; i>0; i--) { const j=Math.floor(Math.random()*(i+1)); [arr[i], arr[j]]=[arr[j], arr[i]]; } return arr; }
function getDifficultyText(d) { switch(d){case 'easy':return 'سهل'; case 'medium':return 'متوسط'; case 'hard':return 'صعب'; default: return d||'متوسط';} }
function displayTeamPath(team, listEl) { if (!team||!listEl||!Array.isArray(team.path)) { if(listEl) listEl.innerHTML='<li>خطأ</li>'; return; } listEl.innerHTML=''; team.path.forEach((st, idx) => { if (!st||!st.name) { const li=document.createElement('li'); li.textContent=`محطة ${idx+1}(خطأ)`; li.style.color='red'; listEl.appendChild(li); return; } const li=document.createElement('li'); li.textContent=st.name; li.title=st.name; if (idx < team.currentStationIndex) li.classList.add('completed-path-station'); else if (idx===team.currentStationIndex && team.currentStationIndex < STATIONS_PER_TEAM) li.classList.add('current-path-station'); listEl.appendChild(li); }); }
function updateDashboard() { try { if(!gameState?.team1||!gameState?.team2) return; if(team1DisplayName) team1DisplayName.textContent=gameState.team1.name||''; if(team1ScoreDisplay) team1ScoreDisplay.textContent=gameState.team1.score??0; if(team1PathList) displayTeamPath(gameState.team1, team1PathList); if(team1CurrentStationName) team1CurrentStationName.textContent=gameState.team1.path[gameState.team1.currentStationIndex]?.name||(gameState.team1.currentStationIndex>=STATIONS_PER_TEAM?"أنهى":"-"); if(team1InfoCard) team1InfoCard.classList.toggle('active-team', gameState.currentTurn==='team1'); if(team2DisplayName) team2DisplayName.textContent=gameState.team2.name||''; if(team2ScoreDisplay) team2ScoreDisplay.textContent=gameState.team2.score??0; if(team2PathList) displayTeamPath(gameState.team2, team2PathList); if(team2CurrentStationName) team2CurrentStationName.textContent=gameState.team2.path[gameState.team2.currentStationIndex]?.name||(gameState.team2.currentStationIndex>=STATIONS_PER_TEAM?"أنهى":"-"); if(team2InfoCard) team2InfoCard.classList.toggle('active-team', gameState.currentTurn==='team2'); if(currentTeamTurnDisplay) currentTeamTurnDisplay.textContent=gameState[gameState.currentTurn]?.name||'?'; } catch(e){console.error("Dashboard Err:",e);} }

function displayQuestion(question, sourceTitle = null) {
    // ... (الكود كما هو)
    const title = sourceTitle || (question.isGeneral ? "سؤال عام عن الكويت" : `سؤال المحطة: ${stationName}`);
    // ... (بقية الكود كما هو)
}

// ... (بقية الدوال: revealAnswer, assignPoints, displayPreviousQuestion, checkGameOver, switchTurn, displayResults, initializeGame كما هي) ...
// *** التعديلات الأساسية ستكون في startTurn ***

function startTurn() {
    console.log(`Starting turn for ${gameState.currentTurn}`);
    // ... (بداية الدالة كما هي: التحقق من gameOver, isViewingPrevious, إعادة تعيين الواجهة) ...

    const currentTeamId = gameState.currentTurn;
    const team = gameState[currentTeamId];
    if (!team) { console.error("Error: Current team undefined!"); return; }

    // ... (التحقق من انتهاء محطات الفريق كما هو) ...

    const stationObj = team.path[team.currentStationIndex];
    if (!stationObj?.name) {
        alert(`خطأ في بيانات المحطة رقم ${team.currentStationIndex + 1}. سيتم تخطي هذه المحطة.`);
        stopQuestionTimer(); team.currentStationIndex++; team.currentQuestionIndexInStation = 0; updateDashboard(); setTimeout(startTurn, 100); return;
    }
    const stationName = stationObj.name;

    // ... (التحقق من انتهاء أسئلة المحطة الحالية كما هو) ...

    let targetPool, difficulty, landmarkFilter, askedKey, qTitle, isGeneralByDefault;

    switch (team.currentQuestionIndexInStation) {
        case 0: // السؤال الأول: سهل، خاص بالمحطة
            difficulty = 'easy';
            landmarkFilter = stationName;
            askedKey = stationName;
            targetPool = questionsByLandmark[stationName];
            isGeneralByDefault = false; // السؤال ليس عامًا بشكل افتراضي
            qTitle = `سؤال المحطة: ${stationName}`;
            break;
        case 1: // السؤال الثاني: متوسط، خاص بالمحطة أولاً، ثم عام متوسط
            difficulty = 'medium';
            landmarkFilter = stationName;
            askedKey = stationName; // مفتاح مبدئي لأسئلة المحطة
            targetPool = questionsByLandmark[stationName];
            isGeneralByDefault = false; // السؤال ليس عامًا بشكل افتراضي (في المحاولة الأولى)
            qTitle = `سؤال المحطة: ${stationName}`;
            break;
        case 2: // السؤال الثالث: صعب، عام
            difficulty = 'hard';
            landmarkFilter = null;
            askedKey = "kuwait_general";       // *** العودة للمفتاح "القديم" للأسئلة العامة (الصعبة) ***
            targetPool = generalQuestions;    // *** استخدام generalQuestions للأسئلة العامة (الصعبة) ***
            isGeneralByDefault = true;  // السؤال عام بشكل افتراضي
            qTitle = "سؤال عام (صعب)"; // أو "سؤال عام عن الكويت"
            break;
        default:
            console.error("Invalid currentQuestionIndexInStation:", team.currentQuestionIndexInStation);
            team.currentQuestionIndexInStation = 0; setTimeout(startTurn, 50); return;
    }

    targetPool = targetPool || [];
    if (!Array.isArray(targetPool)) { console.warn(`Target pool for ${askedKey} is not an array. Defaulting to empty.`); targetPool = []; }
    // تأكد من تهيئة Set إذا لم يكن موجودًا (خاصة لمفاتيح المعالم الديناميكية)
    if (!gameState.askedQuestions[askedKey]) {
        console.log(`Initializing askedQuestions set for key: ${askedKey}`);
        gameState.askedQuestions[askedKey] = new Set();
    }

    // ضمان أن خاصية isGeneral موجودة في الأسئلة وتعيينها بشكل صحيح
    targetPool.forEach(q => { if (q && q.isGeneral === undefined) { q.isGeneral = isGeneralByDefault; } });
    if (generalMediumQuestions) { // ضمان isGeneral للأسئلة العامة المتوسطة
        generalMediumQuestions.forEach(q => { if (q && q.isGeneral === undefined) { q.isGeneral = true; } });
    }
    if (generalQuestions) { // ضمان isGeneral للأسئلة العامة (الصعبة)
        generalQuestions.forEach(q => { if (q && q.isGeneral === undefined) { q.isGeneral = true; } });
    }


    let chosenQ = null;
    let finalAskedKey = askedKey;
    let finalQTitle = qTitle;
    let finalIsGeneral = isGeneralByDefault; // نستخدم هذا لتحديد ما إذا كان السؤال المختار *فعليًا* عامًا

    // 1. محاولة أولى من targetPool المحدد بواسطة الـ switch
    let availableQs = targetPool.filter(q =>
        q?.id &&
        q.difficulty === difficulty &&
        // الشرط لـ isGeneral يعتمد على ما إذا كان targetPool هو للأسئلة العامة أم الخاصة بالمعلم
        (isGeneralByDefault ? q.isGeneral === true : (q.landmark === landmarkFilter && !q.isGeneral)) &&
        !gameState.askedQuestions[finalAskedKey]?.has(q.id)
    );

    if (availableQs.length > 0) {
        chosenQ = availableQs[Math.floor(Math.random() * availableQs.length)];
        console.log(`Chosen Q from initial target pool (${finalAskedKey}):`, chosenQ?.id);
    }

    // 2. إذا كان السؤال متوسطًا ولم نجد سؤالًا خاصًا بالمحطة، نحاول من الأسئلة العامة المتوسطة
    if (!chosenQ && team.currentQuestionIndexInStation === 1 && difficulty === 'medium') {
        console.log(`No specific medium question for ${stationName}. Trying general medium questions.`);
        finalAskedKey = "kuwait_general_medium"; // مفتاح تتبع الأسئلة العامة المتوسطة
        if (!gameState.askedQuestions[finalAskedKey]) gameState.askedQuestions[finalAskedKey] = new Set();

        const generalMediumPool = (generalMediumQuestions || []).filter(q =>
            q?.id &&
            q.difficulty === 'medium' &&
            q.isGeneral === true && // الأسئلة في generalMediumQuestions يجب أن تكون isGeneral=true
            !gameState.askedQuestions[finalAskedKey]?.has(q.id)
        );

        if (generalMediumPool.length > 0) {
            chosenQ = generalMediumPool[Math.floor(Math.random() * generalMediumPool.length)];
            finalQTitle = "سؤال عام (متوسط)";
            finalIsGeneral = true; // السؤال المختار الآن هو عام
            console.log("Selected a general medium question:", chosenQ.id);
        } else {
            console.log("No unasked general medium questions found. Trying to reuse general medium.");
            const fallbackGeneralMediumPool = (generalMediumQuestions || []).filter(q =>
                q?.id && q.difficulty === 'medium' && q.isGeneral === true
            );
            if (fallbackGeneralMediumPool.length > 0) {
                chosenQ = fallbackGeneralMediumPool[Math.floor(Math.random() * fallbackGeneralMediumPool.length)];
                finalQTitle = "سؤال عام (متوسط) - مكرر";
                finalIsGeneral = true;
                console.warn(`Reusing a general medium question.`);
            }
        }
    }

    // 3. Fallback النهائي: إذا لم يتم اختيار أي سؤال بعد، حاول إعادة استخدام سؤال من *المجموعة الأصلية* لهذا الدور
    if (!chosenQ) {
        // استخدم قيم askedKey, difficulty, isGeneralByDefault الأصلية التي حددها الـ switch
        console.warn(`No unasked questions from primary/secondary sources. Trying to reuse from original target pool for this turn: ${askedKey}, difficulty ${difficulty}.`);

        const originalTargetPoolForFallback = (askedKey === "kuwait_general") ? generalQuestions : // للأسئلة الصعبة
                                              (askedKey === stationName && difficulty === 'medium' && !isGeneralByDefault) ? (questionsByLandmark[stationName] || []) : // لأسئلة المحطة المتوسطة
                                              (askedKey === stationName && difficulty === 'easy' && !isGeneralByDefault) ? (questionsByLandmark[stationName] || []) : // لأسئلة المحطة السهلة
                                              [];

        const fallbackQs = (originalTargetPoolForFallback).filter(q =>
            q?.id &&
            q.difficulty === difficulty &&
            (isGeneralByDefault ? q.isGeneral === true : (q.landmark === landmarkFilter && !q.isGeneral))
        );

        if (fallbackQs.length > 0) {
            chosenQ = fallbackQs[Math.floor(Math.random() * fallbackQs.length)];
            // القيم النهائية يجب أن تعكس المصدر الأصلي لهذا الـ fallback
            finalAskedKey = askedKey;
            finalQTitle = qTitle + " (مكرر)";
            finalIsGeneral = isGeneralByDefault;
            console.warn(`Reusing a question from original pool (${finalAskedKey}). ID: ${chosenQ?.id}`);
        }
    }

    // 4. عرض السؤال أو رسالة الخطأ
    if (chosenQ?.id && chosenQ.text && chosenQ.type === 'mcq' && Array.isArray(chosenQ.options) && chosenQ.correctAnswer !== undefined) {
        // تأكد من تهيئة Set إذا كان finalAskedKey جديدًا (مثل اسم محطة لم يُستخدم من قبل)
        if (!gameState.askedQuestions[finalAskedKey]) {
            gameState.askedQuestions[finalAskedKey] = new Set();
        }
        gameState.askedQuestions[finalAskedKey].add(chosenQ.id);
        // تأكد أن chosenQ لديه خاصية isGeneral صحيحة قبل إرسالها إلى displayQuestion
        // إذا كان السؤال من generalMediumQuestions أو generalQuestions، يجب أن تكون isGeneral=true
        // إذا كان من questionsByLandmark، يجب أن تكون isGeneral=false
        // finalIsGeneral يجب أن يعكس هذا.
        chosenQ.isGeneral = finalIsGeneral;
        gameState.currentQuestion = chosenQ;
        displayQuestion(gameState.currentQuestion, finalQTitle);
    } else {
        let errSourceMessage;
        // تحديد المصدر بناءً على دور السؤال والصعوبة
        if (team.currentQuestionIndexInStation === 0) { // سهل
            errSourceMessage = `أسئلة معلم '${landmarkFilter}' (${getDifficultyText(difficulty)})`;
        } else if (team.currentQuestionIndexInStation === 1) { // متوسط
            errSourceMessage = `أسئلة معلم '${stationName}' (متوسطة) أو من الأسئلة العامة (المتوسطة)`;
        } else if (team.currentQuestionIndexInStation === 2) { // صعب
            errSourceMessage = `الأسئلة العامة (${getDifficultyText(difficulty)})`;
        } else {
            errSourceMessage = "مصدر غير محدد";
        }
        console.error('CRITICAL: No question chosen. Final state before alert:', { chosenQ, difficulty, finalIsGeneral, finalAskedKey, askedQuestionsCount: gameState.askedQuestions[finalAskedKey]?.size });
        alert(`خطأ فادح: لا توجد أسئلة (${getDifficultyText(difficulty)}) في ${errSourceMessage}. سيتم تخطي هذا السؤال.`);
        stopQuestionTimer(); team.currentQuestionIndexInStation++; updateDashboard(); setTimeout(startTurn, 50); return;
    }
    updateDashboard();
}

// --- ربط الأحداث (تبقى كما هي) ---
if(gameSetupForm) { /* ... */ }
if(playAgainBtn) { /* ... */ }
if(revealAnswerBtn) { /* ... */ }
// ... إلخ

if (incScoreTeam1Btn) incScoreTeam1Btn.addEventListener('click', () => adjustScore('team1', 100));
if (decScoreTeam1Btn) decScoreTeam1Btn.addEventListener('click', () => adjustScore('team1', -100));
if (incScoreTeam2Btn) incScoreTeam2Btn.addEventListener('click', () => adjustScore('team2', 100));
if (decScoreTeam2Btn) decScoreTeam2Btn.addEventListener('click', () => adjustScore('team2', -100));

console.log("game.js loaded and updated. Game data will be fetched from API upon game initialization.");
/* --- END OF FILE assets/js/game.js --- */
