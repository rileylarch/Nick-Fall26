const courses = [
  { id: '608', code: 'CHBE 608', name: 'Research at UMD', color: '#b9d6ed', categories: [], weights: {} },
  { id: '610', code: 'CHBE 610', name: 'Thermo', color: '#9fc8e8', categories: [], weights: {} },
  { id: '620', code: 'CHBE 620', name: 'Engineering Analysis', color: '#c6bde5', categories: [], weights: {} }
];

const seedAssignments = [];
const seedLogs = [];

let assignments = JSON.parse(localStorage.getItem('nickfall26.assignments') || 'null') || seedAssignments;
let logs = JSON.parse(localStorage.getItem('nickfall26.logs') || 'null') || seedLogs;
const categoryMigrations = { '411:Homework': 'Weekly homework', '483:Prototype / plans': 'Product Development Plan', '483:Reading': 'Book Reading', '483:Presentations': 'Prototype Demo 1', '483:Final pitch': 'Final PitchDeck' };
assignments = assignments.map(item => { const category = categoryMigrations[`${item.course}:${item.category}`] || item.category; return { ...item, category, weight: assignmentWeight(item.course, category) }; });
let currentView = 'overview';
let assignmentFilter = 'all';
const supabaseReady = window.FALL26_SUPABASE && !window.FALL26_SUPABASE.url.includes('PASTE_') && window.supabase;
const supabaseClient = supabaseReady ? window.supabase.createClient(window.FALL26_SUPABASE.url, window.FALL26_SUPABASE.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
let currentSession = null;

const app = document.querySelector('#app');
const moneyDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const fullDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const today = new Date('2026-08-18T12:00:00');

document.querySelector('#todayLabel').textContent = fullDate.format(today);
document.querySelector('#assignmentCourse').innerHTML = courseOptions();
document.querySelector('#timeCourse').innerHTML = courseOptions();
document.querySelector('#assignmentCourse').addEventListener('change', updateCategoryOptions);
document.querySelector('#assignmentCategory').addEventListener('change', updateAssignmentWeight);
updateCategoryOptions();

document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));
document.querySelector('#quickAdd').addEventListener('click', () => openAssignment());
document.querySelector('#assignmentForm').addEventListener('submit', saveAssignment);
document.querySelector('#timeForm').addEventListener('submit', saveTime);
document.querySelector('#authButton').addEventListener('click', () => currentSession ? signOut() : document.querySelector('#authDialog').showModal());
document.querySelector('#authForm').addEventListener('submit', signIn);
document.querySelectorAll('.close-button, .modal .ghost').forEach(button => button.addEventListener('click', event => {
  event.preventDefault();
  button.closest('dialog').close();
}));
renderRail();
render();
initializeSharedData();

