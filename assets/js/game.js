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
let generalQuestions = [];         // للأسئلة العامة (الصعبة)
let generalMediumQuestions = []; // للأسئلة العامة المتوسطة
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
        generalQuestions = apiData.generalQs || [];
        generalMediumQuestions = apiData.generalMediumQs || [];
        questionsByLandmark = apiData.landmarkQs || {};

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
                "kuwait_general": new Set(),
                "kuwait_general_medium": new Set()
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
    if (playAgainBtn) { playAgainBtn.disabled = false; playAgainBtn.style.opacity = "1"; playAgainBtn.style.cursor = "pointer"; }
    const noBalanceMessage = document.getElementById('no-balance-message');
    if (noBalanceMessage) { noBalanceMessage.remove(); }
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
    const wasViewingPrevious = gameState.isViewingPrevious;
    if (!wasViewingPrevious) { stopQuestionTimer(); }
    if (!question?.id || !question.text || !question.type) { console.error("Invalid question object:", question); if(questionTitle) questionTitle.textContent = "خطأ"; if(questionText) questionText.textContent="بيانات السؤال غير صالحة."; if(answerOptionsWrapper) answerOptionsWrapper.classList.add('hidden'); if(answerRevealSection) answerRevealSection.classList.add('hidden'); if(previousCorrectAnswerDisplay) previousCorrectAnswerDisplay.classList.add('hidden'); if(revealAnswerBtn) revealAnswerBtn.disabled = true; if(questionImageContainer) questionImageContainer.classList.add('hidden'); return; }
    gameState.isViewingPrevious = false;
    if(answerOptionsWrapper) answerOptionsWrapper.classList.remove('hidden'); if(answerRevealSection) answerRevealSection.classList.add('hidden'); if(previousCorrectAnswerDisplay) previousCorrectAnswerDisplay.classList.add('hidden'); if(feedbackMessage) { feedbackMessage.textContent = ''; feedbackMessage.className = ''; }
    const isCurrentTimerExpired = timerDisplayElement && timerDisplayElement.textContent === "0:00";
    if (revealAnswerBtn) { revealAnswerBtn.classList.remove('hidden'); revealAnswerBtn.disabled = false; }
    if(answerOptionsContainer) answerOptionsContainer.innerHTML = ''; if(returnToCurrentBtn) returnToCurrentBtn.classList.add('hidden'); if(viewPreviousBtn && gameState.previousQuestion) viewPreviousBtn.classList.remove('hidden'); else if (viewPreviousBtn) viewPreviousBtn.classList.add('hidden');
    const currentTeam = gameState[gameState.currentTurn];
    const stationName = currentTeam?.path[currentTeam?.currentStationIndex]?.name || '?';
    const title = sourceTitle || (question.isGeneral ? (question.difficulty === 'medium' ? "سؤال عام (متوسط)" : "سؤال عام (صعب)") : `سؤال المحطة: ${stationName}`);
    if(questionTitle) questionTitle.textContent = title; if(questionDifficulty) { questionDifficulty.textContent = getDifficultyText(question.difficulty); questionDifficulty.className = question.difficulty||'medium'; } if(questionPoints) questionPoints.textContent = question.points||0;
    if (question.image_firebase_url && questionImageContainer && questionImage) { const imageUrl = question.image_firebase_url; questionImage.src = imageUrl; questionImage.alt = `صورة للسؤال عن ${question.landmark || 'الكويت'}`; questionImageContainer.classList.remove('hidden'); questionImage.onerror = () => { console.error(`Failed to load image: ${imageUrl}`); questionImage.alt = 'فشل تحميل الصورة'; questionImageContainer.classList.add('hidden'); };
    } else { if (questionImageContainer) questionImageContainer.classList.add('hidden'); if (questionImage) { questionImage.src = '#'; questionImage.alt = 'صورة السؤال'; questionImage.onerror = null; } }
    if(questionText) questionText.textContent = question.text;
    if (question.type === 'mcq' && Array.isArray(question.options) && question.options.length > 0) { const options = shuffleArray([...question.options]); options.forEach(opt => { const btn = document.createElement('button'); btn.textContent = typeof opt === 'string' ? opt : JSON.stringify(opt); btn.classList.add('option-btn'); btn.disabled = isCurrentTimerExpired; if(answerOptionsContainer) answerOptionsContainer.appendChild(btn); });
    } else { console.error("Invalid options for MCQ:", question); if(questionText) questionText.textContent += " (خطأ خيارات)"; if(revealAnswerBtn) revealAnswerBtn.disabled = true; }
    if (!wasViewingPrevious && !isCurrentTimerExpired) startQuestionTimer(QUESTION_TIME_LIMIT); else if (isCurrentTimerExpired) { if(timerDisplayElement) { timerDisplayElement.textContent = "0:00"; timerDisplayElement.style.backgroundColor = 'var(--danger-color)'; } if(answerOptionsContainer) answerOptionsContainer.querySelectorAll('.option-btn').forEach(btn => btn.disabled = true);
    } else { if (!isCurrentTimerExpired && answerOptionsContainer) answerOptionsContainer.querySelectorAll('.option-btn').forEach(btn => btn.disabled = false); }
}

