const courses = [
  { id: '608', code: 'CHBE 608', name: 'Research at UMD', color: '#b9d6ed', categories: ['Literature review', 'Research notebook', 'Project update'], weights: { 'Literature review': 30, 'Research notebook': 25, 'Project update': 45 } },
  { id: '610', code: 'CHBE 610', name: 'Thermo', color: '#9fc8e8', categories: ['Homework', 'Quiz', 'Midterm', 'Final'], weights: { Homework: 20, Quiz: 15, Midterm: 25, Final: 40 } },
  { id: '620', code: 'CHBE 620', name: 'Engineering Analysis', color: '#c6bde5', categories: ['Homework', 'Problem sets', 'Project', 'Final exam'], weights: { Homework: 25, 'Problem sets': 20, Project: 25, 'Final exam': 30 } }
];

const seedAssignments = [
  { id: 'n1', course: '608', name: 'Initial literature review', category: 'Literature review', due: '2026-09-03', weight: 30, status: 'todo', earned: '', possible: 100, notes: 'Set up a research question and summarize the relevant papers.' },
  { id: 'n2', course: '610', name: 'Thermo homework 1', category: 'Homework', due: '2026-09-02', weight: 20, status: 'todo', earned: '', possible: 100, notes: 'Review the problem set after lecture.' },
  { id: 'n3', course: '620', name: 'Engineering analysis problem set', category: 'Problem sets', due: '2026-09-05', weight: 20, status: 'todo', earned: '', possible: 100, notes: 'Check the course LMS for the required format.' }
];
const seedLogs = [
  { id: 'nlog1', course: '608', date: '2026-08-17', hours: 1.5, kind: 'Reading', note: 'Reviewed research topics and campus resources' },
  { id: 'nlog2', course: '610', date: '2026-08-18', hours: 2, kind: 'Lecture / class', note: 'Thermo intro and system overview' },
  { id: 'nlog3', course: '620', date: '2026-08-19', hours: 1.25, kind: 'Homework', note: 'Worked through the beginning of the analysis set' }
];

