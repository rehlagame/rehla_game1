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
const backendBaseUrl = 'http://localhost:3001';

// --- حالة اللعبة (Game State) ---
let gameState = {};
let allLandmarkNames = [];
let generalQuestions = [];
let questionsByLandmark = {};
let questionTimerInterval = null;

// --- معالجة بيانات الأسئلة ---
function processGameData() {
    console.log("Processing game data...");
    allLandmarkNames = []; generalQuestions = []; questionsByLandmark = {};
    if (typeof gameQuestions !== 'undefined' && Array.isArray(gameQuestions)) {
        const landmarkNameSet = new Set();
        gameQuestions.forEach(q => {
            if (q && q.id) {
                if (q.isGeneral === undefined && !q.landmark) { q.isGeneral = true; }
                else if (q.isGeneral === undefined && q.landmark) { q.isGeneral = false; }
                if (q.isGeneral && q.difficulty === 'hard') { generalQuestions.push(q); }
                if (q.landmark && !q.isGeneral) { landmarkNameSet.add(q.landmark); if (!questionsByLandmark[q.landmark]) { questionsByLandmark[q.landmark] = []; } questionsByLandmark[q.landmark].push(q); }
            } else if (q) { console.warn("Q missing 'id':", q); }
        });
        allLandmarkNames = Array.from(landmarkNameSet);
        console.log(`Processed: ${allLandmarkNames.length} landmarks, ${generalQuestions.length} general Qs.`);
        if (allLandmarkNames.length < 2) { console.error("CRITICAL: Not enough landmarks (< 2)."); }
    } else {
        console.error("CRITICAL: gameQuestions array missing/invalid!");
        if(gameSetupForm) gameSetupForm.style.display = 'none';
        const errDiv = document.createElement('div'); errDiv.innerHTML = `<h2 style="color:red;">خطأ فادح!</h2><p>فشل تحميل بيانات اللعبة.</p>`; errDiv.style.cssText='color:red;padding:1em;border:1px solid red;'; if(gameSetupSection && !gameSetupSection.querySelector('.error-msg')) { errDiv.classList.add('error-msg'); gameSetupSection.appendChild(errDiv); }
    }
}
try { processGameData(); } catch (error) { console.error("Error processing data:", error); }

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
        gameState = { team1: { name:'', score:0, path:[], currentStationIndex:0, currentQuestionIndexInStation:0 }, team2: { name:'', score:0, path:[], currentStationIndex:0, currentQuestionIndexInStation:0 }, currentTurn:'team1', currentQuestion:null, isGameOver:false, answeredQuestionsCount:0, askedQuestions:{"kuwait_general":new Set()}, previousQuestion:null, isViewingPrevious:false };
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
    console.log("Game state reset performed. Full reset:", isFullReset);
}