function revealAnswer() {
    if (gameState.isGameOver || !gameState.currentQuestion || gameState.currentQuestion.correctAnswer === undefined || gameState.isViewingPrevious) return;
    const question = gameState.currentQuestion;
    gameState.previousQuestion = JSON.parse(JSON.stringify(question));
    if (answerOptionsContainer) answerOptionsContainer.querySelectorAll('.option-btn').forEach(btn => btn.disabled = true);
    if (revealAnswerBtn) revealAnswerBtn.disabled = true;
    if(answerOptionsWrapper) answerOptionsWrapper.classList.add('hidden');
    if(answerRevealSection) answerRevealSection.classList.remove('hidden');
    if(previousCorrectAnswerDisplay) previousCorrectAnswerDisplay.classList.add('hidden');
    if (questionImageContainer) questionImageContainer.classList.add('hidden');
    if(correctAnswerText) correctAnswerText.textContent = question.correctAnswer;
    if(assignPointsTeam1Btn) assignPointsTeam1Btn.textContent = gameState.team1.name || 'الفريق 1';
    if(assignPointsTeam2Btn) assignPointsTeam2Btn.textContent = gameState.team2.name || 'الفريق 2';
    if (viewPreviousBtn && gameState.previousQuestion) viewPreviousBtn.classList.remove('hidden');
}

function assignPoints(assignedTo) {
    stopQuestionTimer();
    if (gameState.isGameOver || !gameState.currentQuestion) return;
    const question = gameState.currentQuestion; const points = question.points || 0;
    const currentTeamId = gameState.currentTurn; const team = gameState[currentTeamId];
    if (!team) { console.error("Assign points error: Team undefined"); return; }
    if(answerRevealSection) answerRevealSection.classList.add('hidden');
    if(feedbackMessage) feedbackMessage.textContent = '';
    let txt = ""; let cls = "";
    if (assignedTo === 'team1') { gameState.team1.score += points; txt = `+${points} لـ ${gameState.team1.name}!`; cls = 'points-assigned'; }
    else if (assignedTo === 'team2') { gameState.team2.score += points; txt = `+${points} لـ ${gameState.team2.name}!`; cls = 'points-assigned'; }
    else { txt = "لم يحصل أحد على نقاط."; cls = 'no-points'; }
    if(feedbackMessage) { feedbackMessage.textContent = txt; feedbackMessage.className = cls; }
    team.currentQuestionIndexInStation++;
    updateDashboard();
    setTimeout(() => {
        if(feedbackMessage) { feedbackMessage.textContent = ''; feedbackMessage.className = ''; }
        if (checkGameOver()) { displayResults(); }
        else {
            let shouldSwitch = false; const otherId = currentTeamId==='team1'?'team2':'team1';
            if (gameState[otherId]) { const otherFin = gameState[otherId].currentStationIndex >= STATIONS_PER_TEAM; if (!otherFin) { shouldSwitch = true; } else if (team.currentStationIndex < STATIONS_PER_TEAM) { shouldSwitch = false; } else { shouldSwitch = false; } } else { shouldSwitch = true; }
            if (shouldSwitch) { switchTurn(); }
            if (!gameState.isViewingPrevious) startTurn();
        }
    }, POINT_ASSIGNMENT_DELAY);
}

function displayPreviousQuestion() {
    if (!gameState.previousQuestion) { return; }
    gameState.isViewingPrevious = true;
    if(answerOptionsWrapper) answerOptionsWrapper.classList.add('hidden');
    if(answerRevealSection) answerRevealSection.classList.add('hidden');
    if (questionImageContainer) questionImageContainer.classList.add('hidden');
    if(previousCorrectAnswerDisplay) previousCorrectAnswerDisplay.classList.remove('hidden');
    if(viewPreviousBtn) viewPreviousBtn.classList.add('hidden');
    if(returnToCurrentBtn) returnToCurrentBtn.classList.remove('hidden');
    if(feedbackMessage) { feedbackMessage.textContent=''; feedbackMessage.className=''; }
    const prevQ = gameState.previousQuestion;
    const title = prevQ.isGeneral ? "سؤال عام (السابق)" : `سؤال المحطة: ${prevQ.landmark || '?'} (السابق)`;
    if(questionTitle) questionTitle.textContent = title;
    if(questionDifficulty) { questionDifficulty.textContent = getDifficultyText(prevQ.difficulty); questionDifficulty.className = prevQ.difficulty||'medium'; }
    if(questionPoints) questionPoints.textContent = prevQ.points||0;
    if(questionText) questionText.textContent = prevQ.text;
    if (previousCorrectAnswerText) previousCorrectAnswerText.textContent = prevQ.correctAnswer ?? "غير متوفرة";

    if (prevQ.image_firebase_url && previousQuestionImage) {
        const imageUrl = prevQ.image_firebase_url;
        previousQuestionImage.src = imageUrl;
        previousQuestionImage.alt = `صورة السؤال السابق عن ${prevQ.landmark || 'الكويت'}`;
        previousQuestionImage.style.display = 'block';
        previousQuestionImage.onerror = () => {
            console.error(`Failed to load previous image: ${imageUrl}`);
            previousQuestionImage.alt = 'فشل تحميل الصورة';
            previousQuestionImage.style.display = 'none';
        };
    } else if (previousQuestionImage) {
        previousQuestionImage.style.display = 'none';
        previousQuestionImage.src = '#';
        previousQuestionImage.onerror = null;
    }
}

