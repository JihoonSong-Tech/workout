/**
 * 20분 AMRAP 웹 운동 카운터 (Pull-up 5, Push-up 15, Squat 20)
 * PWA, Keyboard Shortcuts, Web Audio, Web Speech TTS, Fullscreen 지원
 */

(function () {
  'use strict';

  // --- Constants & Config ---
  const EXERCISES = [
    { id: 'pullup', name: '턱걸이', target: 5, emoji: '🧗‍♂️', color: '#38bdf8' },
    { id: 'pushup', name: '팔굽혀펴기', target: 15, emoji: '💪', color: '#f59e0b' },
    { id: 'squat', name: '스쿼트', target: 20, emoji: '🦵', color: '#10b981' }
  ];

  const STORAGE_KEY_HISTORY = 'amrap_workout_history_v1';
  const STORAGE_KEY_SETTINGS = 'amrap_settings_v1';
  const STORAGE_KEY_PROFILE = 'amrap_user_profile_v1';

  // --- State ---
  let targetDurationSeconds = 20 * 60; // 20 minutes default
  let remainingSeconds = targetDurationSeconds;
  let timerInterval = null;
  let isTimerRunning = false;
  let elapsedWorkoutSeconds = 0;

  let currentStep = 0; // 0: Pull-up, 1: Push-up, 2: Squat
  let completedSets = 0;
  let repsPullup = 0;
  let repsPushup = 0;
  let repsSquat = 0;

  // User Profile (체중, 성별, 나이, 체감 난이도)
  let userProfile = {
    weight: 70,
    gender: 'male',
    age: 30,
    intensity: 1.15
  };

  try {
    const savedProfile = JSON.parse(localStorage.getItem(STORAGE_KEY_PROFILE));
    if (savedProfile) {
      userProfile = Object.assign(userProfile, savedProfile);
    }
  } catch (e) {}

  let undoStack = [];
  let isSoundEnabled = true;
  let isVoiceEnabled = true;
  let isVibrationEnabled = true;
  let wakeLock = null;

  // --- Calorie & Work Volume Calculator Engine (순수 운동 행위/반복수 기반) ---
  function calculateWorkoutMetrics(weight, gender, intensity, pullups, pushups, squats, elapsedSec) {
    const w = Math.max(30, Number(weight) || 70);
    const intens = Number(intensity) || 1.15;
    const genderFactor = (gender === 'female') ? 0.92 : 1.0;
    
    // Mechanical work volume (kg lifted)
    const volumeKg = Math.round(pullups * w + pushups * (w * 0.64) + squats * (w * 0.70));
    
    // Pure Activity/Repetition-Based Calories (운동 행위 기반 정밀 계산)
    // 1) 턱걸이 (Pull-up): 전신 체중 리프팅 1회당 약 w * 0.0165 kcal (70kg 기준 1회 ~1.15 kcal, 5회 = 5.78 kcal)
    const pullupCal = pullups * w * 0.0165 * intens * genderFactor;
    
    // 2) 팔굽혀펴기 (Push-up): 체중의 64% 프레스 1회당 약 w * 0.0080 kcal (70kg 기준 1회 ~0.56 kcal, 15회 = 8.40 kcal)
    const pushupCal = pushups * w * 0.0080 * intens * genderFactor;
    
    // 3) 스쿼트 (Squat): 체중의 70% 스쿼트 1회당 약 w * 0.0091 kcal (70kg 기준 1회 ~0.64 kcal, 20회 = 12.74 kcal)
    const squatCal = squats * w * 0.0091 * intens * genderFactor;
    
    // 직접 소모 칼로리 (운동을 하지 않고 시간만 흐르면 0 kcal로 정직하게 유지)
    const directCal = Math.round(pullupCal + pushupCal + squatCal);
    
    // EPOC (고강도 저항 서킷 애프터번 효과 - 직접 소모량의 15% 추가)
    const epocCal = Math.round(directCal * 0.15);
    const totalCal = directCal + epocCal;
    
    return { directCal, epocCal, totalCal, volumeKg };
  }

  // --- Web Audio Synthesizer ---
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playTone(freq, type = 'sine', duration = 0.15, gainVal = 0.3) {
    if (!isSoundEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  function playTapSound() {
    playTone(600, 'sine', 0.08, 0.25);
  }

  function playSetCompleteSound() {
    if (!isSoundEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.08);
        gain.gain.setValueAtTime(0.3, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.3);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.3);
      });
    } catch (e) {}
  }

  function playFinishSound() {
    if (!isSoundEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      [440, 554.37, 659.25, 880].forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + i * 0.12);
        gain.gain.setValueAtTime(0.4, now + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.6);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + i * 0.12);
        osc.stop(now + i * 0.12 + 0.6);
      });
    } catch (e) {}
  }

  function playCountdownBeep(isFinal = false) {
    if (!isSoundEnabled) return;
    playTone(isFinal ? 880 : 440, 'triangle', isFinal ? 0.4 : 0.15, isFinal ? 0.5 : 0.3);
  }

  // --- Web Speech API (TTS Voice Coach) ---
  function speak(text) {
    if (!isVoiceEnabled || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 1.1;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  }

  // --- Haptic Feedback ---
  function vibrate(pattern = 50) {
    if (isVibrationEnabled && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {}
    }
  }

  // --- Screen Wake Lock ---
  async function requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
        });
      } catch (err) {
        console.warn('Wake Lock error:', err);
      }
    }
  }

  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release();
      wakeLock = null;
    }
  }

  // --- DOM Elements ---
  const timerDisplay = document.getElementById('timerDisplay');
  const timerStatus = document.getElementById('timerStatus');
  const timerProgress = document.getElementById('timerProgress');
  const btnStartPause = document.getElementById('btnStartPause');
  const btnReset = document.getElementById('btnReset');
  const btnFinishEarly = document.getElementById('btnFinishEarly');
  const btnSoundToggle = document.getElementById('btnSoundToggle');
  const btnVoiceToggle = document.getElementById('btnVoiceToggle');
  const btnFullscreen = document.getElementById('btnFullscreen');
  const btnHistory = document.getElementById('btnHistory');
  const btnSettings = document.getElementById('btnSettings');
  const btnUndo = document.getElementById('btnUndo');

  const statCompletedSets = document.getElementById('statCompletedSets');
  const statTotalReps = document.getElementById('statTotalReps');
  const statCurrentRound = document.getElementById('statCurrentRound');
  const statPace = document.getElementById('statPace');
  const statCalories = document.getElementById('statCalories');
  const statWeightLabel = document.getElementById('statWeightLabel');

  // Mini Reps Breakdown Elements
  const statMiniPullup = document.getElementById('statMiniPullup');
  const statMiniPushup = document.getElementById('statMiniPushup');
  const statMiniSquat = document.getElementById('statMiniSquat');

  const cardPullup = document.getElementById('cardPullup');
  const cardPushup = document.getElementById('cardPushup');
  const cardSquat = document.getElementById('cardSquat');

  const repsPullupEl = document.getElementById('repsPullup');
  const repsPushupEl = document.getElementById('repsPushup');
  const repsSquatEl = document.getElementById('repsSquat');

  const btnDonePullup = document.getElementById('btnDonePullup');
  const btnDonePushup = document.getElementById('btnDonePushup');
  const btnDoneSquat = document.getElementById('btnDoneSquat');

  // Fast Next Set (+1 Set) Elements
  const btnFastNextSet = document.getElementById('btnFastNextSet');
  const fastSetMainText = document.getElementById('fastSetMainText');
  const fastSetSubText = document.getElementById('fastSetSubText');

  const btnMassiveAction = document.getElementById('btnMassiveAction');
  const massiveActionTitle = document.getElementById('massiveActionTitle');
  const massiveActionSubtitle = document.getElementById('massiveActionSubtitle');

  // Modals
  const modalSummary = document.getElementById('modalSummary');
  const modalHistory = document.getElementById('modalHistory');
  const modalSettings = document.getElementById('modalSettings');

  const sumTotalSets = document.getElementById('sumTotalSets');
  const sumExtraReps = document.getElementById('sumExtraReps');
  const sumExtraRepsWrap = document.getElementById('sumExtraRepsWrap');
  const sumPullups = document.getElementById('sumPullups');
  const sumPushups = document.getElementById('sumPushups');
  const sumSquats = document.getElementById('sumSquats');
  const sumGrandTotal = document.getElementById('sumGrandTotal');
  const sumDuration = document.getElementById('sumDuration');
  const sumAvgPace = document.getElementById('sumAvgPace');

  // Calorie & Analytics Elements
  const cacDirectCalories = document.getElementById('cacDirectCalories');
  const cacEpocCalories = document.getElementById('cacEpocCalories');
  const cacTotalCalories = document.getElementById('cacTotalCalories');
  const cacWorkVolume = document.getElementById('cacWorkVolume');

  // Summary Calibration inputs
  const summaryWeightInput = document.getElementById('summaryWeightInput');
  const summaryGenderSelect = document.getElementById('summaryGenderSelect');
  const summaryIntensitySelect = document.getElementById('summaryIntensitySelect');

  // Settings profile inputs
  const settingWeight = document.getElementById('settingWeight');
  const settingAge = document.getElementById('settingAge');
  const settingGender = document.getElementById('settingGender');
  const settingIntensity = document.getElementById('settingIntensity');

  const btnShareRecord = document.getElementById('btnShareRecord');
  const btnSaveRecord = document.getElementById('btnSaveRecord');
  const btnCloseSummary = document.getElementById('btnCloseSummary');
  const historyList = document.getElementById('historyList');
  const btnClearHistory = document.getElementById('btnClearHistory');
  const btnCloseHistory = document.getElementById('btnCloseHistory');
  const btnSaveSettings = document.getElementById('btnSaveSettings');
  const toggleVoice = document.getElementById('toggleVoice');
  const toggleVibration = document.getElementById('toggleVibration');

  // --- Formatting Helpers ---
  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function getCombinedTotalReps() {
    return repsPullup + repsPushup + repsSquat;
  }

  // --- UI Update Functions ---
  function updateTimerUI() {
    timerDisplay.textContent = formatTime(remainingSeconds);

    const total = targetDurationSeconds;
    const progress = remainingSeconds / total;
    const circumference = 552.92;
    const offset = circumference * (1 - progress);
    timerProgress.style.strokeDashoffset = offset;

    timerProgress.classList.remove('warning', 'danger');
    if (remainingSeconds <= 60) {
      timerProgress.classList.add('danger');
    } else if (remainingSeconds <= 300) {
      timerProgress.classList.add('warning');
    }

    if (isTimerRunning) {
      timerStatus.textContent = '운동 진행 중 🔥';
      timerStatus.style.color = '#10b981';
      btnStartPause.classList.add('running');
      btnStartPause.innerHTML = '<span class="btn-icon">⏸</span><span class="btn-text">일시정지 (P)</span>';
    } else if (remainingSeconds < targetDurationSeconds && remainingSeconds > 0) {
      timerStatus.textContent = '일시정지 됨 ⏸';
      timerStatus.style.color = '#f59e0b';
      btnStartPause.classList.remove('running');
      btnStartPause.innerHTML = '<span class="btn-icon">▶</span><span class="btn-text">계속하기 (Space)</span>';
    } else if (remainingSeconds === 0) {
      timerStatus.textContent = '시간 종료! 🏁';
      timerStatus.style.color = '#ef4444';
      btnStartPause.classList.remove('running');
      btnStartPause.innerHTML = '<span class="btn-icon">🔄</span><span class="btn-text">새 운동</span>';
    } else {
      timerStatus.textContent = '준비됨';
      timerStatus.style.color = 'var(--text-secondary)';
      btnStartPause.classList.remove('running');
      btnStartPause.innerHTML = '<span class="btn-icon">▶</span><span class="btn-text">운동 시작 (Space)</span>';
    }
  }

  function updateExerciseCardsUI() {
    repsPullupEl.textContent = repsPullup;
    repsPushupEl.textContent = repsPushup;
    repsSquatEl.textContent = repsSquat;

    const cards = [cardPullup, cardPushup, cardSquat];
    cards.forEach((card, index) => {
      if (index === currentStep) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });

    const cur = EXERCISES[currentStep];
    const isLastStep = currentStep === 2;
    massiveActionSubtitle.textContent = `현재 단계: STEP ${currentStep + 1} / 3`;
    massiveActionTitle.textContent = `${cur.emoji} ${cur.name} ${cur.target}개 완료${isLastStep ? ' (세트 완료!)' : ''}`;

    if (currentStep === 0) {
      btnMassiveAction.style.background = 'linear-gradient(135deg, #0284c7, #2563eb)';
      btnMassiveAction.style.boxShadow = '0 8px 24px rgba(37, 99, 235, 0.45)';
    } else if (currentStep === 1) {
      btnMassiveAction.style.background = 'linear-gradient(135deg, #d97706, #b45309)';
      btnMassiveAction.style.boxShadow = '0 8px 24px rgba(245, 158, 11, 0.45)';
    } else {
      btnMassiveAction.style.background = 'linear-gradient(135deg, #059669, #047857)';
      btnMassiveAction.style.boxShadow = '0 8px 24px rgba(16, 185, 129, 0.45)';
    }
  }

  function updateStatsUI() {
    statCompletedSets.textContent = completedSets;
    statTotalReps.textContent = getCombinedTotalReps();
    statCurrentRound.textContent = `${completedSets + 1} 라운드 진행 중`;

    // Update Mini breakdown items
    if (statMiniPullup) statMiniPullup.textContent = repsPullup;
    if (statMiniPushup) statMiniPushup.textContent = repsPushup;
    if (statMiniSquat) statMiniSquat.textContent = repsSquat;

    const elapsedMinutes = (targetDurationSeconds - remainingSeconds) / 60;
    if (elapsedMinutes > 0.1 && completedSets > 0) {
      const pace = (completedSets / elapsedMinutes).toFixed(1);
      statPace.textContent = `${pace} 세트/분`;
    } else {
      statPace.textContent = '0.0 세트/분';
    }

    // Calculate real-time activity-based calories
    const metrics = calculateWorkoutMetrics(
      userProfile.weight,
      userProfile.gender,
      userProfile.intensity,
      repsPullup,
      repsPushup,
      repsSquat,
      elapsedWorkoutSeconds
    );

    if (statCalories) {
      statCalories.textContent = metrics.directCal;
    }
    if (statWeightLabel) {
      statWeightLabel.textContent = `${userProfile.weight}kg 기준 (설정 가능)`;
    }
  }

  function saveSnapshot() {
    undoStack.push({
      currentStep,
      completedSets,
      repsPullup,
      repsPushup,
      repsSquat
    });
    if (undoStack.length > 50) undoStack.shift();
  }

  // --- Fast Next Set (+1 Set) Double-Click Safety Logic ---
  let fastSetConfirmTimer = null;
  let isFastSetConfirming = false;

  function resetFastSetButtonState() {
    isFastSetConfirming = false;
    clearTimeout(fastSetConfirmTimer);
    fastSetConfirmTimer = null;
    if (btnFastNextSet) {
      btnFastNextSet.classList.remove('confirm-mode');
      if (fastSetMainText) fastSetMainText.textContent = '+1세트';
      if (fastSetSubText) fastSetSubText.textContent = '2번 클릭';
    }
  }

  function handleFastNextSetClick() {
    if (!isTimerRunning) {
      startTimer();
    }

    if (!isFastSetConfirming) {
      // 1st click: Enter confirmation mode
      isFastSetConfirming = true;
      if (btnFastNextSet) {
        btnFastNextSet.classList.add('confirm-mode');
        if (fastSetMainText) fastSetMainText.textContent = '⚠️ 한 번 더!';
        if (fastSetSubText) fastSetSubText.textContent = '2초 내 클릭';
      }
      playTone(520, 'triangle', 0.12, 0.35);
      vibrate(50);
      showShortcutToast('⚠️ 한 번 더 클릭하면 1세트가 즉시 완료됩니다');

      fastSetConfirmTimer = setTimeout(() => {
        resetFastSetButtonState();
      }, 2500);
    } else {
      // 2nd click: Confirmed! Execute fast next set
      resetFastSetButtonState();
      executeFastNextSet();
    }
  }

  function executeFastNextSet() {
    saveSnapshot();

    // Complete the current round's remaining exercises
    if (currentStep === 0) {
      repsPullup += 5;
      repsPushup += 15;
      repsSquat += 20;
    } else if (currentStep === 1) {
      repsPushup += 15;
      repsSquat += 20;
    } else if (currentStep === 2) {
      repsSquat += 20;
    }

    completedSets += 1;
    currentStep = 0;

    playSetCompleteSound();
    vibrate([80, 50, 100, 50, 150]);
    triggerCelebrationEffect();
    speak(`${completedSets}세트 완료! 멋집니다. 다음 턱걸이 시작!`);
    showShortcutToast(`⚡ ${completedSets}세트 완료 (+1 Set)`);

    updateExerciseCardsUI();
    updateStatsUI();
  }

  // --- Step Advance / Completion Logic ---
  function completeCurrentStep() {
    if (!isTimerRunning) {
      startTimer();
    }

    saveSnapshot();

    if (currentStep === 0) {
      // Completed Pull-up (5)
      repsPullup += 5;
      currentStep = 1;
      playTapSound();
      vibrate(40);
      speak('턱걸이 완료. 다음 팔굽혀펴기 15개!');
    } else if (currentStep === 1) {
      // Completed Push-up (15)
      repsPushup += 15;
      currentStep = 2;
      playTapSound();
      vibrate(40);
      speak('팔굽혀펴기 완료. 다음 스쿼트 20개!');
    } else if (currentStep === 2) {
      // Completed Squat (20) -> Set Complete!
      repsSquat += 20;
      completedSets += 1;
      currentStep = 0;
      playSetCompleteSound();
      vibrate([60, 40, 80]);
      triggerCelebrationEffect();
      speak(`${completedSets}세트 완료! 멋집니다. 다음 턱걸이 시작!`);
    }

    updateExerciseCardsUI();
    updateStatsUI();
  }

  function adjustRep(exerciseId, delta) {
    saveSnapshot();
    if (exerciseId === 'pullup') {
      repsPullup = Math.max(0, repsPullup + delta);
    } else if (exerciseId === 'pushup') {
      repsPushup = Math.max(0, repsPushup + delta);
    } else if (exerciseId === 'squat') {
      repsSquat = Math.max(0, repsSquat + delta);
    }
    vibrate(20);
    updateExerciseCardsUI();
    updateStatsUI();
  }

  function undoLastAction() {
    if (undoStack.length === 0) {
      alert('되돌릴 이전 기록이 없습니다.');
      return;
    }
    const state = undoStack.pop();
    currentStep = state.currentStep;
    completedSets = state.completedSets;
    repsPullup = state.repsPullup;
    repsPushup = state.repsPushup;
    repsSquat = state.repsSquat;

    vibrate(30);
    updateExerciseCardsUI();
    updateStatsUI();
    speak('이전 동작을 취소했습니다.');
  }

  function triggerCelebrationEffect() {
    const card = document.querySelector('.exercise-card.active') || cardPullup;
    card.classList.add('flash-anim');
    setTimeout(() => card.classList.remove('flash-anim'), 400);
  }

  // --- Timer Controls ---
  function startTimer() {
    if (isTimerRunning) return;
    initAudio();
    requestWakeLock();
    isTimerRunning = true;
    updateTimerUI();
    speak('20분 AMRAP 챌린지 시작!');

    timerInterval = setInterval(() => {
      if (remainingSeconds > 0) {
        remainingSeconds--;
        elapsedWorkoutSeconds++;
        updateTimerUI();
        updateStatsUI();

        // 10, 5, 3, 2, 1 sec warnings
        if (remainingSeconds === 60) {
          speak('남은 시간 1분! 마지막 스퍼트!');
        } else if (remainingSeconds === 10 || remainingSeconds === 5 || remainingSeconds === 3 || remainingSeconds === 2 || remainingSeconds === 1) {
          playCountdownBeep(false);
          vibrate(30);
        }

        if (remainingSeconds === 0) {
          finishWorkout();
        }
      }
    }, 1000);
  }

  function pauseTimer() {
    if (!isTimerRunning) return;
    clearInterval(timerInterval);
    timerInterval = null;
    isTimerRunning = false;
    releaseWakeLock();
    updateTimerUI();
    speak('일시정지 되었습니다.');
  }

  function resetWorkout() {
    if (isTimerRunning || completedSets > 0 || repsPullup > 0 || repsPushup > 0 || repsSquat > 0) {
      if (!confirm('현재 운동 데이터를 초기화하고 처음부터 다시 시작하시겠습니까?')) {
        return;
      }
    }
    pauseTimer();
    remainingSeconds = targetDurationSeconds;
    elapsedWorkoutSeconds = 0;
    currentStep = 0;
    completedSets = 0;
    repsPullup = 0;
    repsPushup = 0;
    repsSquat = 0;
    undoStack = [];

    updateTimerUI();
    updateExerciseCardsUI();
    updateStatsUI();
  }

  function updateSummaryMetricsDisplay() {
    const actualDuration = elapsedWorkoutSeconds > 0 ? elapsedWorkoutSeconds : (targetDurationSeconds - remainingSeconds);
    const weight = Number(summaryWeightInput.value) || userProfile.weight || 70;
    const gender = summaryGenderSelect.value || userProfile.gender || 'male';
    const intensity = Number(summaryIntensitySelect.value) || userProfile.intensity || 1.15;

    // Save updated user profile
    userProfile.weight = weight;
    userProfile.gender = gender;
    userProfile.intensity = intensity;
    try {
      localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(userProfile));
    } catch (e) {}

    const metrics = calculateWorkoutMetrics(
      weight,
      gender,
      intensity,
      repsPullup,
      repsPushup,
      repsSquat,
      actualDuration
    );

    cacDirectCalories.textContent = `${metrics.directCal} kcal`;
    cacEpocCalories.textContent = `+${metrics.epocCal} kcal`;
    cacTotalCalories.textContent = `${metrics.totalCal} kcal`;
    cacWorkVolume.textContent = `약 ${metrics.volumeKg.toLocaleString()} kg`;
  }

  function finishWorkout() {
    pauseTimer();
    playFinishSound();
    vibrate([100, 50, 100, 50, 200]);
    speak(`운동 종료! 총 ${completedSets}세트 완료하셨습니다. 수고하셨습니다!`);

    const totalSetReps = completedSets * 40;
    const extraReps = Math.max(0, getCombinedTotalReps() - totalSetReps);

    sumTotalSets.textContent = completedSets;
    if (extraReps > 0) {
      sumExtraRepsWrap.style.display = 'inline';
      sumExtraReps.textContent = extraReps;
    } else {
      sumExtraRepsWrap.style.display = 'none';
    }

    sumPullups.textContent = `${repsPullup}회`;
    sumPushups.textContent = `${repsPushup}회`;
    sumSquats.textContent = `${repsSquat}회`;
    sumGrandTotal.textContent = `${getCombinedTotalReps()}회`;

    const actualDuration = elapsedWorkoutSeconds > 0 ? elapsedWorkoutSeconds : (targetDurationSeconds - remainingSeconds);
    sumDuration.textContent = formatTime(actualDuration);

    if (completedSets > 0 && actualDuration > 0) {
      const avgSecPerSet = Math.round(actualDuration / completedSets);
      sumAvgPace.textContent = `${formatTime(avgSecPerSet)} / 세트`;
    } else {
      sumAvgPace.textContent = '-';
    }

    // Set calibration input values from profile
    if (summaryWeightInput) summaryWeightInput.value = userProfile.weight;
    if (summaryGenderSelect) summaryGenderSelect.value = userProfile.gender;
    if (summaryIntensitySelect) summaryIntensitySelect.value = userProfile.intensity;

    updateSummaryMetricsDisplay();

    modalSummary.classList.add('show');
  }

  // Calibration inputs real-time listeners
  [summaryWeightInput, summaryGenderSelect, summaryIntensitySelect].forEach((el) => {
    if (el) {
      el.addEventListener('input', updateSummaryMetricsDisplay);
      el.addEventListener('change', updateSummaryMetricsDisplay);
    }
  });

  // --- History & Storage ---
  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveHistoryRecord() {
    const history = getHistory();
    const actualDuration = elapsedWorkoutSeconds > 0 ? elapsedWorkoutSeconds : (targetDurationSeconds - remainingSeconds);
    const weight = Number(summaryWeightInput?.value) || userProfile.weight || 70;
    const gender = summaryGenderSelect?.value || userProfile.gender || 'male';
    const intensity = Number(summaryIntensitySelect?.value) || userProfile.intensity || 1.15;

    const metrics = calculateWorkoutMetrics(
      weight,
      gender,
      intensity,
      repsPullup,
      repsPushup,
      repsSquat,
      actualDuration
    );

    const newRecord = {
      id: Date.now(),
      date: new Date().toLocaleString('ko-KR', {
        month: 'short',
        day: 'numeric',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit'
      }),
      sets: completedSets,
      pullups: repsPullup,
      pushups: repsPushup,
      squats: repsSquat,
      totalReps: getCombinedTotalReps(),
      duration: actualDuration,
      calories: metrics.totalCal,
      directCalories: metrics.directCal,
      epocCalories: metrics.epocCal,
      volumeKg: metrics.volumeKg,
      userWeight: weight
    };

    history.unshift(newRecord);
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
    modalSummary.classList.remove('show');
    showHistoryModal();
  }

  function copyShareText() {
    const totalSetReps = completedSets * 40;
    const extraReps = Math.max(0, getCombinedTotalReps() - totalSetReps);
    const setSummary = extraReps > 0 ? `${completedSets}세트 + ${extraReps}회` : `${completedSets}세트`;
    const weight = Number(summaryWeightInput?.value) || userProfile.weight || 70;
    const actualDuration = elapsedWorkoutSeconds > 0 ? elapsedWorkoutSeconds : (targetDurationSeconds - remainingSeconds);
    
    const metrics = calculateWorkoutMetrics(
      weight,
      userProfile.gender,
      userProfile.intensity,
      repsPullup,
      repsPushup,
      repsSquat,
      actualDuration
    );

    const text = `🔥 [20분 AMRAP 운동 완료 & 성과 분석] 🔥\n` +
                 `🏆 최종 기록: ${setSummary} (총 ${getCombinedTotalReps()}회)\n` +
                 `🧗‍♂️ 턱걸이: ${repsPullup}회\n` +
                 `💪 팔굽혀펴기: ${repsPushup}회\n` +
                 `🦵 스쿼트: ${repsSquat}회\n` +
                 `🔥 소모 칼로리: ${metrics.totalCal} kcal (운동 ${metrics.directCal} + 애프터번 ${metrics.epocCal})\n` +
                 `🏋️‍♂️ 리프팅 총량: ${metrics.volumeKg.toLocaleString()} kg\n` +
                 `⏱ 운동 시간: ${formatTime(actualDuration)}\n` +
                 `💪 신체 효과: 상체 등·가슴 펌핑, 하체 파워 & VO2 Max 심폐지구력 향상!\n` +
                 `#오운완 #AMRAP #맨몸운동 #칼리스데닉스`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        btnShareRecord.textContent = '✅ 복사 완료! (카카오톡/SNS에 붙여넣기)';
        setTimeout(() => {
          btnShareRecord.textContent = '📋 성과 요약 복사 (카톡/SNS 공유)';
        }, 2500);
      });
    } else {
      alert(text);
    }
  }

  function showHistoryModal() {
    const history = getHistory();
    historyList.innerHTML = '';

    if (history.length === 0) {
      historyList.innerHTML = '<div class="empty-history">아직 저장된 운동 기록이 없습니다.<br>오늘의 20분 챌린지를 완료해 보세요! 💪</div>';
    } else {
      history.forEach((item) => {
        const div = document.createElement('div');
        div.className = 'history-item';
        const calText = item.calories ? ` · 🔥 ${item.calories} kcal` : '';
        const volText = item.volumeKg ? ` · 🏋️‍♂️ ${item.volumeKg.toLocaleString()}kg` : '';
        div.innerHTML = `
          <div>
            <div class="history-date">${item.date} (${formatTime(item.duration || 1200)})${calText}${volText}</div>
            <div class="history-details">
              턱걸이 ${item.pullups} · 팔굽혀펴기 ${item.pushups} · 스쿼트 ${item.squats} (총 ${item.totalReps}회)
            </div>
          </div>
          <div class="history-badge">${item.sets} 세트</div>
        `;
        historyList.appendChild(div);
      });
    }

    modalHistory.classList.add('show');
  }

  // --- Fullscreen Toggle ---
  function toggleFullscreenMode() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn('Fullscreen error:', err);
      });
      btnFullscreen.querySelector('.icon').textContent = '🗗';
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        btnFullscreen.querySelector('.icon').textContent = '⛶';
      }
    }
  }

  // --- Toast Feedback ---
  let toastTimer = null;
  function showShortcutToast(text) {
    let toast = document.getElementById('shortcutToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'shortcutToast';
      toast.className = 'shortcut-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 1200);
  }

  // --- Keyboard Shortcuts (한글/영문 자판 및 e.code 완전 호환) ---
  window.addEventListener('keydown', (e) => {
    // Escape: close any open modal
    if (e.key === 'Escape' || e.code === 'Escape') {
      [modalSummary, modalHistory, modalSettings].forEach((m) => m.classList.remove('show'));
      return;
    }

    // Ignore keyboard shortcuts if user is typing in an input
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

    // Normalize key code & key string
    const code = e.code || '';
    const key = (e.key || '').toLowerCase();

    // 1) Space or Enter: Complete active step
    if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter' || key === ' ' || key === 'enter') {
      e.preventDefault();
      // Remove focus from any active button so Space doesn't double-trigger focused buttons
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
      completeCurrentStep();
      return;
    }

    // 2) P (or ㅔ / ㅖ in Korean): Start / Pause Timer
    if (code === 'KeyP' || key === 'p' || key === 'ㅔ' || key === 'ㅖ') {
      e.preventDefault();
      if (isTimerRunning) {
        pauseTimer();
        showShortcutToast('⏸ 타이머 일시정지 (P)');
      } else {
        if (remainingSeconds === 0) {
          remainingSeconds = targetDurationSeconds;
          elapsedWorkoutSeconds = 0;
        }
        startTimer();
        showShortcutToast('▶ 타이머 시작 (P)');
      }
      return;
    }

    // 3) U (or ㅕ in Korean): Undo
    if (code === 'KeyU' || key === 'u' || key === 'ㅕ') {
      e.preventDefault();
      undoLastAction();
      showShortcutToast('↩ 이전 동작 되돌리기 (U)');
      return;
    }

    // 4) R (or ㄱ / ㄲ in Korean): Reset
    if (code === 'KeyR' || key === 'r' || key === 'ㄱ' || key === 'ㄲ') {
      e.preventDefault();
      resetWorkout();
      return;
    }

    // 5) F (or ㄹ in Korean): Fullscreen
    if (code === 'KeyF' || key === 'f' || key === 'ㄹ') {
      e.preventDefault();
      toggleFullscreenMode();
      showShortcutToast('⛶ 전체화면 전환 (F)');
      return;
    }

    // 6) N (or ㅜ in Korean): Fast Next Set (Double click/press)
    if (code === 'KeyN' || key === 'n' || key === 'ㅜ') {
      e.preventDefault();
      handleFastNextSetClick();
      return;
    }

    // 7) 1, 2, 3: Direct complete for specific exercise
    if (code === 'Digit1' || code === 'Numpad1' || key === '1') {
      e.preventDefault();
      adjustRep('pullup', 5);
      showShortcutToast('🧗‍♂️ 턱걸이 +5회 (1)');
      return;
    }
    if (code === 'Digit2' || code === 'Numpad2' || key === '2') {
      e.preventDefault();
      adjustRep('pushup', 15);
      showShortcutToast('💪 팔굽혀펴기 +15회 (2)');
      return;
    }
    if (code === 'Digit3' || code === 'Numpad3' || key === '3') {
      e.preventDefault();
      adjustRep('squat', 20);
      showShortcutToast('🦵 스쿼트 +20회 (3)');
      return;
    }
  });

  // --- Event Listeners ---
  if (btnFastNextSet) {
    btnFastNextSet.addEventListener('click', handleFastNextSetClick);
  }

  btnStartPause.addEventListener('click', () => {
    if (isTimerRunning) {
      pauseTimer();
    } else {
      if (remainingSeconds === 0) {
        remainingSeconds = targetDurationSeconds;
        elapsedWorkoutSeconds = 0;
      }
      startTimer();
    }
  });

  btnReset.addEventListener('click', resetWorkout);
  btnFinishEarly.addEventListener('click', () => {
    if (completedSets > 0 || getCombinedTotalReps() > 0) {
      if (confirm('현재 상태로 운동을 완료하고 기록을 보시겠습니까?')) {
        finishWorkout();
      }
    } else {
      alert('기록할 운동 내역이 없습니다.');
    }
  });

  btnMassiveAction.addEventListener('click', completeCurrentStep);
  btnDonePullup.addEventListener('click', completeCurrentStep);
  btnDonePushup.addEventListener('click', completeCurrentStep);
  btnDoneSquat.addEventListener('click', completeCurrentStep);
  btnUndo.addEventListener('click', undoLastAction);

  // Mini adjusters
  document.querySelectorAll('.btn-adjust').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ex = btn.getAttribute('data-ex');
      const delta = parseInt(btn.getAttribute('data-delta'), 10);
      adjustRep(ex, delta);
    });
  });

  // Sound toggle
  btnSoundToggle.addEventListener('click', () => {
    isSoundEnabled = !isSoundEnabled;
    btnSoundToggle.querySelector('.icon').textContent = isSoundEnabled ? '🔊' : '🔇';
    btnSoundToggle.style.opacity = isSoundEnabled ? '1' : '0.5';
    if (isSoundEnabled) playTapSound();
  });

  // Voice coach toggle
  btnVoiceToggle.addEventListener('click', () => {
    isVoiceEnabled = !isVoiceEnabled;
    btnVoiceToggle.querySelector('.icon').textContent = isVoiceEnabled ? '🗣️' : '🤐';
    btnVoiceToggle.style.opacity = isVoiceEnabled ? '1' : '0.5';
    toggleVoice.checked = isVoiceEnabled;
    if (isVoiceEnabled) speak('음성 코치가 켜졌습니다.');
  });

  // Fullscreen button
  btnFullscreen.addEventListener('click', toggleFullscreenMode);

  // Modals open/close
  btnHistory.addEventListener('click', showHistoryModal);
  btnCloseHistory.addEventListener('click', () => modalHistory.classList.remove('show'));

  btnClearHistory.addEventListener('click', () => {
    if (confirm('저장된 모든 운동 기록을 삭제하시겠습니까?')) {
      localStorage.removeItem(STORAGE_KEY_HISTORY);
      showHistoryModal();
    }
  });

  btnSettings.addEventListener('click', () => {
    if (settingWeight) settingWeight.value = userProfile.weight;
    if (settingAge) settingAge.value = userProfile.age;
    if (settingGender) settingGender.value = userProfile.gender;
    if (settingIntensity) settingIntensity.value = userProfile.intensity;
    modalSettings.classList.add('show');
  });

  document.querySelectorAll('.btn-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-preset').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const mins = parseInt(btn.getAttribute('data-minutes'), 10);
      targetDurationSeconds = mins * 60;
      if (!isTimerRunning) {
        remainingSeconds = targetDurationSeconds;
        updateTimerUI();
      }
    });
  });

  toggleVoice.addEventListener('change', (e) => {
    isVoiceEnabled = e.target.checked;
    btnVoiceToggle.querySelector('.icon').textContent = isVoiceEnabled ? '🗣️' : '🤐';
    btnVoiceToggle.style.opacity = isVoiceEnabled ? '1' : '0.5';
  });

  toggleVibration.addEventListener('change', (e) => {
    isVibrationEnabled = e.target.checked;
  });

  btnSaveSettings.addEventListener('click', () => {
    if (settingWeight) userProfile.weight = Number(settingWeight.value) || 70;
    if (settingAge) userProfile.age = Number(settingAge.value) || 30;
    if (settingGender) userProfile.gender = settingGender.value || 'male';
    if (settingIntensity) userProfile.intensity = Number(settingIntensity.value) || 1.15;

    try {
      localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(userProfile));
    } catch (e) {}

    modalSettings.classList.remove('show');
    showShortcutToast('✅ 설정 및 프로필이 저장되었습니다');
    updateStatsUI();
    if (!isTimerRunning) {
      updateTimerUI();
    }
  });

  btnShareRecord.addEventListener('click', copyShareText);
  btnSaveRecord.addEventListener('click', saveHistoryRecord);
  btnCloseSummary.addEventListener('click', () => modalSummary.classList.remove('show'));

  // Close modals on backdrop click
  [modalSummary, modalHistory, modalSettings].forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('show');
      }
    });
  });

  // Initialize UI
  updateTimerUI();
  updateExerciseCardsUI();
  updateStatsUI();

})();