function getRandomUniqueItems(arr, num) { if (!Array.isArray(arr)) { return []; } const n=Math.min(num, arr.length); if(n===0) return []; const sh=[...arr].sort(()=>0.5-Math.random()); return sh.slice(0,n); }
function shuffleArray(arr) { if (!Array.isArray(arr)) { return []; } for (let i=arr.length-1; i>0; i--) { const j=Math.floor(Math.random()*(i+1)); [arr[i], arr[j]]=[arr[j], arr[i]]; } return arr; }
function getDifficultyText(d) { switch(d){case 'easy':return 'سهل'; case 'medium':return 'متوسط'; case 'hard':return 'صعب'; default: return d||'متوسط';} }
function displayTeamPath(team, listEl) { if (!team||!listEl||!Array.isArray(team.path)) { if(listEl) listEl.innerHTML='<li>خطأ</li>'; return; } listEl.innerHTML=''; team.path.forEach((st, idx) => { if (!st||!st.name) { const li=document.createElement('li'); li.textContent=`محطة ${idx+1}(خطأ)`; li.style.color='red'; listEl.appendChild(li); return; } const li=document.createElement('li'); li.textContent=st.name; li.title=st.name; if (idx < team.currentStationIndex) li.classList.add('completed-path-station'); else if (idx===team.currentStationIndex && team.currentStationIndex < STATIONS_PER_TEAM) li.classList.add('current-path-station'); listEl.appendChild(li); }); }
function updateDashboard() { try { if(!gameState?.team1||!gameState?.team2) return; if(team1DisplayName) team1DisplayName.textContent=gameState.team1.name||''; if(team1ScoreDisplay) team1ScoreDisplay.textContent=gameState.team1.score??0; if(team1PathList) displayTeamPath(gameState.team1, team1PathList); if(team1CurrentStationName) team1CurrentStationName.textContent=gameState.team1.path[gameState.team1.currentStationIndex]?.name||(gameState.team1.currentStationIndex>=STATIONS_PER_TEAM?"أنهى":"-"); if(team1InfoCard) team1InfoCard.classList.toggle('active-team', gameState.currentTurn==='team1'); if(team2DisplayName) team2DisplayName.textContent=gameState.team2.name||''; if(team2ScoreDisplay) team2ScoreDisplay.textContent=gameState.team2.score??0; if(team2PathList) displayTeamPath(gameState.team2, team2PathList); if(team2CurrentStationName) team2CurrentStationName.textContent=gameState.team2.path[gameState.team2.currentStationIndex]?.name||(gameState.team2.currentStationIndex>=STATIONS_PER_TEAM?"أنهى":"-"); if(team2InfoCard) team2InfoCard.classList.toggle('active-team', gameState.currentTurn==='team2'); if(currentTeamTurnDisplay) currentTeamTurnDisplay.textContent=gameState[gameState.currentTurn]?.name||'?'; } catch(e){console.error("Dashboard Err:",e);} }