function checkGameOver() { if (!gameState?.team1 || !gameState?.team2) return false; const t1Fin = gameState.team1.currentStationIndex >= STATIONS_PER_TEAM; const t2Fin = gameState.team2.currentStationIndex >= STATIONS_PER_TEAM; if (t1Fin && t2Fin && !gameState.isGameOver) { gameState.isGameOver = true; } return gameState.isGameOver; }
function switchTurn() { if (gameState.isGameOver) return; const currentId = gameState.currentTurn; const nextId = (currentId === 'team1') ? 'team2' : 'team1'; if (gameState[nextId] && gameState[nextId].currentStationIndex < STATIONS_PER_TEAM) { gameState.currentTurn = nextId; } else { if (gameState[currentId] && gameState[currentId].currentStationIndex < STATIONS_PER_TEAM) { /* No switch */ } else { checkGameOver(); } } updateDashboard(); }

function displayResults() {
    stopQuestionTimer();
    gameState.isGameOver = true;
    if(questionInteractionArea) questionInteractionArea.classList.add('hidden');
    const gameSidebar = document.getElementById('game-sidebar');
    if(gameSidebar) gameSidebar.classList.add('hidden');
    if(gameOverSection) {
        const t1 = gameState.team1; const t2 = gameState.team2;
        if (!t1 || !t2) { if(finalResultsDisplay) finalResultsDisplay.innerHTML = "<p>خطأ في عرض النتائج.</p>"; return; }
        let html = `<p><strong>${t1.name}:</strong> ${t1.score} نقطة</p><p><strong>${t2.name}:</strong> ${t2.score} نقطة</p><hr>`;
        if (t1.score > t2.score) html += `<p class="winner">الفائز: ${t1.name}!</p>`;
        else if (t2.score > t1.score) html += `<p class="winner">الفائز: ${t2.name}!</p>`;
        else html += `<p class="winner">تعادل!</p>`;
        if(finalResultsDisplay) finalResultsDisplay.innerHTML = html;
        gameOverSection.classList.remove('hidden');
        gameOverSection.classList.add('visible');
    }
}

