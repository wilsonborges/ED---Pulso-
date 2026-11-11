const $ = (id) => document.getElementById(id);
const defaultSettings = { cycleSeconds: 120, pulseCheckSeconds: 10, adrenalineSeconds: 180, soundEnabled: false, vibrationEnabled: false };
let settings = { ...defaultSettings, ...JSON.parse(localStorage.getItem('ed-pulso-settings') || '{}') };
const state = { elapsedMs: 0, runningSince: null, cycleOffsetMs: 0, events: [], started: false, lastReminderMinute: 0, adrenalineAlertUntil: 0, adrenalinePending: false, deathSeconds: null, pendingDeathAt: null, pendingDeathElapsedMs: null, wakeLock: null, adrenalineDueAt: null, sessionEnded: false, audioContext: null };

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const light = theme === 'light';
  $('themeIcon').textContent = light ? '☾' : '☼';
  $('themeLabel').textContent = light ? 'Modo escuro' : 'Modo claro';
  $('themeToggle').setAttribute('aria-label', light ? 'Ativar modo escuro' : 'Ativar modo claro');
  document.querySelector('meta[name="theme-color"]').content = light ? '#f2f5f7' : '#0b1822';
  localStorage.setItem('ed-pulso-theme', theme);
}
setTheme(localStorage.getItem('ed-pulso-theme') || 'dark');
$('themeToggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

function elapsedMs() { return state.elapsedMs + (state.runningSince === null ? 0 : Date.now() - state.runningSince); }
function formatTime(seconds) { const whole = Math.max(0, Math.floor(seconds)); return `${String(Math.floor(whole / 60)).padStart(2,'0')}:${String(whole % 60).padStart(2,'0')}`; }
function cyclePhaseSeconds() { return settings.cycleSeconds + settings.pulseCheckSeconds; }
function cycleInfo() {
  const seconds = Math.floor((elapsedMs() + state.cycleOffsetMs) / 1000);
  const phase = seconds % cyclePhaseSeconds();
  const checking = settings.pulseCheckSeconds > 0 && phase >= settings.cycleSeconds;
  return { number: Math.floor(seconds / cyclePhaseSeconds()) + 1, checking, progress: checking ? settings.cycleSeconds : phase, remaining: checking ? cyclePhaseSeconds() - phase : settings.cycleSeconds - phase };
}
function draw() {
  const seconds = Math.floor(elapsedMs() / 1000);
  const cycle = cycleInfo();
  $('totalTime').textContent = formatTime(seconds);
  $('cycleRemaining').textContent = formatTime(cycle.remaining);
  const ringLength = 2 * Math.PI * 44;
  $('cycleRing').style.strokeDashoffset = String(ringLength * (1 - cycle.progress / settings.cycleSeconds));
  const cycleCircle = $('cycleRing').closest('.circle-timer');
  cycleCircle.classList.toggle('urgent', !cycle.checking && cycle.remaining > 0 && cycle.remaining <= 10);
  cycleCircle.classList.toggle('check-mode', cycle.checking);
  cycleCircle.classList.toggle('pulse-check', cycle.checking);
  $('cycleCaption').innerHTML = cycle.checking ? '<span class="check-label">CHECAGEM<br>DE PULSO</span>' : `CICLO <b id="cycleNumber">${cycle.number}</b>`;
  const running = state.runningSince !== null;
  const adrenalineRemaining = state.sessionEnded || state.adrenalineDueAt === null ? null : Math.max(0, Math.ceil((state.adrenalineDueAt - Date.now()) / 1000));
  $('reminderClock').textContent = adrenalineRemaining === null ? '--:--' : formatTime(adrenalineRemaining);
  const adrenalineProgress = adrenalineRemaining === null ? 0 : 1 - adrenalineRemaining / settings.adrenalineSeconds;
  $('adrenalineRing').style.strokeDashoffset = String(ringLength * (1 - adrenalineProgress));
  const adrenalineCircle = $('adrenalineRing').closest('.circle-timer');
  adrenalineCircle.classList.toggle('urgent', adrenalineRemaining !== null && adrenalineRemaining > 0 && adrenalineRemaining <= 10);
  if (!state.sessionEnded && state.adrenalineDueAt !== null && adrenalineRemaining === 0) {
    state.adrenalineDueAt = null;
    state.adrenalinePending = true;
    state.adrenalineAlertUntil = Date.now() + 5000;
    if (settings.soundEnabled) playAlertSound();
    if (settings.vibrationEnabled && 'vibrate' in navigator) navigator.vibrate([350,140,350]);
  }
  const alertActive = state.adrenalinePending && !state.sessionEnded;
  const alertSeconds = Math.max(0, Math.ceil((state.adrenalineAlertUntil - Date.now()) / 1000));
  adrenalineCircle.classList.toggle('adrenaline-alert-active', alertActive);
  adrenalineCircle.classList.toggle('alert-fresh', alertActive && alertSeconds > 0);
  $('adrenalineCircleAlert').hidden = !alertActive;
  $('startPauseText').textContent = running ? 'PAUSAR' : 'INICIAR';
  $('startPauseIcon').innerHTML = running
    ? '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="3" width="4" height="14" rx="1"/><rect x="12" y="3" width="4" height="14" rx="1"/></svg>'
    : '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3.8c0-.8.9-1.3 1.6-.9l10.1 6.1a1.2 1.2 0 0 1 0 2L6.6 17.1c-.7.4-1.6-.1-1.6-.9V3.8Z"/></svg>';
  $('timerAdrenalineBtn').disabled = !state.started || state.sessionEnded;
  $('deathBtn').disabled = !state.started || state.deathSeconds !== null || state.sessionEnded;
  $('startPauseBtn').disabled = state.sessionEnded;
  $('sessionStatus').textContent = state.sessionEnded ? 'Sessão encerrada' : !state.started ? 'Pronto para iniciar' : cycle.checking ? 'Checagem de pulso' : running ? 'Em andamento' : 'Pausado';
  $('sessionStatus').className = `session-status ${state.sessionEnded ? 'ended' : cycle.checking ? 'checking' : running ? 'running' : state.started ? 'paused' : ''}`;
  $('adrenalineCount').textContent = String(state.events.filter(event => event.name === 'Adrenalina').length);
  document.querySelectorAll('[data-event], #customBtn').forEach(button => { button.disabled = !state.started || state.sessionEnded; });
}
function playAlertSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = state.audioContext || new AudioContextClass();
    state.audioContext = context;
    if (context.state === 'suspended') context.resume();
    [0, .32, .64].forEach(delay => {
      const oscillator = context.createOscillator(); const gain = context.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(.0001, context.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(.16, context.currentTime + delay + .02);
      gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + delay + .22);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(context.currentTime + delay); oscillator.stop(context.currentTime + delay + .23);
    });
  } catch {}
}
$('startPauseBtn').addEventListener('click', () => {
  if (!settings.soundEnabled) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass && !state.audioContext) state.audioContext = new AudioContextClass();
    if (state.audioContext?.state === 'suspended') state.audioContext.resume();
  } catch {}
});
function addEvent(name, kind = 'action') {
  if (!state.started || (state.sessionEnded && name !== 'Óbito')) return;
  const seconds = Math.floor(elapsedMs() / 1000);
  state.events.unshift({ name, kind, seconds, cycle: cycleInfo().number });
  renderEvents();
}
function renderEvents() {
  $('eventCount').textContent = `${state.events.length} ${state.events.length === 1 ? 'registro' : 'registros'}`;
  if (!state.events.length) {
    $('timelineBody').innerHTML = '<div class="empty-state"><span class="empty-symbol">↗</span></div>';
    return;
  }
  $('timelineBody').replaceChildren(...state.events.map(event => {
    const row = document.createElement('div'); row.className = 'event-row';
    const icon = document.createElement('span'); icon.className = `event-indicator ${event.kind}`; icon.textContent = event.name === 'Desfibrilação' ? '⚡' : event.name === 'Adrenalina' || event.kind === 'medication' ? '💉' : event.name === 'Óbito' ? '●' : '↗';
    const details = document.createElement('span'); details.className = 'event-details';
    const title = document.createElement('strong'); title.textContent = event.name;
    const subtitle = document.createElement('small'); subtitle.textContent = `Ciclo ${String(event.cycle).padStart(2,'0')} · ${event.kind === 'medication' ? 'Medicamento' : 'Intervenção'}`;
    details.append(title, subtitle);
    const time = document.createElement('span'); time.className = 'event-time'; time.textContent = formatTime(event.seconds);
    row.append(icon, details, time); return row;
  }));
}
$('startPauseBtn').addEventListener('click', () => {
  if (state.sessionEnded) return;
  if (state.runningSince !== null) { state.elapsedMs = elapsedMs(); state.runningSince = null; }
  else { state.runningSince = Date.now(); state.started = true; }
  draw();
  if (state.runningSince !== null) requestWakeLock(); else releaseWakeLock();
});
async function requestWakeLock() { try { if ('wakeLock' in navigator) state.wakeLock = await navigator.wakeLock.request('screen'); } catch {} }
function releaseWakeLock() { if (state.wakeLock) { state.wakeLock.release().catch(()=>{}); state.wakeLock = null; } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.runningSince !== null) requestWakeLock(); });
function registerAdrenaline() {
  if (!state.started || state.sessionEnded) return;
  addEvent('Adrenalina', 'medication');
  state.adrenalinePending = false;
  state.adrenalineAlertUntil = 0;
  state.adrenalineDueAt = Date.now() + settings.adrenalineSeconds * 1000;
  draw();
}
$('timerAdrenalineBtn').addEventListener('click', registerAdrenaline);
$('confirmAdrenaline').addEventListener('click', registerAdrenaline);
$('deathBtn').addEventListener('click', () => {
  if (!state.started || state.deathSeconds !== null) return;
  state.pendingDeathAt = new Date();
  state.pendingDeathElapsedMs = elapsedMs();
  $('deathDialog').showModal();
});
$('confirmDeath').addEventListener('click', event => {
  event.preventDefault();
  const deathAt = state.pendingDeathAt || new Date();
  state.deathSeconds = Math.floor((state.pendingDeathElapsedMs ?? elapsedMs()) / 1000);
  state.deathTime = deathAt.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
  $('deathTimeInput').value = formatClockTime(deathAt);
  $('evolutionFeedback').textContent = 'Horário do óbito preenchido. Se houve declaração médica, selecione esse desfecho na evolução.';
  state.elapsedMs = state.pendingDeathElapsedMs ?? elapsedMs(); state.runningSince = null; state.adrenalineAlertUntil = 0; state.adrenalinePending = false; state.adrenalineDueAt = null; state.sessionEnded = true;
  state.pendingDeathAt = null; state.pendingDeathElapsedMs = null;
  addEvent('Óbito', 'action'); releaseWakeLock(); $('deathDialog').close(); draw();
});
$('deathDialog').addEventListener('close', () => { state.pendingDeathAt = null; state.pendingDeathElapsedMs = null; });
document.querySelectorAll('[data-event]').forEach(button => button.addEventListener('click', () => {
  if (button.id === 'adrenalineBtn') {
    registerAdrenaline();
  } else addEvent(button.dataset.event, button.dataset.kind);
}));
$('resetBtn').addEventListener('click', () => {
  if (state.started && !confirm('Reiniciar a sessão e apagar os registros?')) return;
  state.elapsedMs = 0; state.runningSince = null; state.cycleOffsetMs = 0; state.events = []; state.started = false; state.lastReminderMinute = 0; state.adrenalineAlertUntil = 0; state.adrenalinePending = false; state.deathSeconds = null; state.deathTime = null; state.pendingDeathAt = null; state.pendingDeathElapsedMs = null; state.adrenalineDueAt = null; state.sessionEnded = false; releaseWakeLock(); $('evolutionText').value = ''; resizeEvolutionText(); $('shareEvolution').disabled = true; $('nativeShareEvolution').disabled = true; $('shareStatus').textContent = ''; renderEvents(); draw();
  resetOutcomeFields(); $('evolutionFeedback').textContent = '';
});
$('customBtn').addEventListener('click', () => { if (!state.started) return; $('customDialog').showModal(); $('customName').focus(); });
$('closeDialog').addEventListener('click', () => $('customDialog').close());
$('cancelDialog').addEventListener('click', () => $('customDialog').close());
$('customForm').addEventListener('submit', event => { event.preventDefault(); const name = $('customName').value.trim(); if (name) addEvent(name); $('customName').value = ''; $('customDialog').close(); });
function generateEvolution() {
  const outcome = $('outcomeSelect').value;
  const deathTime = $('deathTimeInput').value;
  if (outcome === 'death' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(deathTime)) {
    $('evolutionFeedback').textContent = 'Informe o horário do óbito no formato HH:MM para gerar a evolução.';
    $('deathTimeInput').focus(); return;
  }
  if (outcome === 'other' && !$('otherOutcomeText').value.trim()) {
    $('evolutionFeedback').textContent = 'Descreva o outro desfecho antes de gerar a evolução.';
    $('otherOutcomeText').focus(); return;
  }
  const totalSeconds = Math.floor(elapsedMs() / 1000);
  const cycles = state.started ? cycleInfo().number : 0;
  $('evolutionText').value = buildClinicalEvolution({
    events: state.events,
    totalSeconds,
    pcrStartTime: state.started ? new Date(Date.now() - totalSeconds * 1000) : null,
    cycles,
    cycleSeconds: settings.cycleSeconds,
    outcome,
    deathTime,
    physicianName: $('physicianInput').value,
    noRceConfirmed: $('noRceConfirmed').checked,
    socialWorkerContact: $('socialWorkerContact').checked,
    otherOutcome: $('otherOutcomeText').value,
    adrenalineIntervalSeconds: settings.adrenalineSeconds,
    postMortem: { devicesRemoved: $('careDevices').checked, bag: $('careBag').checked, identification: $('careId').checked, morgue: $('careMorgue').checked }
  });
  resizeEvolutionText();
  $('evolutionFeedback').textContent = outcome === 'death' && $('careMorgue').checked && !$('careDevices').checked
    ? 'Encaminhamento ao necrotério registrado sem confirmação da retirada dos dispositivos. Confira essa informação antes de copiar.'
    : '';
  $('shareEvolution').disabled = false;
  $('nativeShareEvolution').disabled = false;
}
$('generateEvolution').addEventListener('click', generateEvolution);
$('shareEvolution').addEventListener('click', async () => {
  const text = $('evolutionText').value; if (!text.trim()) return;
  try {
    const mode = await copyEvolutionText(text, navigator.clipboard);
    $('shareStatus').textContent = mode === 'formatted' ? 'Evolução copiada com alinhamento justificado para aplicativos que aceitam formatação.' : 'Evolução copiada em texto simples.';
  }
  catch { $('evolutionText').select(); $('shareStatus').textContent = 'Texto selecionado. Copie para compartilhar.'; }
});
$('nativeShareEvolution').addEventListener('click', async () => {
  const text = $('evolutionText').value;
  if (!text.trim()) return;
  try {
    const mode = await shareEvolutionText(text, navigator);
    $('shareStatus').textContent = mode === 'shared' ? 'Evolução enviada ao menu de compartilhamento.' : 'Compartilhamento direto indisponível; evolução copiada.';
  } catch (error) {
    if (error?.name !== 'AbortError') $('shareStatus').textContent = 'Não foi possível compartilhar. Use Copiar evolução.';
  }
});
$('evolutionText').addEventListener('input', () => {
  resizeEvolutionText();
  const hasText = !!$('evolutionText').value.trim();
  $('shareEvolution').disabled = !hasText;
  $('nativeShareEvolution').disabled = !hasText;
});
function resizeEvolutionText() {
  const field = $('evolutionText');
  field.style.height = 'auto';
  field.style.height = `${field.scrollHeight + 2}px`;
}
window.addEventListener('resize', resizeEvolutionText);
document.fonts?.ready.then(resizeEvolutionText);