function displayQuestion(question, sourceTitle = null) {
    const wasViewingPrevious = gameState.isViewingPrevious;
    if (!wasViewingPrevious) {
        stopQuestionTimer();
    }
    if (!question?.id || !question.text || !question.type) {
        console.error("Invalid question object:", question);
        if(questionTitle) questionTitle.textContent = "خطأ";
        if(questionText) questionText.textContent="بيانات السؤال غير صالحة.";
        if(answerOptionsWrapper) answerOptionsWrapper.classList.add('hidden');
        if(answerRevealSection) answerRevealSection.classList.add('hidden');
        if(previousCorrectAnswerDisplay) previousCorrectAnswerDisplay.classList.add('hidden');
        if(revealAnswerBtn) revealAnswerBtn.disabled = true;
        if(questionImageContainer) questionImageContainer.classList.add('hidden');
        return;
    }
    gameState.isViewingPrevious = false;
    if(answerOptionsWrapper) answerOptionsWrapper.classList.remove('hidden');
    if(answerRevealSection) answerRevealSection.classList.add('hidden');
    if(previousCorrectAnswerDisplay) previousCorrectAnswerDisplay.classList.add('hidden');
    if(feedbackMessage) { feedbackMessage.textContent = ''; feedbackMessage.className = ''; }
    const isCurrentTimerExpired = timerDisplayElement && timerDisplayElement.textContent === "0:00";
    if (revealAnswerBtn) { revealAnswerBtn.classList.remove('hidden'); revealAnswerBtn.disabled = false; }
    if(answerOptionsContainer) answerOptionsContainer.innerHTML = '';
    if(returnToCurrentBtn) returnToCurrentBtn.classList.add('hidden');
    if(viewPreviousBtn && gameState.previousQuestion) viewPreviousBtn.classList.remove('hidden');
    else if (viewPreviousBtn) viewPreviousBtn.classList.add('hidden');
    const currentTeam = gameState[gameState.currentTurn];
    const stationName = currentTeam?.path[currentTeam?.currentStationIndex]?.name || '?';
    const title = sourceTitle || (question.isGeneral ? "سؤال عام عن الكويت" : `سؤال المحطة: ${stationName}`);
    if(questionTitle) questionTitle.textContent = title;
    if(questionDifficulty) { questionDifficulty.textContent = getDifficultyText(question.difficulty); questionDifficulty.className = question.difficulty||'medium'; }
    if(questionPoints) questionPoints.textContent = question.points||0;
    if (question.image_filename && questionImageContainer && questionImage) {
        const imageUrl = `${backendBaseUrl}/uploads/${question.image_filename}`;
        questionImage.src = imageUrl;
        questionImage.alt = `صورة للسؤال عن ${question.landmark || 'الكويت'}`;
        questionImageContainer.classList.remove('hidden');
        questionImage.onerror = () => { console.error(`Failed to load image: ${imageUrl}`); questionImage.alt = 'فشل تحميل الصورة'; };
    } else {
        if (questionImageContainer) questionImageContainer.classList.add('hidden');
        if (questionImage) { questionImage.src = '#'; questionImage.alt = 'صورة السؤال'; questionImage.onerror = null; }
    }
    if(questionText) questionText.textContent = question.text;
    if (question.type === 'mcq' && Array.isArray(question.options) && question.options.length > 0) {
        const options = shuffleArray([...question.options]);
        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.textContent = typeof opt === 'string' ? opt : JSON.stringify(opt);
            btn.classList.add('option-btn');
            btn.disabled = isCurrentTimerExpired;
            if(answerOptionsContainer) answerOptionsContainer.appendChild(btn);
        });
    } else {
        console.error("Invalid options for MCQ:", question);
        if(questionText) questionText.textContent += " (خطأ خيارات)";
        if(revealAnswerBtn) revealAnswerBtn.disabled = true;
    }
    if (!wasViewingPrevious && !isCurrentTimerExpired) startQuestionTimer(QUESTION_TIME_LIMIT);
    else if (isCurrentTimerExpired) {
        if(timerDisplayElement) { timerDisplayElement.textContent = "0:00"; timerDisplayElement.style.backgroundColor = 'var(--danger-color)'; }
        if(answerOptionsContainer) answerOptionsContainer.querySelectorAll('.option-btn').forEach(btn => btn.disabled = true);
    } else {
        if (!isCurrentTimerExpired && answerOptionsContainer) answerOptionsContainer.querySelectorAll('.option-btn').forEach(btn => btn.disabled = false);
    }
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
    if (prevQ.image_filename && previousQuestionImage) {
        const imageUrl = `${backendBaseUrl}/uploads/${prevQ.image_filename}`;
        previousQuestionImage.src = imageUrl;
        previousQuestionImage.alt = `صورة السؤال السابق عن ${prevQ.landmark || 'الكويت'}`;
        previousQuestionImage.style.display = 'block';
        previousQuestionImage.onerror = () => { console.error(`Failed to load previous image: ${imageUrl}`); previousQuestionImage.alt = 'فشل تحميل الصورة'; previousQuestionImage.style.display = 'none'; };
    } else if (previousQuestionImage) {
        previousQuestionImage.style.display = 'none'; previousQuestionImage.src = '#'; previousQuestionImage.onerror = null;
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
        gameOverSection.classList.remove('hidden'); gameOverSection.classList.add('visible');
    }
}