async function initializeGame() {
    console.log("Attempting to initialize game...");
    const startButton = gameSetupForm ? gameSetupForm.querySelector('.btn-start-game') : null;

    const currentUser = window.firebaseAuth ? window.firebaseAuth.currentUser : null;
    if (!currentUser) {
        alert("خطأ: المستخدم غير مسجل الدخول. لا يمكن بدء اللعبة.");
        if (startButton) startButton.disabled = false;
        return;
    }

    let serverDeductSuccessful = false;
    let newBalanceFromServer;

    try {
        console.log(`[GameJS] Attempting to deduct game via backend for user ${currentUser.uid}`);
        if (!window.RENDER_API_BASE_URL) { throw new Error("RENDER_API_BASE_URL is not defined on window object."); }
        if (!window.firebaseAuth || !window.firebaseAuth.currentUser) { throw new Error("Firebase auth or current user is not available for token generation.");}

        const token = await window.firebaseAuth.currentUser.getIdToken(true);
        const deductResponse = await fetch(`${window.RENDER_API_BASE_URL}/api/user/${currentUser.uid}/deduct-game`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        });
        const deductData = await deductResponse.json();

        if (!deductResponse.ok) {
            alert(deductData.message || "فشل التحقق من رصيد الألعاب في الخادم.");
            console.error("Backend deduction failed:", deductResponse.status, deductData.message);
            if (startButton) startButton.disabled = false;
            return;
        }
        serverDeductSuccessful = true;
        newBalanceFromServer = deductData.newBalance;
        console.log(`[GameJS] Game deduction successful on backend. New balance: ${newBalanceFromServer}`);

        if (window.getUserGamesKey && window.updateRemainingGamesDisplay) {
            localStorage.setItem(window.getUserGamesKey(currentUser.uid), newBalanceFromServer.toString());
            window.updateRemainingGamesDisplay(currentUser.uid);
        } else {
            console.warn("getUserGamesKey or updateRemainingGamesDisplay is not available on window. UI might not update immediately.");
            localStorage.setItem(`rehlaUserGames_${currentUser.uid}`, newBalanceFromServer.toString());
            const remainingGamesCountSpan = document.getElementById('remaining-games-count');
            if (remainingGamesCountSpan) remainingGamesCountSpan.textContent = newBalanceFromServer;
        }
    } catch (error) {
        console.error("Error calling /api/user/.../deduct-game endpoint or processing its response:", error);
        alert(`حدث خطأ أثناء الاتصال بالخادم لخصم اللعبة: ${error.message || 'يرجى المحاولة مرة أخرى.'}`);
        if (startButton) startButton.disabled = false;
        return;
    }

    if (!serverDeductSuccessful) {
        console.error("InitializeGame aborted: Server deduction was not successful.");
        if (startButton) startButton.disabled = false;
        return;
    }

    try {
        if (!isGameDataLoaded) {
            if (startButton) startButton.textContent = 'جاري تحميل بيانات اللعبة...';
            const gameDataFetched = await fetchGameDataFromAPI();
            if (!gameDataFetched) {
                if (startButton) { startButton.textContent = 'بدء الرحلة!'; startButton.disabled = false; }
                if (playAgainBtn) { playAgainBtn.disabled = false; }
                return;
            }
            if (startButton) startButton.textContent = 'بدء الرحلة!';
        }

        if (!allLandmarkNames || allLandmarkNames.length < 2) {
            alert("خطأ: بيانات المعالم غير كافية. لا يمكن بدء اللعبة.");
            if (startButton) startButton.disabled = false;
            return;
        }

        resetGameState(true);

        gameState.team1.name = team1NameInput.value.trim() || "الفريق الأول";
        gameState.team2.name = team2NameInput.value.trim() || "الفريق الثاني";

        const reqStartingPoints = Math.min(2, allLandmarkNames.length);
        if (allLandmarkNames.length < reqStartingPoints) {
            alert(`خطأ: لا يوجد معالم كافية (${allLandmarkNames.length}) لاختيار نقاط بداية مختلفة.`);
            if (startButton) startButton.disabled = false;
            return;
        }
        let available = [...allLandmarkNames];
        const t1Start = team1StartInput.value.trim();
        const t2Start = team2StartInput.value.trim();
        let t1Station = null; let t2Station = null;

        if (t1Start && available.includes(t1Start)) { t1Station = t1Start; available = available.filter(n => n !== t1Station); }
        else if (available.length > 0) { const i = Math.floor(Math.random() * available.length); t1Station = available.splice(i, 1)[0]; }
        else { alert("خطأ حرج: لا يوجد معالم لاختيار نقطة بداية للفريق الأول."); if (startButton) startButton.disabled = false; return;}

        if (t2Start && available.includes(t2Start) && t2Start !== t1Station) { t2Station = t2Start; available = available.filter(n => n !== t2Station); }
        else if (available.length > 0) { const i = Math.floor(Math.random() * available.length); t2Station = available.splice(i, 1)[0]; }
        else { const fallbackPool = allLandmarkNames.filter(n => n !== t1Station); if (fallbackPool.length > 0) { t2Station = fallbackPool[Math.floor(Math.random() * fallbackPool.length)]; } else { t2Station = t1Station;} }

        if (!t1Station || !t2Station) { alert("خطأ في تعيين نقاط البداية."); if (startButton) startButton.disabled = false; return; }

        gameState.team1.path = [{ name: t1Station }];
        gameState.team2.path = [{ name: t2Station }];
        gameState.team1.currentStationIndex = 0; gameState.team2.currentStationIndex = 0;
        gameState.team1.currentQuestionIndexInStation = 0; gameState.team2.currentQuestionIndexInStation = 0;

        if (!gameState.askedQuestions[t1Station]) gameState.askedQuestions[t1Station] = new Set();
        if (!gameState.askedQuestions[t2Station]) gameState.askedQuestions[t2Station] = new Set();

        const remainingStationsNeededPerTeam = STATIONS_PER_TEAM - 1;
        if (remainingStationsNeededPerTeam > 0) {
            let pathPool = shuffleArray([...allLandmarkNames.filter(n => n !== t1Station && n !== t2Station)]);
            const getPathStations = (count, currentPathNames) => {
                const stations = []; let tempPool = [...pathPool];
                for (let i = 0; i < count; i++) {
                    if (tempPool.length > 0) { const station = tempPool.shift(); stations.push({ name: station }); if (!gameState.askedQuestions[station]) gameState.askedQuestions[station] = new Set(); }
                    else { const fallback = allLandmarkNames.find(ln => !currentPathNames.includes(ln) && !stations.some(s => s.name === ln)); if (fallback) { stations.push({ name: fallback }); if (!gameState.askedQuestions[fallback]) gameState.askedQuestions[fallback] = new Set(); } else { console.warn(`Could not find enough unique stations for path.`); break;}}
                } return stations;
            };
            const team1CurrentPathNames = gameState.team1.path.map(s => s.name);
            gameState.team1.path.push(...getPathStations(remainingStationsNeededPerTeam, team1CurrentPathNames));
            const team1AddedStations = gameState.team1.path.slice(1).map(s => s.name);
            pathPool = pathPool.filter(p => !team1AddedStations.includes(p));
            const team2CurrentPathNames = gameState.team2.path.map(s => s.name);
            gameState.team2.path.push(...getPathStations(remainingStationsNeededPerTeam, team2CurrentPathNames));
        }

        if(gameSetupSection) gameSetupSection.classList.add('hidden');
        if(gamePlayArea) gamePlayArea.classList.remove('hidden');
        window.scrollTo(0, 0);
        if(questionInteractionArea) questionInteractionArea.classList.remove('hidden');
        const gameSidebar = document.getElementById('game-sidebar');
        if(gameSidebar) gameSidebar.classList.remove('hidden');
        if(gameOverSection) { gameOverSection.classList.remove('visible'); gameOverSection.classList.add('hidden'); }

        updateDashboard(); startTurn();
        console.log("Game Initialized and started successfully AFTER server deduction.");
    } catch (error) {
        console.error("Critical error during game content initialization (after deduction attempt):", error);
        alert("حدث خطأ غير متوقع أثناء بدء اللعبة. يرجى المحاولة مرة أخرى.");
        if (startButton) { startButton.textContent = 'بدء الرحلة!'; startButton.disabled = false; }
        const noBalanceMessage = document.getElementById('no-balance-message');
        if (noBalanceMessage) noBalanceMessage.classList.add('hidden');
        if (gameSetupSection) gameSetupSection.classList.remove('hidden');
        if (gamePlayArea) gamePlayArea.classList.add('hidden');
    }
}