function resetOutcomeFields() {
  $('outcomeSelect').value = 'none';
  $('deathTimeInput').value = '';
  $('physicianInput').value = '';
  $('noRceConfirmed').checked = false;
  $('socialWorkerContact').checked = false;
  $('otherOutcomeText').value = '';
  $('careDevices').checked = false; $('careBag').checked = false; $('careId').checked = false; $('careMorgue').checked = false;
  $('deathOutcomeFields').hidden = true; $('postMortemSection').hidden = true; $('otherOutcomeWrap').hidden = true;
}
$('outcomeSelect').addEventListener('change', () => {
  const outcome = $('outcomeSelect').value;
  $('deathOutcomeFields').hidden = outcome !== 'death';
  $('postMortemSection').hidden = outcome !== 'death';
  $('otherOutcomeWrap').hidden = outcome !== 'other';
  $('evolutionFeedback').textContent = '';
});
$('deathTimeInput').addEventListener('input', () => {
  const digits = $('deathTimeInput').value.replace(/\D/g, '').slice(0, 4);
  $('deathTimeInput').value = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
});
resetOutcomeFields();
resizeEvolutionText();
draw(); setInterval(draw, 250);

function fillSettingsForm() {
  $('cycleMinutesInput').value = String(settings.cycleSeconds / 60);
  $('pulseSecondsInput').value = String(settings.pulseCheckSeconds);
  $('adrenalineMinutesInput').value = String(settings.adrenalineSeconds / 60);
  $('soundEnabled').checked = settings.soundEnabled;
  $('vibrationEnabled').checked = settings.vibrationEnabled;
  $('settingsFeedback').textContent = '';
}
$('settingsOpen').addEventListener('click', () => { fillSettingsForm(); $('settingsDialog').showModal(); });
$('settingsClose').addEventListener('click', () => $('settingsDialog').close());
$('settingsCancel').addEventListener('click', () => $('settingsDialog').close());
$('settingsForm').addEventListener('submit', event => {
  event.preventDefault();
  if (state.started) { $('settingsFeedback').textContent = 'Encerre ou reinicie a sessão antes de alterar os intervalos.'; return; }
  const cycleSeconds = Number($('cycleMinutesInput').value) * 60;
  const pulseCheckSeconds = Number($('pulseSecondsInput').value);
  const adrenalineSeconds = Number($('adrenalineMinutesInput').value) * 60;
  if (!Number.isFinite(cycleSeconds) || !Number.isFinite(pulseCheckSeconds) || !Number.isFinite(adrenalineSeconds) || cycleSeconds <= 0 || pulseCheckSeconds < 0 || adrenalineSeconds <= 0) {
    $('settingsFeedback').textContent = 'Confira os valores antes de salvar.'; return;
  }
  settings = { cycleSeconds, pulseCheckSeconds, adrenalineSeconds, soundEnabled: $('soundEnabled').checked, vibrationEnabled: $('vibrationEnabled').checked };
  localStorage.setItem('ed-pulso-settings', JSON.stringify(settings));
  $('settingsDialog').close(); draw();
});