let assignments = JSON.parse(localStorage.getItem('nickfall26.assignments') || 'null') || seedAssignments;
let logs = JSON.parse(localStorage.getItem('nickfall26.logs') || 'null') || seedLogs;
let todos = JSON.parse(localStorage.getItem('nickfall26.todos') || 'null') || [];
const categoryMigrations = { '411:Homework': 'Weekly homework', '483:Prototype / plans': 'Product Development Plan', '483:Reading': 'Book Reading', '483:Presentations': 'Prototype Demo 1', '483:Final pitch': 'Final PitchDeck' };
assignments = assignments.map(item => { const category = categoryMigrations[`${item.course}:${item.category}`] || item.category; return { ...item, category, weight: assignmentWeight(item.course, category) }; });
todos = todos.map(item => ({ ...item, date: item.date || '', carried: Boolean(item.carried) }));
let currentView = 'overview';
let assignmentFilter = 'all';
const supabaseReady = window.FALL26_SUPABASE && !window.FALL26_SUPABASE.url.includes('PASTE_') && window.supabase;
const supabaseClient = supabaseReady ? window.supabase.createClient(window.FALL26_SUPABASE.url, window.FALL26_SUPABASE.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
let currentSession = null;

function requireAuth(action = 'edit this') {
  if (!currentSession) {
    const authDialog = document.querySelector('#authDialog');
    if (authDialog) authDialog.showModal();
    const authMessage = document.querySelector('#authMessage');
    if (authMessage) authMessage.textContent = `Please sign in to ${action}.`;
    return false;
  }
  return true;
}

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
document.querySelector('#quickAdd').addEventListener('click', () => { if (requireAuth('add assignments')) openAssignment(); });
document.querySelector('#assignmentForm').addEventListener('submit', event => { if (requireAuth('save assignments')) saveAssignment(event); });
document.querySelector('#timeForm').addEventListener('submit', event => { if (requireAuth('log time')) saveTime(event); });
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
  localStorage.setItem('nickfall26.todos', JSON.stringify(todos));
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
  const localTodos = todos.slice();
  const [{ data: remoteAssignments, error: assignmentError }, { data: remoteLogs, error: logError }, { data: remoteTodos, error: todoError }] = await Promise.all([
    supabaseClient.from('assignments').select('*'),
    supabaseClient.from('time_logs').select('*'),
    supabaseClient.from('todos').select('*')
  ]);
  if (assignmentError || logError || todoError) return showSyncMessage('Supabase is connected, but the tables are not ready yet.');
  if (!remoteAssignments?.length && currentSession && localAssignments.length) await supabaseClient.from('assignments').upsert(localAssignments.map(assignmentPayload));
  if (!remoteLogs?.length && currentSession && localLogs.length) await supabaseClient.from('time_logs').upsert(localLogs.map(logPayload));
  if (!remoteTodos?.length && currentSession && localTodos.length) await supabaseClient.from('todos').upsert(localTodos.map(todoPayload));
  assignments = remoteAssignments?.length ? remoteAssignments.map(item => ({ ...item, course: item.course_id, due: item.due_date || '', id: item.id, scoreEntered: Number(item.earned) !== 0 && item.earned !== null, weight: assignmentWeight(item.course_id, item.category) || Number(item.weight) || 0 })) : localAssignments;
  logs = remoteLogs?.length ? remoteLogs.map(item => ({ ...item, course: item.course_id, date: item.log_date, id: item.id })) : localLogs;
  todos = remoteTodos?.length ? remoteTodos.map(item => ({ ...item, date: item.todo_date, carried: Boolean(item.carried) })) : localTodos;
  persist(); renderRail(); render();
}
function updateAuthButton() { const button = document.querySelector('#authButton'); if (button) button.textContent = currentSession ? 'Sign out' : 'Sign in'; }
function showSyncMessage(message) { const target = document.querySelector('.sidebar-bottom'); if (target && supabaseReady) target.innerHTML = `<span class="status-dot"></span> ${message}<br><span class="source-note">Shared data status</span>`; }
async function signIn(event) { event.preventDefault(); if (!supabaseClient) { const message = !window.FALL26_SUPABASE || window.FALL26_SUPABASE.url.includes('PASTE_') ? 'Add your Supabase URL and public key to supabase-config.js first.' : 'The Supabase browser library did not load. Refresh the page, then try again.'; document.querySelector('#authMessage').textContent = message; return; } const data = Object.fromEntries(new FormData(event.target).entries()); const { error } = await supabaseClient.auth.signInWithPassword({ email: data.email, password: data.password }); document.querySelector('#authMessage').textContent = error ? error.message : 'Signed in. Shared editing is enabled.'; if (!error) document.querySelector('#authDialog').close(); }
async function signOut() { if (supabaseClient) await supabaseClient.auth.signOut(); currentSession = null; updateAuthButton(); render(); }
function hasEarnedScore(item) { return item.earned !== '' && item.earned !== null && item.earned !== undefined && Number.isFinite(Number(item.earned)) && (Number(item.earned) !== 0 || item.scoreEntered === true); }
function assignmentPayload(item) { return { id: item.id, course_id: item.course, name: item.name, category: item.category, due_date: item.due || null, weight: Number(item.weight) || 0, status: item.status, earned: hasEarnedScore(item) ? Number(item.earned) : null, possible: Number(item.possible) || 100, notes: item.notes || '' }; }
function logPayload(item) { return { id: item.id, course_id: item.course, log_date: item.date, hours: Number(item.hours), kind: item.kind, note: item.note || '' }; }
function todoPayload(item) { return { id: item.id, text: item.text, todo_date: item.date || today.toISOString().slice(0, 10), done: Boolean(item.done), carried: Boolean(item.carried) }; }
async function syncSharedData() {
  if (!supabaseClient || !currentSession) return;
  const { error: assignmentError } = await supabaseClient.from('assignments').upsert(assignments.map(assignmentPayload), { onConflict: 'id' });
  if (assignmentError) { showSyncMessage(`Assignment sync failed: ${assignmentError.message}`); return; }
  const { error: logError } = await supabaseClient.from('time_logs').upsert(logs.map(logPayload), { onConflict: 'id' });
  if (logError) { showSyncMessage(`Time log sync failed: ${logError.message}`); return; }
  const { error: todoError } = await supabaseClient.from('todos').upsert(todos.map(todoPayload), { onConflict: 'id' });
  if (todoError) { showSyncMessage(`To-do sync failed: ${todoError.message}`); return; }
  showSyncMessage('All changes synced to Supabase.');
}
async function deleteShared(table, id) { if (!supabaseClient || !currentSession) return; await supabaseClient.from(table).delete().eq('id', id); }
function courseById(id) { return courses.find(course => course.id === id); }
function courseOptions() { return courses.map(course => `<option value="${course.id}">${course.code} - ${course.name}</option>`).join(''); }
function assignmentWeight(courseId, category) { return Number(courseById(courseId)?.weights?.[category] || 0); }
function updateCategoryOptions() {
  const course = courseById(document.querySelector('#assignmentCourse').value || '302');
  document.querySelector('#assignmentCategory').innerHTML = course.categories.map(category => `<option>${category}</option>`).join('');
  updateAssignmentWeight();
}
function updateAssignmentWeight() {
  const courseId = document.querySelector('#assignmentCourse').value || '302';
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
function escapeHTML(value) { return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
function prepareTodos() {
  const todayKey = today.toISOString().slice(0, 10);
  let changed = false;
  todos = todos.map(item => {
    if (!item.done && item.date < todayKey) { changed = true; return { ...item, date: todayKey, carried: true }; }
    return item;
  });
  if (changed) persist();
}
function todoList() {
  prepareTodos();
  const todayKey = today.toISOString().slice(0, 10);
  const items = todos.filter(item => item.date === todayKey);
  const formMarkup = currentSession ? `<form class="todo-form" id="todoForm"><input name="text" required placeholder="Add something to get done today..." aria-label="New to-do"><button class="button primary" type="submit">Add</button></form>` : '';
  return `<section class="section todo-section"><div class="section-head"><div><h2>Today's to-do list</h2><span class="source-note">Unfinished items carry forward automatically</span></div><span class="todo-count">${items.filter(item => !item.done).length} open</span></div>${formMarkup}<div class="todo-list">${items.map(item => `<div class="todo-item ${item.done ? 'done' : ''} ${item.carried ? 'carried' : ''}"><label><input type="checkbox" data-todo="${item.id}" ${item.done ? 'checked' : ''} ${currentSession ? '' : 'disabled'}><span>${escapeHTML(item.text)}</span></label>${currentSession ? `<button class="delete-button" data-delete-todo="${item.id}" aria-label="Delete to-do">×</button>` : ''}${item.carried && !item.done ? '<small>Carried over from yesterday</small>' : ''}</div>`).join('') || '<div class="empty">Your list is clear. Add the first thing you want to finish.</div>'}</div></section>`;
}
function bindTodos() {
  const todoForm = document.querySelector('#todoForm');
  if (todoForm) {
    todoForm.addEventListener('submit', event => { if (!requireAuth('add to-dos')) return; event.preventDefault(); const text = new FormData(event.target).get('text').trim(); if (!text) return; todos.push({ id: `todo${Date.now()}`, text, date: today.toISOString().slice(0, 10), done: false, carried: false }); save(); });
  }
  document.querySelectorAll('[data-todo]').forEach(input => input.addEventListener('change', event => { if (!requireAuth('update to-dos')) return; todos = todos.map(item => item.id === event.target.dataset.todo ? { ...item, done: event.target.checked } : item); save(); }));
  document.querySelectorAll('[data-delete-todo]').forEach(button => button.addEventListener('click', () => { if (!requireAuth('delete to-dos')) return; const id = button.dataset.deleteTodo; todos = todos.filter(item => item.id !== id); deleteShared('todos', id); save(); }));
}
function formatDue(date) { return date ? moneyDate.format(new Date(`${date}T12:00:00`)) : 'TBD'; }
function daysUntil(date) { return date ? Math.ceil((new Date(`${date}T12:00:00`) - today) / 86400000) : 999; }
function categoryScore(course, category, entries) {
  const scores = entries.filter(item => item.category === category).map(item => Number(item.earned) / Number(item.possible) * 100).sort((a, b) => a - b);
  const kept = scores.slice(course.drops?.[category] || 0);
  return kept.length ? kept.reduce((sum, score) => sum + score, 0) / kept.length : null;
}
function courseGrade(courseId) {
  const course = courseById(courseId);
  const graded = assignments.filter(item => item.course === courseId && hasEarnedScore(item) && Number(item.possible) > 0);
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
  const actionButtons = !compact && currentSession ? `<button class="text-button edit-assignment" data-id="${item.id}">Edit</button><button class="delete-button delete-assignment" data-id="${item.id}" aria-label="Delete assignment">×</button>` : '';
  return `<div class="assignment-row" data-id="${item.id}"><i class="course-dot" style="background:${course.color}"></i><div><div class="assignment-name">${item.name}</div><div class="assignment-meta">${course.code} / ${item.category} <span class="source-tag">${item.due ? (daysUntil(item.due) < 0 ? 'past due' : `${daysUntil(item.due)} days`) : 'date pending'}</span></div>${compact ? '' : `<div class="assignment-meta">${item.notes || ''}</div>`}</div><div class="assignment-right"><span class="pill ${item.status}">${statusLabel}</span><div class="weight">${item.weight ? `${item.weight}%` : 'unweighted'} · ${formatDue(item.due)}</div>${actionButtons}</div></div>`;
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
  app.innerHTML = `<div class="page">${header('Tuesday / August 18, 2026', 'Your semester, in one place.', 'A calm view of what is due, how your grades are moving, and where your time is going.', currentSession ? '<button class="button primary" id="overviewAdd">+ Add assignment</button>' : '')}<div class="stats"><div class="stat"><div class="stat-label">Open assignments</div><div class="stat-value">${open.length}</div></div><div class="stat"><div class="stat-label">Current average</div><div class="stat-value">${average ? `${average.toFixed(1)}%` : '--'}</div></div><div class="stat"><div class="stat-label">Logged this term</div><div class="stat-value">${hours.toFixed(1)}h</div></div><div class="stat"><div class="stat-label">Completed</div><div class="stat-value">${assignments.length ? Math.round(assignments.filter(item => item.status === 'done').length / assignments.length * 100) : 0}%</div></div></div>${weeklyCalendar()}<div class="split"><section class="section"><div class="section-head"><h2>Next on your radar</h2><button class="text-button" data-action="navigate" data-view="assignments">View all</button></div>${upcoming().map(item => assignmentCard(item, true)).join('') || '<div class="empty">Nothing waiting. Add your first assignment.</div>'}</section>${todoList()}</div></div>`;
  document.querySelector('#overviewAdd')?.addEventListener('click', () => { if (requireAuth('add assignments')) openAssignment(); });
  document.querySelectorAll('[data-calendar-assignment]').forEach(button => button.addEventListener('click', () => openAssignment(button.dataset.calendarAssignment)));
  bindTodos();
}
function renderAssignments() {
  const visible = assignments.filter(item => assignmentFilter === 'all' || item.course === assignmentFilter).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  app.innerHTML = `<div class="page">${header('Work queue', 'Assignments', 'Track every deliverable from the supplied course materials, then add the details your instructors release.', currentSession ? '<button class="button primary" id="assignAdd">+ Add assignment</button>' : '')}<div class="filter-row"><select id="assignmentFilter"><option value="all">All classes</option>${courses.map(course => `<option value="${course.id}" ${assignmentFilter === course.id ? 'selected' : ''}>${course.code}</option>`).join('')}</select><span class="source-note">${visible.length} records · dates marked TBD need confirmation in Moodle</span></div>${visible.map(item => assignmentCard(item)).join('') || '<div class="empty">No assignments in this view.</div>'}</div>`;
  document.querySelector('#assignAdd')?.addEventListener('click', () => { if (requireAuth('add assignments')) openAssignment(); });
  document.querySelector('#assignmentFilter').addEventListener('change', event => { assignmentFilter = event.target.value; renderAssignments(); bindDynamic(); });
  bindDynamic();
}
function bindDynamic() {
  document.querySelectorAll('.edit-assignment').forEach(button => button.addEventListener('click', () => { if (requireAuth('edit assignments')) openAssignment(button.dataset.id); }));
  document.querySelectorAll('.delete-assignment').forEach(button => button.addEventListener('click', () => { if (!requireAuth('delete assignments')) return; assignments = assignments.filter(item => item.id !== button.dataset.id); deleteShared('assignments', button.dataset.id); save(); }));
}
function renderGrades() {
  app.innerHTML = `<div class="page">${header('Gradebook', 'Grades', 'Only graded work counts toward the current grade. Empty categories are excluded until you enter a score.', currentSession ? '<button class="button primary" id="gradeAdd">+ Add graded work</button>' : '')}<div class="table-wrap"><table><thead><tr><th>Course</th><th>Current grade</th><th>Graded weight</th><th>Category breakdown</th><th>Open work</th></tr></thead><tbody>${courses.map(course => { const mine = assignments.filter(item => item.course === course.id); const graded = mine.filter(item => hasEarnedScore(item) && Number(item.possible) > 0); const activeWeight = course.categories.filter(category => graded.some(item => item.category === category)).reduce((sum, category) => sum + course.weights[category], 0); const categories = course.categories.map(category => { const score = categoryScore(course, category, graded); if (score === null) return `<span class="grade-muted">${category} (${course.weights[category]}%): --</span>`; const dropNote = course.drops?.[category] ? `, drops ${course.drops[category]}` : ''; return `<span>${category} (${course.weights[category]}%${dropNote}): ${score.toFixed(0)}%</span>`; }).join('<br>'); return `<tr><td><div class="log-course"><i class="course-dot" style="background:${course.color};display:inline-block;margin-right:7px"></i>${course.code}</div><div class="assignment-meta">${course.name}</div></td><td><div class="grade-number ${courseGrade(course.id) === null ? 'grade-muted' : ''}">${courseGrade(course.id) === null ? '--' : `${courseGrade(course.id).toFixed(1)}%`}</div></td><td>${activeWeight ? `${activeWeight}% of course` : '--'}<div class="grade-bar"><span style="width:${Math.min(activeWeight, 100)}%"></span></div></td><td>${categories}</td><td>${mine.filter(item => item.status !== 'done').length}</td></tr>`; }).join('')}</tbody></table></div></div>`;
  document.querySelector('#gradeAdd')?.addEventListener('click', () => { if (requireAuth('add assignments')) openAssignment(); });
}
function weeklyCourseBreakdown() {
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
  const entries = logs.filter(log => {
    const logDate = new Date(`${log.date}T12:00:00`);
    return logDate >= weekStart && logDate <= weekEnd;
  });
  const totals = courses.map(course => ({
    course,
    hours: entries.filter(log => log.course === course.id).reduce((sum, log) => sum + Number(log.hours), 0)
  })).filter(item => item.hours > 0).sort((a, b) => b.hours - a.hours);

  if (!totals.length) return { total: 0, segments: [] };

  const totalHours = totals.reduce((sum, item) => sum + item.hours, 0);
  let cumulative = 0;
  const gradient = totals.map(item => {
    const start = cumulative;
    const end = cumulative + (item.hours / totalHours) * 100;
    cumulative = end;
    return `${item.course.color} ${start}% ${end}%`;
  }).join(', ');

  return { total: totalHours, segments: totals, gradient: `conic-gradient(${gradient})` };
}
function renderTimesheet() {
  const total = logs.reduce((sum, item) => sum + Number(item.hours), 0);
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(weekStart); date.setDate(weekStart.getDate() + index); const key = date.toISOString().slice(0, 10); return { key, label: date.toLocaleDateString('en-US', { weekday: 'short' }), hours: logs.filter(item => item.date === key).reduce((sum, item) => sum + Number(item.hours), 0) }; });
  const max = Math.max(...days.map(day => day.hours), 2);
  const split = weeklyCourseBreakdown();
  const pieChart = split.segments.length ? `<div class="time-pie-wrap"><div class="pie-chart" style="background:${split.gradient}"><div class="pie-center"><strong>${split.total.toFixed(1)}h</strong><span>this week</span></div></div><div class="pie-legend">${split.segments.map(item => `<div class="legend-item"><span class="legend-swatch" style="background:${item.course.color}"></span><div><strong>${item.course.code}</strong><span>${item.hours.toFixed(1)}h</span></div></div>`).join('')}</div></div>` : `<div class="empty-pie">No time logged this week yet.</div>`;

  app.innerHTML = `<div class="page">${header('Study rhythm', 'Time sheet', 'Log the work behind the grades. A small, honest record makes uneven weeks visible before they become stressful.', currentSession ? '<button class="button primary" id="timeAdd">+ Log time</button>' : '')}<div class="time-summary"><div class="time-total"><div class="stat-label">All logged time</div><strong>${total.toFixed(1)}h</strong></div><div class="time-total"><div class="stat-label">This week</div><strong>${days.reduce((sum, day) => sum + day.hours, 0).toFixed(1)}h</strong></div></div><div class="time-pie-panel">${pieChart}</div><div class="section-head"><h2>Monday-Sunday</h2></div><div class="bar-chart">${days.map(day => `<div class="bar-day"><span class="bar-hours">${day.hours ? `${day.hours}h` : ''}</span><div class="bar-fill" style="height:${Math.max(day.hours / max * 125, 3)}px"></div><span>${day.label}</span></div>`).join('')}</div><div class="section-head" style="margin-top:34px"><h2>Recent entries</h2><span class="source-note">${logs.length} total logs</span></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Class</th><th>Focus</th><th>Hours</th><th>Note</th><th></th></tr></thead><tbody>${logs.slice().sort((a, b) => b.date.localeCompare(a.date)).map(log => { const course = courseById(log.course); return `<tr><td>${formatDue(log.date)}</td><td><span class="log-course"><i class="course-dot" style="background:${course.color};display:inline-block;margin-right:7px"></i>${course.code}</span></td><td>${log.kind}</td><td><b>${Number(log.hours).toFixed(2)}h</b></td><td>${log.note || '--'}</td><td>${currentSession ? '<button class="delete-button" data-log="'+log.id+'" aria-label="Delete log">×</button>' : ''}</td></tr>`; }).join('') || '<tr><td colspan="6" class="empty">No time logged yet.</td></tr>'}</tbody></table></div></div>`;
  document.querySelector('#timeAdd')?.addEventListener('click', () => { if (requireAuth('log time')) document.querySelector('#timeDialog').showModal(); });
  document.querySelectorAll('[data-log]').forEach(button => button.addEventListener('click', () => { if (!requireAuth('delete time logs')) return; logs = logs.filter(log => log.id !== button.dataset.log); deleteShared('time_logs', button.dataset.log); save(); }));
}
function openAssignment(id = '') {
  if (!requireAuth('add or edit assignments')) return;
  const form = document.querySelector('#assignmentForm'); form.reset(); form.dataset.editId = id;
  const item = assignments.find(assignment => assignment.id === id);
  form.elements.course.value = item?.course || '302';
  updateCategoryOptions();
  if (item && courseById(item.course)?.categories.includes(item.category)) form.elements.category.value = item.category;
  form.elements.weight.value = assignmentWeight(form.elements.course.value, form.elements.category.value) || Number(item?.weight) || 0;
  if (item) ['name', 'due', 'status', 'earned', 'possible', 'notes'].forEach(key => { if (form.elements[key]) form.elements[key].value = item[key] ?? ''; });
  document.querySelector('#assignmentDialog').showModal();
}
function saveAssignment(event) {
  if (!requireAuth('save assignments')) return;
  event.preventDefault(); const form = event.target; const data = Object.fromEntries(new FormData(form).entries());
  const existing = assignments.find(item => item.id === form.dataset.editId);
  const item = { ...data, id: existing?.id || `a${Date.now()}`, scoreEntered: data.earned !== '', weight: assignmentWeight(data.course, data.category) || Number(existing?.weight) || 0, possible: Number(data.possible) || 100 };
  if (existing) assignments = assignments.map(entry => entry.id === existing.id ? item : entry); else assignments.push(item);
  document.querySelector('#assignmentDialog').close(); save();
}
function saveTime(event) {
  if (!requireAuth('log time')) return;
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.target).entries());
  logs.push({ ...data, id: `t${Date.now()}`, hours: Number(data.hours) }); document.querySelector('#timeDialog').close(); save();
}