function startTurn() {
    console.log(`Starting turn for ${gameState.currentTurn}`);
    if (gameState.isGameOver) { if (!gameOverSection?.classList.contains('visible')) { displayResults(); } return; }
    if (gameState.isViewingPrevious) { if (gameState.currentQuestion) displayQuestion(gameState.currentQuestion); else console.error("Cannot return to current question, no currentQuestion stored!"); return; }

    if(answerOptionsWrapper) answerOptionsWrapper.classList.remove('hidden');
    if(answerRevealSection) answerRevealSection.classList.add('hidden');
    if(previousCorrectAnswerDisplay) previousCorrectAnswerDisplay.classList.add('hidden');
    if(feedbackMessage) { feedbackMessage.textContent = ''; feedbackMessage.className = ''; }
    if(revealAnswerBtn) { revealAnswerBtn.classList.remove('hidden'); revealAnswerBtn.disabled = false; }
    if(answerOptionsContainer) answerOptionsContainer.innerHTML = '';
    if(timerDisplayElement) { timerDisplayElement.textContent = formatTime(QUESTION_TIME_LIMIT); timerDisplayElement.style.backgroundColor = 'var(--black-color)'; }
    if (questionImageContainer) questionImageContainer.classList.add('hidden');
    if (questionImage) { questionImage.src = '#'; questionImage.onerror = null; }
    if (previousQuestionImage) { previousQuestionImage.style.display = 'none'; previousQuestionImage.src = '#'; previousQuestionImage.onerror = null;}

    const currentTeamId = gameState.currentTurn; const team = gameState[currentTeamId];
    if (!team) { console.error("Error: Current team undefined!"); return; }

    if (team.currentStationIndex >= STATIONS_PER_TEAM) {
        stopQuestionTimer(); const otherId = currentTeamId === 'team1' ? 'team2' : 'team1';
        if (gameState[otherId] && gameState[otherId].currentStationIndex >= STATIONS_PER_TEAM) { if (checkGameOver()) displayResults(); }
        else { switchTurn(); if (checkGameOver()) displayResults(); else if(gameState.currentTurn !== currentTeamId) startTurn(); }
        return;
    }

    const stationObj = team.path[team.currentStationIndex];
    if (!stationObj?.name) { alert(`خطأ في بيانات المحطة رقم ${team.currentStationIndex + 1}. سيتم تخطي هذه المحطة.`); stopQuestionTimer(); team.currentStationIndex++; team.currentQuestionIndexInStation = 0; updateDashboard(); setTimeout(startTurn, 100); return; }
    const stationName = stationObj.name;

    if (team.currentQuestionIndexInStation >= QUESTIONS_PER_STATION) {
        team.currentStationIndex++; team.currentQuestionIndexInStation = 0; updateDashboard();
        if (checkGameOver()) { stopQuestionTimer(); displayResults(); } else { setTimeout(startTurn, 50); }
        return;
    }

    let targetPool, difficulty, landmarkFilter, askedKey, qTitle, isGeneralByDefault;

    switch (team.currentQuestionIndexInStation) {
        case 0: // السؤال الأول: سهل، خاص بالمحطة
            difficulty = 'easy';
            landmarkFilter = stationName;
            askedKey = stationName;
            targetPool = questionsByLandmark[stationName];
            isGeneralByDefault = false;
            qTitle = `سؤال المحطة: ${stationName}`;
            break;
        case 1: // السؤال الثاني: متوسط، الأفضلية للعام المتوسط ثم خاص بالمحطة
            difficulty = 'medium';
            // القيم الأولية سيتم تحديدها أدناه
            landmarkFilter = stationName; // سنحتاجه إذا لجأنا لأسئلة المحطة
            break;
        case 2: // السؤال الثالث: صعب، عام
            difficulty = 'hard';
            landmarkFilter = null;
            askedKey = "kuwait_general";
            targetPool = generalQuestions;
            isGeneralByDefault = true;
            qTitle = "سؤال عام (صعب)";
            console.log('[DEBUG] Hard Q Turn: targetPool (generalQuestions) length:', targetPool?.length);
            console.log('[DEBUG] Hard Q Turn: asked "kuwait_general" count:', gameState.askedQuestions["kuwait_general"]?.size);
            break;
        default:
            console.error("Invalid currentQuestionIndexInStation:", team.currentQuestionIndexInStation);
            team.currentQuestionIndexInStation = 0; setTimeout(startTurn, 50); return;
    }

    let chosenQ = null;
    let finalAskedKey = askedKey;
    let finalQTitle = qTitle;
    let finalIsGeneral = isGeneralByDefault;


    if (team.currentQuestionIndexInStation === 1 && difficulty === 'medium') {
        console.log(`Medium question turn. PRIORITY: Attempting general medium questions first.`);
        finalAskedKey = "kuwait_general_medium";
        finalIsGeneral = true;
        finalQTitle = "سؤال عام (متوسط)";
        if (!gameState.askedQuestions[finalAskedKey]) gameState.askedQuestions[finalAskedKey] = new Set();

        const generalMediumPool = (generalMediumQuestions || []).filter(q =>
            q?.id &&
            q.difficulty === 'medium' && // فلتر الصعوبة هنا مهم
            q.isGeneral === true &&
            !gameState.askedQuestions[finalAskedKey]?.has(q.id)
        );

        if (generalMediumPool.length > 0) {
            chosenQ = generalMediumPool[Math.floor(Math.random() * generalMediumPool.length)];
            console.log("Selected a general medium question (Priority):", chosenQ?.id);
        } else {
            console.log("No unasked general medium questions. Now trying specific station medium questions for:", stationName);
            finalAskedKey = stationName;
            finalIsGeneral = false;
            finalQTitle = `سؤال المحطة: ${stationName}`;
            targetPool = questionsByLandmark[stationName] || [];
            if (!gameState.askedQuestions[finalAskedKey]) gameState.askedQuestions[finalAskedKey] = new Set();

            const stationMediumPool = targetPool.filter(q =>
                q?.id &&
                q.difficulty === 'medium' && // فلتر الصعوبة هنا مهم
                !q.isGeneral &&
                q.landmark === stationName &&
                !gameState.askedQuestions[finalAskedKey]?.has(q.id)
            );
            if (stationMediumPool.length > 0) {
                chosenQ = stationMediumPool[Math.floor(Math.random() * stationMediumPool.length)];
                console.log("Selected a specific station medium question (Fallback):", chosenQ?.id);
            } else {
                console.log(`No unasked specific station medium questions for ${stationName}. Fallback to reuse will occur next.`);
            }
        }
    } else { // للأسئلة السهلة (case 0) والصعبة (case 2)
        targetPool = targetPool || []; // ضمان أن targetPool ليس undefined
        if (!Array.isArray(targetPool)) { console.warn(`Target pool for ${askedKey} is not an array. Defaulting to empty.`); targetPool = []; }
        if (!gameState.askedQuestions[finalAskedKey]) gameState.askedQuestions[finalAskedKey] = new Set();


        // ضمان أن خاصية isGeneral موجودة في الأسئلة ومضبوطة
        targetPool.forEach(q => { if (q && q.isGeneral === undefined) { q.isGeneral = finalIsGeneral; } });

        const availableQsFromInitialPool = targetPool.filter(q =>
            q?.id &&
            q.difficulty === difficulty &&
            (finalIsGeneral ? q.isGeneral === true : (q.landmark === landmarkFilter && !q.isGeneral)) &&
            !gameState.askedQuestions[finalAskedKey]?.has(q.id)
        );
        if (availableQsFromInitialPool.length > 0) {
            chosenQ = availableQsFromInitialPool[Math.floor(Math.random() * availableQsFromInitialPool.length)];
            console.log(`Chosen Q from initial target pool (${finalAskedKey}) for easy/hard:`, chosenQ?.id);
        }
    }

    if (!chosenQ) {
        let fallbackPool;
        let tempAskedKey = finalAskedKey; // نبدأ بالمفتاح الأخير الذي كنا نحاوله
        let tempQTitle = finalQTitle;
        let tempIsGeneral = finalIsGeneral;

        console.warn(`No unasked questions from primary sources. Initiating fallback for difficulty: ${difficulty}. Current finalAskedKey: ${finalAskedKey}`);

        if (team.currentQuestionIndexInStation === 1 && difficulty === 'medium') {
            // إذا فشلت محاولة الأسئلة العامة المتوسطة ثم أسئلة المحطة المتوسطة، حاول إعادة استخدام أي منهما
            // 1. إعادة استخدام عام متوسط
            fallbackPool = generalMediumQuestions || [];
            tempAskedKey = "kuwait_general_medium";
            tempQTitle = "سؤال عام (متوسط) - مكرر";
            tempIsGeneral = true;
            console.log(`Fallback: Attempting to reuse general medium. Pool size: ${fallbackPool.length}`);
            let reusableQs = fallbackPool.filter(q => q?.id && q.difficulty === 'medium' && q.isGeneral === true);
            if (reusableQs.length > 0) {
                chosenQ = reusableQs[Math.floor(Math.random() * reusableQs.length)];
            }
            // 2. إذا فشل، إعادة استخدام خاص بالمحطة متوسط
            if (!chosenQ) {
                fallbackPool = questionsByLandmark[stationName] || [];
                tempAskedKey = stationName;
                tempQTitle = `سؤال المحطة: ${stationName} (متوسط - مكرر)`;
                tempIsGeneral = false; // لأنه خاص بالمحطة
                console.log(`Fallback: Attempting to reuse specific station medium for ${stationName}. Pool size: ${fallbackPool.length}`);
                reusableQs = fallbackPool.filter(q => q?.id && q.difficulty === 'medium' && !q.isGeneral && q.landmark === stationName);
                if (reusableQs.length > 0) {
                    chosenQ = reusableQs[Math.floor(Math.random() * reusableQs.length)];
                }
            }
        } else if (team.currentQuestionIndexInStation === 2 && difficulty === 'hard') {
            fallbackPool = generalQuestions || [];
            tempAskedKey = "kuwait_general";
            tempQTitle = "سؤال عام (صعب) - مكرر";
            tempIsGeneral = true;
            console.log(`Fallback: Reusing general hard. Pool size: ${fallbackPool.length}`);
            const reusableQs = fallbackPool.filter(q => q?.id && q.difficulty === 'hard' && q.isGeneral === true);
            if (reusableQs.length > 0) {
                chosenQ = reusableQs[Math.floor(Math.random() * reusableQs.length)];
            }
        } else { // للسؤال السهل
            fallbackPool = questionsByLandmark[stationName] || [];
            tempAskedKey = stationName;
            tempQTitle = `سؤال المحطة: ${stationName} (سهل - مكرر)`;
            tempIsGeneral = false;
            console.log(`Fallback: Reusing specific station easy for ${stationName}. Pool size: ${fallbackPool.length}`);
            const reusableQs = fallbackPool.filter(q => q?.id && q.difficulty === 'easy' && !q.isGeneral && q.landmark === stationName);
            if (reusableQs.length > 0) {
                chosenQ = reusableQs[Math.floor(Math.random() * reusableQs.length)];
            }
        }

        if (chosenQ) {
            finalAskedKey = tempAskedKey; // استخدم المفتاح الذي تم منه إعادة الاستخدام
            finalQTitle = tempQTitle;     // استخدم العنوان الذي يشير للتكرار
            finalIsGeneral = tempIsGeneral;
            console.warn(`Reusing a question (${finalAskedKey}). ID: ${chosenQ?.id}`);
        }
    }


    if (chosenQ?.id && chosenQ.text && chosenQ.type === 'mcq' && Array.isArray(chosenQ.options) && chosenQ.correctAnswer !== undefined) {
        if (!gameState.askedQuestions[finalAskedKey]) {
            gameState.askedQuestions[finalAskedKey] = new Set();
        }
        // لا تقم بإضافة السؤال إلى askedQuestions إذا كان مكررًا من fallback
        // إلا إذا كنت تريد تتبع عدد مرات تكراره، ولكن هذا سيعقد الأمور.
        // السلوك الحالي هو أنه سيتم طرحه مرة أخرى إذا لم يتم العثور على شيء آخر.
        // إذا أردت منع التكرار *حتى في الـ fallback*، يجب إزالة هذا السطر إذا كان السؤال من fallback
        // ولكن هذا قد يؤدي إلى عدم وجود سؤال على الإطلاق إذا استنفدت كل الأسئلة الفريدة.
        // حاليًا، سنسمح بتسجيله حتى لو كان مكررًا من fallback، مما يعني أن اللعبة لن تتوقف.
        gameState.askedQuestions[finalAskedKey].add(chosenQ.id);

        chosenQ.isGeneral = finalIsGeneral;
        gameState.currentQuestion = chosenQ;
        displayQuestion(gameState.currentQuestion, finalQTitle);
    } else {
        let errSourceMessage;
        if (team.currentQuestionIndexInStation === 0) { errSourceMessage = `أسئلة معلم '${landmarkFilter}' (${getDifficultyText(difficulty)})`; }
        else if (team.currentQuestionIndexInStation === 1) { errSourceMessage = `أسئلة معلم '${stationName}' (متوسطة) أو من الأسئلة العامة (المتوسطة)`; }
        else if (team.currentQuestionIndexInStation === 2) { errSourceMessage = `الأسئلة العامة (${getDifficultyText(difficulty)})`; }
        else { errSourceMessage = "مصدر غير محدد"; }
        console.error('CRITICAL: No question chosen. Final state before alert:', { chosenQ, difficulty, finalIsGeneral, finalAskedKey, targetPoolLength: targetPool?.length, askedQuestionsCount: gameState.askedQuestions[finalAskedKey]?.size });
        alert(`خطأ فادح: لا توجد أسئلة (${getDifficultyText(difficulty)}) في ${errSourceMessage}. سيتم تخطي هذا السؤال.`);
        stopQuestionTimer(); team.currentQuestionIndexInStation++; updateDashboard(); setTimeout(startTurn, 50); return;
    }
    updateDashboard();
}