function initializeGame() {
    console.log("Attempting to initialize game...");
    const currentUser = window.firebaseAuth ? window.firebaseAuth.currentUser : null;
    if (!currentUser) {
        alert("خطأ: المستخدم غير مسجل الدخول. لا يمكن بدء اللعبة.");
        if(gameSetupSection) gameSetupSection.classList.remove('hidden');
        if(gamePlayArea) gamePlayArea.classList.add('hidden');
        return;
    }

    const canPlayNow = window.deductGameFromUserBalance ? window.deductGameFromUserBalance(currentUser.uid) : false;

    if (!canPlayNow) {
        alert("رصيدك من الألعاب هو 0. الرجاء شراء المزيد من الألعاب لتتمكن من اللعب.");
        console.log("InitializeGame aborted: No game balance for user " + currentUser.uid + " after attempting deduction.");
        const noBalanceMessageId = 'no-balance-message';
        let noBalanceDiv = document.getElementById(noBalanceMessageId);
        if (!noBalanceDiv) {
            noBalanceDiv = document.createElement('div');
            noBalanceDiv.id = noBalanceMessageId;
            noBalanceDiv.innerHTML = `
                <h2 style="color: var(--danger-color); margin-bottom: 20px;">نفد رصيد الألعاب!</h2>
                <p style="font-size: 1.1em; margin-bottom: 25px;">يجب عليك شراء المزيد من الألعاب لمواصلة اللعب.</p>
                <p><i>يمكنك شراء الألعاب من الزر البرتقالي (+) في الهيدر.</i></p>`;
            noBalanceDiv.style.cssText = "text-align: center; padding: 30px; background-color: var(--white-color); border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); margin: 20px auto; max-width: 500px;";
            const mainContainer = document.querySelector('main.game-content > .container');
            if (mainContainer) {
                if (gameSetupSection) gameSetupSection.classList.add('hidden');
                if (gamePlayArea) gamePlayArea.classList.add('hidden');
                const existingMsg = mainContainer.querySelector(`#${noBalanceMessageId}`);
                if(existingMsg) existingMsg.remove();
                mainContainer.appendChild(noBalanceDiv);
            }
        } else { noBalanceDiv.classList.remove('hidden'); }
        if (gameSetupSection) gameSetupSection.classList.add('hidden');
        if (playAgainBtn) { playAgainBtn.disabled = true; playAgainBtn.style.opacity = "0.5"; playAgainBtn.style.cursor = "not-allowed"; }
        return;
    }

    if (!allLandmarkNames || allLandmarkNames.length < 2) { alert("خطأ: بيانات المعالم غير كافية."); return; }

    resetGameState(true);

    gameState.team1.name = team1NameInput.value.trim() || "الفريق الأول";
    gameState.team2.name = team2NameInput.value.trim() || "الفريق الثاني";

    const req = 2; if (allLandmarkNames.length < req) { alert(`خطأ: معالم غير كافية (${allLandmarkNames.length}).`); return; }
    let available = [...allLandmarkNames]; const t1Start = team1StartInput.value.trim(); const t2Start = team2StartInput.value.trim();
    let t1Station = null; let t2Station = null;
    if (t1Start && available.includes(t1Start)) { t1Station = t1Start; available = available.filter(n => n !== t1Station); } else { const i = Math.floor(Math.random() * available.length); t1Station = available.splice(i, 1)[0]; }
    if (t2Start && available.includes(t2Start) && t2Start !== t1Station) { t2Station = t2Start; available = available.filter(n => n !== t2Station); } else { if (available.length > 0) { const i = Math.floor(Math.random() * available.length); t2Station = available.splice(i, 1)[0]; } else { const pool = allLandmarkNames.filter(n => n !== t1Station); t2Station = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : t1Station; } }
    if (!t1Station || !t2Station) { alert("خطأ تعيين البداية."); return; }
    gameState.team1.path = [{ name: t1Station }]; gameState.team2.path = [{ name: t2Station }];
    gameState.team1.currentStationIndex = 0; gameState.team2.currentStationIndex = 0;
    gameState.team1.currentQuestionIndexInStation = 0; gameState.team2.currentQuestionIndexInStation = 0;
    gameState.askedQuestions[t1Station] = gameState.askedQuestions[t1Station] || new Set(); gameState.askedQuestions[t2Station] = gameState.askedQuestions[t2Station] || new Set();
    const remCount = STATIONS_PER_TEAM - 1;
    if (remCount > 0) { let pool = shuffleArray([...available]); const needed = remCount * 2; if (pool.length < needed) { const extra = needed - pool.length; const fallback = shuffleArray(allLandmarkNames.filter(n => n !== t1Station && n !== t2Station)); pool.push(...fallback.slice(0, extra)); } if (pool.length < needed) { alert(`خطأ: لا مسارات كافية.`); return; } const n1 = pool.slice(0, remCount); gameState.team1.path.push(...n1.map(n => ({ name: n }))); n1.forEach(n => gameState.askedQuestions[n] = gameState.askedQuestions[n] || new Set()); const n2 = pool.slice(remCount, needed); gameState.team2.path.push(...n2.map(n => ({ name: n }))); n2.forEach(n => gameState.askedQuestions[n] = gameState.askedQuestions[n] || new Set()); }

    if(gameSetupSection) gameSetupSection.classList.add('hidden');
    if(gamePlayArea) gamePlayArea.classList.remove('hidden');
    if(questionInteractionArea) questionInteractionArea.classList.remove('hidden');
    const gameSidebar = document.getElementById('game-sidebar');
    if(gameSidebar) gameSidebar.classList.remove('hidden');
    if(gameOverSection) { gameOverSection.classList.remove('visible'); gameOverSection.classList.add('hidden'); }

    updateDashboard();
    startTurn();
    console.log("Game Initialized and started successfully. 1 game deducted.");
}