function persist() {
  localStorage.setItem('nickfall26.assignments', JSON.stringify(assignments));
  localStorage.setItem('nickfall26.logs', JSON.stringify(logs));
}
async function initializeSharedData() {
  if (!supabaseClient) return updateAuthButton();
  const { data: sessionData } = await supabaseClient.auth.getSession();
  currentSession = sessionData.session;
  await loadSharedData();
  supabaseClient.auth.onAuthStateChange(async (_event, session) => { currentSession = session; updateAuthButton(); if (session) await loadSharedData(); });
  updateAuthButton();
}
async function loadSharedData() {
  const localAssignments = assignments.slice();
  const localLogs = logs.slice();
  const [{ data: remoteAssignments, error: assignmentError }, { data: remoteLogs, error: logError }] = await Promise.all([
    supabaseClient.from('assignments').select('*'),
    supabaseClient.from('time_logs').select('*')
  ]);
  if (assignmentError || logError) return showSyncMessage('Supabase is connected, but the tables are not ready yet.');
  if (!remoteAssignments?.length && currentSession && localAssignments.length) await supabaseClient.from('assignments').upsert(localAssignments.map(assignmentPayload));
  if (!remoteLogs?.length && currentSession && localLogs.length) await supabaseClient.from('time_logs').upsert(localLogs.map(logPayload));
  assignments = remoteAssignments?.length ? remoteAssignments.map(item => ({ ...item, course: item.course_id, due: item.due_date || '', id: item.id, weight: assignmentWeight(item.course_id, item.category) || Number(item.weight) || 0 })) : localAssignments;
  logs = remoteLogs?.length ? remoteLogs.map(item => ({ ...item, course: item.course_id, date: item.log_date, id: item.id })) : localLogs;
  persist(); renderRail(); render();
}
function updateAuthButton() { const button = document.querySelector('#authButton'); if (button) button.textContent = currentSession ? 'Sign out' : 'Sign in'; }
function showSyncMessage(message) { const target = document.querySelector('.sidebar-bottom'); if (target && supabaseReady) target.innerHTML = `<span class="status-dot"></span> ${message}<br><span class="source-note">Local fallback remains active</span>`; }
async function signIn(event) { event.preventDefault(); if (!supabaseClient) { const message = !window.FALL26_SUPABASE || window.FALL26_SUPABASE.url.includes('PASTE_') ? 'Add your Supabase URL and public key to supabase-config.js first.' : 'The Supabase browser library did not load. Refresh the page, then try again.'; document.querySelector('#authMessage').textContent = message; return; } const data = Object.fromEntries(new FormData(event.target).entries()); const { error } = await supabaseClient.auth.signInWithPassword({ email: data.email, password: data.password }); document.querySelector('#authMessage').textContent = error ? error.message : 'Signed in. Shared editing is enabled.'; if (!error) document.querySelector('#authDialog').close(); }
async function signOut() { await supabaseClient.auth.signOut(); currentSession = null; updateAuthButton(); }
function assignmentPayload(item) { return { id: item.id, course_id: item.course, name: item.name, category: item.category, due_date: item.due || null, weight: Number(item.weight) || 0, status: item.status, earned: item.earned === '' ? null : Number(item.earned), possible: Number(item.possible) || 100, notes: item.notes || '' }; }
function logPayload(item) { return { id: item.id, course_id: item.course, log_date: item.date, hours: Number(item.hours), kind: item.kind, note: item.note || '' }; }
async function syncSharedData() { if (!supabaseClient || !currentSession) return; const { error } = await supabaseClient.from('assignments').upsert(assignments.map(assignmentPayload)); if (error) showSyncMessage(error.message); else await supabaseClient.from('time_logs').upsert(logs.map(logPayload)); }
async function deleteShared(table, id) { if (!supabaseClient || !currentSession) return; await supabaseClient.from(table).delete().eq('id', id); }
function courseById(id) { return courses.find(course => course.id === id); }
function courseOptions() { return courses.map(course => `<option value="${course.id}">${course.code} - ${course.name}</option>`).join(''); }
function assignmentWeight(courseId, category) { return Number(courseById(courseId)?.weights?.[category] || 0); }
function updateCategoryOptions() {
  const course = courseById(document.querySelector('#assignmentCourse').value || '608');
  document.querySelector('#assignmentCategory').innerHTML = course.categories.length ? course.categories.map(category => `<option>${category}</option>`).join('') : '<option>Uncategorized</option>';
  updateAssignmentWeight();
}
function updateAssignmentWeight() {
  const courseId = document.querySelector('#assignmentCourse').value || '608';
  document.querySelector('#assignmentForm [name="weight"]').value = assignmentWeight(courseId, document.querySelector('#assignmentCategory').value);
}
function navigate(view) {
  currentView = view;
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  render();
}
function renderRail() {
  document.querySelector('#courseRail').innerHTML = courses.map(course => `<div class="rail-course"><i class="course-dot" style="background:${course.color}"></i>${course.code}<span class="source-tag">${assignments.filter(item => item.course === course.id && item.status !== 'done').length} open</span></div>`).join('');
}
function save() { persist(); renderRail(); render(); syncSharedData(); }
function formatDue(date) { return date ? moneyDate.format(new Date(`${date}T12:00:00`)) : 'TBD'; }
function daysUntil(date) { return date ? Math.ceil((new Date(`${date}T12:00:00`) - today) / 86400000) : 999; }
function categoryScore(course, category, entries) {
  const scores = entries.filter(item => item.category === category).map(item => Number(item.earned) / Number(item.possible) * 100).sort((a, b) => a - b);
  const kept = scores.slice(course.drops?.[category] || 0);
  return kept.length ? kept.reduce((sum, score) => sum + score, 0) / kept.length : null;
}
function courseGrade(courseId) {
  const course = courseById(courseId);
  const graded = assignments.filter(item => item.course === courseId && item.earned !== '' && item.earned !== null && Number(item.possible) > 0);
  if (!graded.length) return null;
  const activeCategories = course.categories.filter(category => graded.some(item => item.category === category));
  const activeWeight = activeCategories.reduce((sum, category) => sum + course.weights[category], 0);
  return activeCategories.reduce((sum, category) => {
    return sum + categoryScore(course, category, graded) * course.weights[category];
  }, 0) / activeWeight;
}
function completion(courseId) {
  const mine = assignments.filter(item => item.course === courseId);
  return mine.length ? Math.round(mine.filter(item => item.status === 'done').length / mine.length * 100) : 0;
}
function assignmentCard(item, compact = false) {
  const course = courseById(item.course);
  const statusLabel = item.status === 'done' ? 'Done' : item.status === 'progress' ? 'In progress' : 'To do';
  return `<div class="assignment-row" data-id="${item.id}"><i class="course-dot" style="background:${course.color}"></i><div><div class="assignment-name">${item.name}</div><div class="assignment-meta">${course.code} / ${item.category} <span class="source-tag">${item.due ? (daysUntil(item.due) < 0 ? 'past due' : `${daysUntil(item.due)} days`) : 'date pending'}</span></div>${compact ? '' : `<div class="assignment-meta">${item.notes || ''}</div>`}</div><div class="assignment-right"><span class="pill ${item.status}">${statusLabel}</span><div class="weight">${item.weight ? `${item.weight}%` : 'unweighted'} · ${formatDue(item.due)}</div>${!compact ? `<button class="text-button edit-assignment" data-id="${item.id}">Edit</button><button class="delete-button delete-assignment" data-id="${item.id}" aria-label="Delete assignment">×</button>` : ''}</div></div>`;
}
function upcoming(limit = 4) { return assignments.filter(item => item.status !== 'done' && (item.due || item.notes)).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')).slice(0, limit); }
function render() {
  if (currentView === 'overview') renderOverview();
  if (currentView === 'assignments') renderAssignments();
  if (currentView === 'grades') renderGrades();
  if (currentView === 'timesheet') renderTimesheet();
  document.querySelector('#assignmentCount').textContent = assignments.filter(item => item.status !== 'done').length;
  document.querySelectorAll('.edit-assignment').forEach(button => button.addEventListener('click', () => openAssignment(button.dataset.id)));
  document.querySelectorAll('[data-action="navigate"]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));
}
function header(kicker, title, description, action = '') { title = title === 'Your semester, in one place.' ? "Nick's Fall 2026 Semester" : title; return `<div class="page-heading"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${description}</p></div>${action}</div>`; }
function weeklyCalendar() {
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(weekStart); date.setDate(weekStart.getDate() + index); return date; });
  const datedAssignments = assignments.filter(item => item.due && item.status !== 'done');
  const columns = days.map(date => { const key = date.toISOString().slice(0, 10); const dayAssignments = datedAssignments.filter(item => item.due === key); return `<div class="calendar-day"><div class="calendar-day-head"><span>${date.toLocaleDateString('en-US', { weekday: 'short' })}</span><b>${date.getDate()}</b></div><div class="calendar-items">${dayAssignments.map(item => { const course = courseById(item.course); return `<button class="calendar-item" data-calendar-assignment="${item.id}" style="--course-color:${course.color}"><strong>${item.name}</strong><small>${course.code}</small></button>`; }).join('') || '<span class="calendar-empty">—</span>'}</div></div>`; }).join('');
  const undated = assignments.filter(item => !item.due && item.status !== 'done');
  return `<section class="calendar-section"><div class="section-head"><div><h2>This week</h2><span class="source-note">Assignments with a due date appear automatically</span></div><button class="text-button" data-action="navigate" data-view="assignments">Manage assignments</button></div><div class="weekly-calendar">${columns}</div>${undated.length ? `<div class="calendar-pending"><span class="eyebrow">Dates to confirm</span>${undated.slice(0, 4).map(item => `<span>${item.name} · ${courseById(item.course).code}</span>`).join('')}</div>` : ''}</section>`;
}
function renderOverview() {
  const open = assignments.filter(item => item.status !== 'done');
  const hours = logs.reduce((sum, item) => sum + Number(item.hours), 0);
  const graded = courses.map(course => courseGrade(course.id)).filter(Boolean);
  const average = graded.length ? graded.reduce((sum, value) => sum + value, 0) / graded.length : null;
  app.innerHTML = `<div class="page">${header('Tuesday / August 18, 2026', 'Your semester, in one place.', 'A calm view of what is due, how your grades are moving, and where your time is going.', '<button class="button primary" id="overviewAdd">+ Add assignment</button>')}<div class="stats"><div class="stat"><div class="stat-label">Open assignments</div><div class="stat-value">${open.length}</div></div><div class="stat"><div class="stat-label">Current average</div><div class="stat-value">${average ? `${average.toFixed(1)}%` : '--'}</div></div><div class="stat"><div class="stat-label">Logged this term</div><div class="stat-value">${hours.toFixed(1)}h</div></div><div class="stat"><div class="stat-label">Completed</div><div class="stat-value">${assignments.length ? Math.round(assignments.filter(item => item.status === 'done').length / assignments.length * 100) : 0}%</div></div></div>${weeklyCalendar()}<div class="split"><section class="section"><div class="section-head"><h2>Next on your radar</h2><button class="text-button" data-action="navigate" data-view="assignments">View all</button></div>${upcoming().map(item => assignmentCard(item, true)).join('') || '<div class="empty">Nothing waiting. Add your first assignment.</div>'}</section><section class="section"><div class="section-head"><h2>Course pulse</h2><button class="text-button" data-action="navigate" data-view="grades">Open grades</button></div><div class="course-cards">${courses.map(course => `<div class="course-card"><div class="course-card-top"><div class="course-code">${course.code}</div><i class="course-dot" style="background:${course.color}"></i></div><div class="course-name">${course.name}</div><div class="progress-line"><span style="width:${completion(course.id)}%"></span></div><div class="course-footer"><span>${completion(course.id)}% complete</span><span class="progress-number">${courseGrade(course.id) ? `${courseGrade(course.id).toFixed(1)}%` : '--'}</span></div></div>`).join('')}</div></section></div></div>`;
  document.querySelector('#overviewAdd').addEventListener('click', () => openAssignment());
  document.querySelectorAll('[data-calendar-assignment]').forEach(button => button.addEventListener('click', () => openAssignment(button.dataset.calendarAssignment)));
}
function renderAssignments() {
  const visible = assignments.filter(item => assignmentFilter === 'all' || item.course === assignmentFilter).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  app.innerHTML = `<div class="page">${header('Work queue', 'Assignments', 'Track every deliverable from the supplied course materials, then add the details your instructors release.', '<button class="button primary" id="assignAdd">+ Add assignment</button>')}<div class="filter-row"><select id="assignmentFilter"><option value="all">All classes</option>${courses.map(course => `<option value="${course.id}" ${assignmentFilter === course.id ? 'selected' : ''}>${course.code}</option>`).join('')}</select><span class="source-note">${visible.length} records · dates marked TBD need confirmation in Moodle</span></div>${visible.map(item => assignmentCard(item)).join('') || '<div class="empty">No assignments in this view.</div>'}</div>`;
  document.querySelector('#assignAdd').addEventListener('click', () => openAssignment());
  document.querySelector('#assignmentFilter').addEventListener('change', event => { assignmentFilter = event.target.value; renderAssignments(); bindDynamic(); });
  bindDynamic();
}
function bindDynamic() {
  document.querySelectorAll('.edit-assignment').forEach(button => button.addEventListener('click', () => openAssignment(button.dataset.id)));
  document.querySelectorAll('.delete-assignment').forEach(button => button.addEventListener('click', () => { assignments = assignments.filter(item => item.id !== button.dataset.id); deleteShared('assignments', button.dataset.id); save(); }));
}
function renderGrades() {
  app.innerHTML = `<div class="page">${header('Gradebook', 'Grades', 'Only graded work counts toward the current grade. Empty categories are excluded until you enter a score.', '<button class="button primary" id="gradeAdd">+ Add graded work</button>')}<div class="table-wrap"><table><thead><tr><th>Course</th><th>Current grade</th><th>Graded weight</th><th>Category breakdown</th><th>Open work</th></tr></thead><tbody>${courses.map(course => { const mine = assignments.filter(item => item.course === course.id); const graded = mine.filter(item => item.earned !== '' && item.earned !== null && Number(item.possible) > 0); const activeWeight = course.categories.filter(category => graded.some(item => item.category === category)).reduce((sum, category) => sum + course.weights[category], 0); const categories = course.categories.map(category => { const score = categoryScore(course, category, graded); if (score === null) return `<span class="grade-muted">${category} (${course.weights[category]}%): --</span>`; const dropNote = course.drops?.[category] ? `, drops ${course.drops[category]}` : ''; return `<span>${category} (${course.weights[category]}%${dropNote}): ${score.toFixed(0)}%</span>`; }).join('<br>'); return `<tr><td><div class="log-course"><i class="course-dot" style="background:${course.color};display:inline-block;margin-right:7px"></i>${course.code}</div><div class="assignment-meta">${course.name}</div></td><td><div class="grade-number ${courseGrade(course.id) === null ? 'grade-muted' : ''}">${courseGrade(course.id) === null ? '--' : `${courseGrade(course.id).toFixed(1)}%`}</div></td><td>${activeWeight ? `${activeWeight}% of course` : '--'}<div class="grade-bar"><span style="width:${Math.min(activeWeight, 100)}%"></span></div></td><td>${categories}</td><td>${mine.filter(item => item.status !== 'done').length}</td></tr>`; }).join('')}</tbody></table></div></div>`;
  document.querySelector('#gradeAdd').addEventListener('click', () => openAssignment());
}
function renderTimesheet() {
  const total = logs.reduce((sum, item) => sum + Number(item.hours), 0);
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - 6);
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(weekStart); date.setDate(weekStart.getDate() + index); const key = date.toISOString().slice(0, 10); return { key, label: date.toLocaleDateString('en-US', { weekday: 'short' }), hours: logs.filter(item => item.date === key).reduce((sum, item) => sum + Number(item.hours), 0) }; });
  const max = Math.max(...days.map(day => day.hours), 2);
  app.innerHTML = `<div class="page">${header('Study rhythm', 'Time sheet', 'Log the work behind the grades. A small, honest record makes uneven weeks visible before they become stressful.', '<button class="button primary" id="timeAdd">+ Log time</button>')}<div class="time-summary"><div class="time-total"><div class="stat-label">All logged time</div><strong>${total.toFixed(1)}h</strong></div><div class="time-total"><div class="stat-label">This week</div><strong>${days.reduce((sum, day) => sum + day.hours, 0).toFixed(1)}h</strong></div></div><div class="section-head"><h2>Last 7 days</h2></div><div class="bar-chart">${days.map(day => `<div class="bar-day"><span class="bar-hours">${day.hours ? `${day.hours}h` : ''}</span><div class="bar-fill" style="height:${Math.max(day.hours / max * 125, 3)}px"></div><span>${day.label}</span></div>`).join('')}</div><div class="section-head" style="margin-top:34px"><h2>Recent entries</h2><span class="source-note">${logs.length} total logs</span></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Class</th><th>Focus</th><th>Hours</th><th>Note</th><th></th></tr></thead><tbody>${logs.slice().sort((a, b) => b.date.localeCompare(a.date)).map(log => { const course = courseById(log.course); return `<tr><td>${formatDue(log.date)}</td><td><span class="log-course"><i class="course-dot" style="background:${course.color};display:inline-block;margin-right:7px"></i>${course.code}</span></td><td>${log.kind}</td><td><b>${Number(log.hours).toFixed(2)}h</b></td><td>${log.note || '--'}</td><td><button class="delete-button" data-log="${log.id}" aria-label="Delete log">×</button></td></tr>`; }).join('') || '<tr><td colspan="6" class="empty">No time logged yet.</td></tr>'}</tbody></table></div></div>`;
  document.querySelector('#timeAdd').addEventListener('click', () => document.querySelector('#timeDialog').showModal());
  document.querySelectorAll('[data-log]').forEach(button => button.addEventListener('click', () => { logs = logs.filter(log => log.id !== button.dataset.log); deleteShared('time_logs', button.dataset.log); save(); }));
}
function openAssignment(id = '') {
  const form = document.querySelector('#assignmentForm'); form.reset(); form.dataset.editId = id;
  const item = assignments.find(assignment => assignment.id === id);
  form.elements.course.value = item?.course || '608';
  updateCategoryOptions();
  if (item && courseById(item.course)?.categories.includes(item.category)) form.elements.category.value = item.category;
  form.elements.weight.value = assignmentWeight(form.elements.course.value, form.elements.category.value) || Number(item?.weight) || 0;
  if (item) ['name', 'due', 'status', 'earned', 'possible', 'notes'].forEach(key => { if (form.elements[key]) form.elements[key].value = item[key] ?? ''; });
  document.querySelector('#assignmentDialog').showModal();
}
function saveAssignment(event) {
  event.preventDefault(); const form = event.target; const data = Object.fromEntries(new FormData(form).entries());
  const existing = assignments.find(item => item.id === form.dataset.editId);
  const item = { ...data, id: existing?.id || `a${Date.now()}`, weight: assignmentWeight(data.course, data.category) || Number(existing?.weight) || 0, possible: Number(data.possible) || 100 };
  if (existing) assignments = assignments.map(entry => entry.id === existing.id ? item : entry); else assignments.push(item);
  document.querySelector('#assignmentDialog').close(); save();
}
function saveTime(event) {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.target).entries());
  logs.push({ ...data, id: `t${Date.now()}`, hours: Number(data.hours) }); document.querySelector('#timeDialog').close(); save();
}