// --- ربط الأحداث ---
if(gameSetupForm) {
    gameSetupForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const startButton = gameSetupForm.querySelector('.btn-start-game');
        if (startButton) startButton.disabled = true;
        await initializeGame();
        if (startButton) startButton.disabled = false;
    });
}

if(playAgainBtn) {
    playAgainBtn.addEventListener('click', () => {
        console.log("Play Again clicked. Returning to game setup.");
        stopQuestionTimer(); resetGameState(true);
        if(gameSetupSection) gameSetupSection.classList.remove('hidden');
        if(gamePlayArea) gamePlayArea.classList.add('hidden');
        if(gameOverSection) { gameOverSection.classList.remove('visible'); gameOverSection.classList.add('hidden'); }
        if(team1NameInput) team1NameInput.value = ''; if(team1StartInput) team1StartInput.value = '';
        if(team2NameInput) team2NameInput.value = ''; if(team2StartInput) team2StartInput.value = '';
        const startButton = gameSetupForm.querySelector('.btn-start-game');
        if (startButton) startButton.disabled = false;
    });
}

if(revealAnswerBtn) revealAnswerBtn.addEventListener('click', revealAnswer);
if(assignPointsTeam1Btn) assignPointsTeam1Btn.addEventListener('click', () => assignPoints('team1'));
if(assignPointsTeam2Btn) assignPointsTeam2Btn.addEventListener('click', () => assignPoints('team2'));
if(assignPointsNoneBtn) assignPointsNoneBtn.addEventListener('click', () => assignPoints('none'));