function startTurn() {
    console.log(`Starting turn for ${gameState.currentTurn}`);
    if (gameState.isGameOver) {
        if (!gameOverSection?.classList.contains('visible')) { displayResults(); }
        return;
    }
    if (gameState.isViewingPrevious) {
        if (gameState.currentQuestion) displayQuestion(gameState.currentQuestion);
        else console.error("Cannot return to current question, no currentQuestion stored!");
        return;
    }
    if(answerOptionsWrapper) answerOptionsWrapper.classList.remove('hidden');
    if(answerRevealSection) answerRevealSection.classList.add('hidden');
    if(previousCorrectAnswerDisplay) previousCorrectAnswerDisplay.classList.add('hidden');
    if(feedbackMessage) { feedbackMessage.textContent = ''; feedbackMessage.className = ''; }
    if(revealAnswerBtn) { revealAnswerBtn.classList.remove('hidden'); revealAnswerBtn.disabled = false; }
    if(answerOptionsContainer) {
        answerOptionsContainer.innerHTML = '';
        answerOptionsContainer.querySelectorAll('.option-btn').forEach(btn => btn.disabled = false);
    }
    if(timerDisplayElement) { timerDisplayElement.textContent = formatTime(QUESTION_TIME_LIMIT); timerDisplayElement.style.backgroundColor = 'var(--black-color)'; }
    if (questionImageContainer) questionImageContainer.classList.add('hidden');
    if (questionImage) { questionImage.src = '#'; questionImage.onerror = null; }
    if (previousQuestionImage) { previousQuestionImage.style.display = 'none'; previousQuestionImage.src = '#'; previousQuestionImage.onerror = null;}
    const currentTeamId = gameState.currentTurn; const team = gameState[currentTeamId];
    if (!team) { console.error("Error: Current team undefined!"); return; }
    if (team.currentStationIndex >= STATIONS_PER_TEAM) { stopQuestionTimer(); const otherId = currentTeamId === 'team1' ? 'team2' : 'team1'; if (gameState[otherId] && gameState[otherId].currentStationIndex >= STATIONS_PER_TEAM) { if (checkGameOver()) displayResults(); } else { switchTurn(); if (checkGameOver()) displayResults(); else if(gameState.currentTurn !== currentTeamId) startTurn(); } return; }
    const stationObj = team.path[team.currentStationIndex];
    if (!stationObj?.name) { alert(`خطأ محطة ${team.currentStationIndex + 1}.`); stopQuestionTimer(); team.currentStationIndex++; team.currentQuestionIndexInStation = 0; updateDashboard(); setTimeout(startTurn, 100); return; }
    const stationName = stationObj.name;
    if (team.currentQuestionIndexInStation >= QUESTIONS_PER_STATION) { team.currentStationIndex++; team.currentQuestionIndexInStation = 0; updateDashboard(); if (checkGameOver()) { stopQuestionTimer(); displayResults(); } else { setTimeout(startTurn, 50); } return; }
    let targetPool, difficulty, landmarkFilter, askedKey, qTitle, isGeneral;
    switch (team.currentQuestionIndexInStation) { case 0: difficulty = 'easy'; landmarkFilter = stationName; askedKey = stationName; targetPool = questionsByLandmark[stationName]; isGeneral = false; qTitle = null; break; case 1: difficulty = 'medium'; landmarkFilter = stationName; askedKey = stationName; targetPool = questionsByLandmark[stationName]; isGeneral = false; qTitle = null; break; case 2: difficulty = 'hard'; landmarkFilter = null; askedKey = "kuwait_general"; targetPool = generalQuestions; isGeneral = true; qTitle = "سؤال عام عن الكويت"; break; default: team.currentQuestionIndexInStation = 0; setTimeout(startTurn, 50); return; }
    targetPool = targetPool || []; if (!Array.isArray(targetPool)) targetPool = [];
    if (!gameState.askedQuestions[askedKey]) gameState.askedQuestions[askedKey] = new Set();
    targetPool.forEach(q => { if (q && q.isGeneral === undefined) q.isGeneral = (askedKey === "kuwait_general"); });
    const availableQs = targetPool.filter(q => q?.id && q.difficulty === difficulty && (isGeneral ? q.isGeneral === true : (q.landmark === landmarkFilter && !q.isGeneral)) && !gameState.askedQuestions[askedKey].has(q.id));
    let chosenQ = null;
    if (availableQs.length > 0) { chosenQ = availableQs[Math.floor(Math.random() * availableQs.length)]; }
    else {
        const fallbackQs = targetPool.filter(q => q?.id && q.difficulty === difficulty && (isGeneral ? q.isGeneral === true : (q.landmark === landmarkFilter && !q.isGeneral)));
        if (fallbackQs.length > 0) chosenQ = fallbackQs[Math.floor(Math.random() * fallbackQs.length)];
        else { const src = isGeneral ? "العامة" : `'${landmarkFilter}'`; alert(`خطأ فادح: لا أسئلة (${getDifficultyText(difficulty)}) ${src}. سيتم تخطي هذا السؤال.`); stopQuestionTimer(); team.currentQuestionIndexInStation++; updateDashboard(); setTimeout(startTurn, 50); return; }
    }
    if (chosenQ?.id && chosenQ.text && chosenQ.type === 'mcq' && Array.isArray(chosenQ.options) && chosenQ.correctAnswer !== undefined) {
        gameState.askedQuestions[askedKey].add(chosenQ.id);
        gameState.currentQuestion = chosenQ;
        displayQuestion(gameState.currentQuestion, qTitle);
    }
    else { alert("خطأ باختيار السؤال."); stopQuestionTimer(); team.currentQuestionIndexInStation++; updateDashboard(); setTimeout(startTurn, 50); return; }
    updateDashboard();
}