if(viewPreviousBtn) {
    viewPreviousBtn.addEventListener('click', () => {
        if (!gameState.isViewingPrevious && gameState.previousQuestion) displayPreviousQuestion();
        else if (!gameState.previousQuestion) console.warn("View Previous: No previous question.");
    });
}
if(returnToCurrentBtn) {
    returnToCurrentBtn.addEventListener('click', () => {
        if (gameState.isViewingPrevious && gameState.currentQuestion) displayQuestion(gameState.currentQuestion);
        else if (!gameState.currentQuestion) console.warn("Return to Current: No current question.");
    });
}

function adjustScore(teamId, amount) {
    if (gameState && gameState[teamId] && typeof gameState[teamId].score === 'number') {
        gameState[teamId].score += amount;
        gameState[teamId].score = Math.max(0, gameState[teamId].score);
        updateDashboard();
        if (checkGameOver() && !gameOverSection?.classList.contains('visible')) displayResults();
    } else { console.warn(`Cannot adjust score for ${teamId}.`); }
}

if (incScoreTeam1Btn) incScoreTeam1Btn.addEventListener('click', () => adjustScore('team1', 100));
if (decScoreTeam1Btn) decScoreTeam1Btn.addEventListener('click', () => adjustScore('team1', -100));
if (incScoreTeam2Btn) incScoreTeam2Btn.addEventListener('click', () => adjustScore('team2', 100));
if (decScoreTeam2Btn) decScoreTeam2Btn.addEventListener('click', () => adjustScore('team2', -100));

console.log("game.js loaded and updated. Game data will be fetched from API upon game initialization.");
/* --- END OF FILE assets/js/game.js --- */