// --- ربط الأحداث ---
if(gameSetupForm) {
    gameSetupForm.addEventListener('submit', (event) => {
        event.preventDefault();
        initializeGame(); // Balance check and deduction is now inside initializeGame
    });
}

if(playAgainBtn) {
    playAgainBtn.addEventListener('click', () => {
        console.log("Play Again clicked. Returning to game setup.");
        stopQuestionTimer();
        resetGameState(true); // Full reset of game state

        // Show setup section, hide game play and game over sections
        if(gameSetupSection) gameSetupSection.classList.remove('hidden');
        if(gamePlayArea) gamePlayArea.classList.add('hidden'); // Hide game area
        if(gameOverSection) {
            gameOverSection.classList.remove('visible');
            gameOverSection.classList.add('hidden');
        }
        // Clear team names and start points for new setup
        if(team1NameInput) team1NameInput.value = '';
        if(team1StartInput) team1StartInput.value = '';
        if(team2NameInput) team2NameInput.value = '';
        if(team2StartInput) team2StartInput.value = '';
        // The user will then click "بدء الرحلة!" on the setup form, which calls initializeGame again.
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

if (typeof gameQuestions !== 'undefined') processGameData();
console.log("game.js loaded. Waiting for user interaction or game data.");
/* --- END OF FILE assets/js/game.js --- */