// ===== CONFIGURATION =====
const API_URL = 'https://script.google.com/macros/s/AKfycbzRZJiGmNfu3ZLLirLQoLF8B9mmyBhb4FT8V5EUYy_pvZbUqx8vfsKDS5rslmDik-p0OQ/exec';
const MENTOR_PASSWORD = 'iquanta2026'; // 🔐 Change this to your password

// Fixed list of 4 assigned students for this mentor
const STUDENTS = [
    { name: "Adithya Vikram", email: "gajendra.vikram@gmail.com" },
    { name: "Krishna Manoj", email: "krishnamanoj765@gmail.com" },
    { name: "Priyal Vaidya", email: "vaidyapriyal28@gmail.com" },
    { name: "Ridhi Ganth", email: "ganthridhi@gmail.com" }
];

// App State
let state = {
    slots: [],
    bookings: [],
    currentStudent: null
};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    initRouter();
    populateStudentDropdowns();
    setupEventListeners();
    handleRoute(); // Load initial route
});

// ===== ROUTER =====
function initRouter() {
    window.addEventListener('hashchange', handleRoute);
}

function handleRoute() {
    const hash = window.location.hash || '#/book';
    const route = hash.replace('#', '');
    
    // Update active nav link
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.getAttribute('data-route') === route);
    });

    // Hide all pages, show target
    document.querySelectorAll('.page-section').forEach(sec => sec.classList.add('hidden'));
    
    if (route === '/book') {
        document.getElementById('booking-page').classList.remove('hidden');
        loadBookingPage();
    } else if (route === '/dashboard') {
        if (!isMentorAuthenticated()) { showPasswordModal(() => { document.getElementById('dashboard-page').classList.remove('hidden'); loadDashboard(); }); return; }
        document.getElementById('dashboard-page').classList.remove('hidden');
        loadDashboard();
    } else if (route === '/planner') {
        if (!isMentorAuthenticated()) { showPasswordModal(() => { document.getElementById('planner-page').classList.remove('hidden'); initPlannerForm(); }); return; }
        document.getElementById('planner-page').classList.remove('hidden');
        initPlannerForm();
    }
    
    // Close mobile menu if open
    document.querySelector('.nav-links').classList.remove('show');
}

// ===== API UTILITIES =====

// Mock API responses until backend is connected
const IS_MOCK = API_URL === 'YOUR_APPS_SCRIPT_URL_HERE';

async function apiGet(action, params = {}) {
    if (IS_MOCK) return mockApiGet(action);
    
    try {
        const url = new URL(API_URL);
        url.searchParams.append('action', action);
        Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
        
        const response = await fetch(url);
        return await response.json();
    } catch (error) {
        console.error('API GET Error:', error);
        showToast('Failed to fetch data from server', 'error');
        return { success: false, error: error.message };
    }
}

async function apiPost(data) {
    if (IS_MOCK) return mockApiPost(data);

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(data),
            redirect: 'follow'
        });
        return await response.json();
    } catch (error) {
        console.error('API POST Error:', error);
        showToast('Operation failed', 'error');
        return { success: false, error: error.message };
    }
}

// ===== BOOKING PAGE =====
async function loadBookingPage() {
    const container = document.getElementById('slots-container');
    container.innerHTML = '<div class="skeleton" style="height: 200px"></div>';
    
    const res = await apiGet('getSlots');
    if (res.success) {
        state.slots = res.slots || [];
        renderSlots(state.slots.filter(s => !s.bookedBy)); // Only show available
    }
}

function renderSlots(slots) {
    const container = document.getElementById('slots-container');
    container.innerHTML = '';
    
    if (slots.length === 0) {
        container.innerHTML = '<div class="glass-card text-center"><p>No available slots right now. Please check back later.</p></div>';
        return;
    }

    // Group by date
    const grouped = slots.reduce((acc, slot) => {
        if (!acc[slot.date]) acc[slot.date] = [];
        acc[slot.date].push(slot);
        return acc;
    }, {});

    // Sort dates
    const dates = Object.keys(grouped).sort();

    dates.forEach(date => {
        const dateHtml = `
            <div class="date-group">
                <div class="date-header">${formatDate(date)}</div>
                <div class="slots-grid">
                    ${grouped[date].sort((a,b) => a.startTime.localeCompare(b.startTime)).map(slot => `
                        <div class="slot-card" onclick="openBookingConfirm('${slot.slotId}')">
                            <div class="time">${formatTime(slot.startTime)}</div>
                            <div class="duration">15 mins</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', dateHtml);
    });
}

function openBookingConfirm(slotId) {
    const studentIdx = document.getElementById('student-select').value;
    if (studentIdx === "") {
        showToast("Please select your profile first", "error");
        return;
    }
    
    const student = STUDENTS[studentIdx];
    const slot = state.slots.find(s => s.slotId === slotId);
    
    document.getElementById('confirm-student-name').textContent = student.name;
    document.getElementById('confirm-date').textContent = formatDate(slot.date);
    document.getElementById('confirm-time').textContent = formatTime(slot.startTime);
    
    const btn = document.getElementById('btn-confirm-booking');
    btn.onclick = () => submitBooking(slot.slotId, student);
    
    openModal('modal-confirm-booking');
}

async function submitBooking(slotId, student) {
    const btn = document.getElementById('btn-confirm-booking');
    btn.disabled = true;
    btn.innerHTML = 'Booking...';

    const res = await apiPost({
        action: 'bookSlot',
        slotId: slotId,
        studentName: student.name,
        studentEmail: student.email
    });

    btn.disabled = false;
    btn.innerHTML = 'Confirm & Book';
    closeModal('modal-confirm-booking');

    if (res.success) {
        document.getElementById('student-form')?.classList.add('hidden');
        document.getElementById('slots-container').classList.add('hidden');
        document.querySelector('.student-auth-panel').classList.add('hidden');
        document.getElementById('booking-success').classList.remove('hidden');
    } else {
        showToast(res.error || 'Failed to book slot', 'error');
    }
}

// ===== DASHBOARD =====
async function loadDashboard() {
    // Load bookings and slots
    const [slotsRes, bookingsRes] = await Promise.all([
        apiGet('getAllSlots'),
        apiGet('getBookings')
    ]);

    if (slotsRes.success) state.slots = slotsRes.slots || [];
    if (bookingsRes.success) state.bookings = bookingsRes.bookings || [];

    updateDashboardStats();
    renderManageSlots();
    renderBookings('upcoming');
}

function updateDashboardStats() {
    const now = new Date();
    const currentMonth = now.getMonth();
    
    const completed = state.bookings.filter(b => b.status === 'Completed').length;
    const upcoming = state.bookings.filter(b => b.status === 'Upcoming').length;
    const thisMonth = state.bookings.filter(b => {
        if(!b.date) return false;
        return new Date(b.date).getMonth() === currentMonth;
    }).length;

    document.getElementById('stat-total').textContent = state.bookings.length;
    document.getElementById('stat-upcoming').textContent = upcoming;
    document.getElementById('stat-month').textContent = thisMonth;
}

function renderManageSlots() {
    const tbody = document.querySelector('#slots-table tbody');
    tbody.innerHTML = '';
    
    const futureSlots = state.slots
        .filter(s => new Date(s.date) >= new Date(new Date().setHours(0,0,0,0)))
        .sort((a,b) => new Date(a.date) - new Date(b.date) || a.startTime.localeCompare(b.startTime));

    futureSlots.forEach(slot => {
        const isBooked = !!slot.bookedBy;
        const statusBadge = isBooked ? 
            `<span class="badge badge-upcoming">Booked</span>` : 
            `<span class="badge" style="background: rgba(255,255,255,0.1)">Available</span>`;
            
        tbody.insertAdjacentHTML('beforeend', `
            <tr>
                <td>${formatDate(slot.date)}</td>
                <td>${formatTime(slot.startTime)}</td>
                <td>${statusBadge}</td>
                <td>
                    ${!isBooked ? `<button class="btn btn-outline btn-sm" onclick="removeSlot('${slot.slotId}')">Delete</button>` : '-'}
                </td>
            </tr>
        `);
    });
}

async function handleAddSlot(e) {
    e.preventDefault();
    const date = document.getElementById('slot-date').value;
    const time = document.getElementById('slot-time').value;
    
    // Calculate end time (15 mins later)
    const [h, m] = time.split(':').map(Number);
    const endM = (m + 15) % 60;
    const endH = h + Math.floor((m + 15) / 60);
    const endTime = `${endH.toString().padStart(2,'0')}:${endM.toString().padStart(2,'0')}`;

    const res = await apiPost({
        action: 'addSlots',
        slots: [{ date, startTime: time, endTime }]
    });

    if (res.success) {
        showToast('Slot added successfully', 'success');
        document.getElementById('add-slot-form').reset();
        loadDashboard(); // reload data
    }
}

async function removeSlot(slotId) {
    if(!confirm('Delete this slot?')) return;
    
    const res = await apiPost({ action: 'removeSlot', slotId });
    if (res.success) {
        showToast('Slot removed', 'success');
        loadDashboard();
    }
}

function renderBookings(filter = 'all') {
    const container = document.getElementById('dashboard-bookings-list');
    container.innerHTML = '';
    
    let filtered = state.bookings;
    if (filter === 'upcoming') filtered = state.bookings.filter(b => b.status?.toLowerCase() === 'upcoming');
    if (filter === 'completed') filtered = state.bookings.filter(b => b.status?.toLowerCase() === 'completed');
    
    // Sort: upcoming first by date, then completed by date desc
    filtered.sort((a, b) => {
        const aUp = a.status?.toLowerCase() === 'upcoming';
        const bUp = b.status?.toLowerCase() === 'upcoming';
        if(aUp && !bUp) return -1;
        if(!aUp && bUp) return 1;
        if(aUp) return new Date(a.date) - new Date(b.date);
        return new Date(b.date) - new Date(a.date);
    });

    if (filtered.length === 0) {
        container.innerHTML = '<p class="text-muted text-center py-4">No bookings found.</p>';
        return;
    }

    filtered.forEach(b => {
        const isUpcoming = b.status === 'Upcoming';
        container.insertAdjacentHTML('beforeend', `
            <div class="booking-item glass-card mb-3">
                <div class="booking-info">
                    <h4>${b.studentName}</h4>
                    <p>📅 ${formatDate(b.date)} at ${formatTime(b.startTime)}</p>
                    ${b.zoomJoinUrl ? `<p><a href="${b.zoomHostUrl || b.zoomJoinUrl}" target="_blank" style="color: var(--secondary)">📹 Zoom Link</a></p>` : ''}
                </div>
                <div class="booking-actions text-right">
                    <div class="mb-2"><span class="badge ${isUpcoming ? 'badge-upcoming' : 'badge-completed'}">${b.status}</span></div>
                    ${b.status?.toLowerCase() === 'upcoming' ? `<button class="btn btn-primary btn-sm" onclick="openLogSession('${b.bookingId}')">Log Session</button>` : '<span style="font-size:0.8rem;color:var(--text-muted)">✓ Completed</span>'}
                </div>
            </div>
        `);
    });
}

function openLogSession(bookingId) {
    const booking = state.bookings.find(b => b.bookingId === bookingId);
    if(!booking) return;

    document.getElementById('log-booking-id').value = bookingId;
    document.getElementById('log-student-name').value = booking.studentName;
    document.getElementById('log-date').value = `${formatDate(booking.date)} ${formatTime(booking.startTime)}`;
    document.getElementById('log-notes').value = '';
    document.getElementById('log-recording').value = '';
    document.getElementById('log-plan').value = '';

    openModal('modal-log-session');
}

async function handleLogSession(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Saving...';

    const res = await apiPost({
        action: 'logSession',
        bookingId: document.getElementById('log-booking-id').value,
        mentorshipNotes: document.getElementById('log-notes').value,
        studyPlan: document.getElementById('log-plan').value,
        recordingLink: document.getElementById('log-recording').value
    });

    btn.disabled = false; btn.textContent = 'Save Session Log';
    
    if (res.success) {
        showToast('Session logged successfully', 'success');
        closeModal('modal-log-session');
        loadDashboard();
    }
}

// ===== STUDY PLANNER =====
function initPlannerForm() {
    // Set default start date to today
    const dateInput = document.getElementById('plan-start-date');
    if (!dateInput.value) dateInput.valueAsDate = new Date();
}

function handlePlanGenerate(e) {
    e.preventDefault();

    const startDate = new Date(document.getElementById('plan-start-date').value + 'T00:00:00');

    // Map selected weekdays to actual day numbers 1-10
    const selectedWeekdays = Array.from(document.querySelectorAll('input[name="class-weekday"]:checked')).map(cb => parseInt(cb.value));
    const classDays = [];
    for (let i = 0; i < 10; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        if (selectedWeekdays.includes(d.getDay())) classDays.push(i + 1);
    }

    const hasBacklog = document.getElementById('has-backlog').checked;
    const backlogCount = parseInt(document.getElementById('backlog-count').value) || 1;
    const hasMock = document.getElementById('has-mock').checked;
    const mockDay = parseInt(document.getElementById('mock-day').value);
    const qaFreq = document.querySelector('input[name="qa-freq"]:checked').value;
    const lrFreq = document.querySelector('input[name="lr-freq"]:checked').value;
    const vaFreq = document.querySelector('input[name="va-freq"]:checked').value;
    const readingMaterials = Array.from(document.querySelectorAll('input[name="reading"]:checked')).map(cb => cb.value);
    const specialInstructions = document.getElementById('special-instructions').value;

    // Pending assignments with counts
    const pendingAssign = [];
    ['QA','LR','VA'].forEach(sub => {
        const cb = document.getElementById(`assign-${sub.toLowerCase()}-cb`);
        if (cb && cb.checked) {
            const count = parseInt(document.getElementById(`assign-${sub.toLowerCase()}-count`).value) || 1;
            pendingAssign.push({ subject: sub, count });
        }
    });

    // Pending module questions with counts
    const pendingModule = [];
    ['QA','LR','VA'].forEach(sub => {
        const cb = document.getElementById(`module-${sub.toLowerCase()}-cb`);
        if (cb && cb.checked) {
            const count = parseInt(document.getElementById(`module-${sub.toLowerCase()}-count`).value) || 1;
            pendingModule.push({ subject: sub, count });
        }
    });

    const plan = generatePlanLogic({
        startDate, classDays, hasBacklog, backlogCount,
        hasMock, mockDay, qaFreq, lrFreq, vaFreq,
        readingMaterials, pendingAssign, pendingModule, specialInstructions
    });

    renderPlan(plan);
}

function generatePlanLogic(opts) {
    const plan = [];
    let qaCount = 0, lrCount = 0, vaCount = 0;

    for (let day = 1; day <= 10; day++) {
        const currentDate = new Date(opts.startDate);
        currentDate.setDate(currentDate.getDate() + (day - 1));
        const tasks = [];
        let type = 'Self Study';

        // Mock day overrides everything
        if (opts.hasMock && day === opts.mockDay) {
            type = 'Mock Test';
            tasks.push({ text: 'Attempt Full Mock Test', tag: 'tag-mock' });
            tasks.push({ text: 'In-depth Mock Analysis — note weak areas in QA, LR, VA', tag: 'tag-mock' });
            if (opts.readingMaterials && opts.readingMaterials.length > 0) {
                tasks.push({ text: 'Light reading: ' + opts.readingMaterials.join(' + '), tag: 'tag-va' });
            }

            // Pending module questions
            if (opts.pendingModule && opts.pendingModule.length > 0) {
                opts.pendingModule.forEach(m => {
                    tasks.push({ text: `Finish pending ${m.subject} module questions (${m.count} pending)`, tag: `tag-${m.subject.toLowerCase()}` });
                });
            }

            // Pending assignments
            if (opts.pendingAssign && opts.pendingAssign.length > 0) {
                opts.pendingAssign.forEach(a => {
                    tasks.push({ text: `Complete ${a.subject} chapterwise assignments (${a.count} pending)`, tag: `tag-${a.subject.toLowerCase()}` });
                });
            }

        } else if (opts.classDays && opts.classDays.includes(day)) {
            type = 'Class Day';
            currentLrVa = currentLrVa === 'LR' ? 'VA' : 'LR';
        } else {
            type = 'Gap Day';
            if (opts.hasBacklog) {
                tasks.push({ text: 'Complete backlog lectures if any', tag: 'tag-general' });
            }
            tasks.push({ text: 'Finish leftover questions from module', tag: 'tag-general' });
            tasks.push({ text: `QA: Do 20-30 revision/practice questions`, tag: 'tag-qa' });
            tasks.push({ text: 'Read newspaper + editorial + aeon essay', tag: 'tag-va' });
            tasks.push({ text: 'Alternating practice', tag: `tag-${currentLrVa.toLowerCase()}` });
            
            if (opts.pendingAssign && opts.pendingAssign.length > 0) {
                opts.pendingAssign.forEach(a => {
                    tasks.push({ text: `Complete ${a.subject} chapterwise assignments (${a.count} pending)`, tag: `tag-${a.subject.toLowerCase()}` });
                });
            } else {
                tasks.push({ text: 'Solve chapterwise assignments from portal', tag: 'tag-qa' });
            }
            
            currentLrVa = currentLrVa === 'LR' ? 'VA' : 'LR';
        }

        plan.push({ day, date: formatDate(currentDate.toISOString().split('T')[0]), type, tasks });
    }
    return plan;
}

function renderPlan(plan) {
    document.getElementById('plan-placeholder').classList.add('hidden');
    document.getElementById('plan-result').classList.remove('hidden');
    
    const container = document.getElementById('calendar-container');
    container.innerHTML = '';
    
    window.currentGeneratedPlan = plan; // Save for copy

    plan.forEach(d => {
        let typeClass = '';
        if(d.type === 'Mock Test') typeClass = 'mock';
        if(d.type === 'Gap Day') typeClass = 'gap';

        const tasksHtml = d.tasks.map(t => `
            <li><span class="tag ${t.tag}">${t.tag.replace('tag-','').toUpperCase()}</span> ${t.text}</li>
        `).join('');

        container.insertAdjacentHTML('beforeend', `
            <div class="day-card ${typeClass}">
                <div class="day-header">
                    <span class="day-title">Day ${d.day} <span class="text-muted font-normal ml-2">(${d.date})</span></span>
                    <span class="badge" style="background: rgba(255,255,255,0.1)">${d.type}</span>
                </div>
                <ul class="task-list mt-2">
                    ${tasksHtml}
                </ul>
            </div>
        `);
    });
}

function copyPlanToClipboard() {
    if (!window.currentGeneratedPlan) return;
    let text = "🌟 *Your 10-Day IPMAT Study Plan* 🌟\n\n";
    window.currentGeneratedPlan.forEach(d => {
        text += `*Day ${d.day} (${d.date}) - ${d.type}*\n`;
        d.tasks.forEach(t => text += `- ${t.text}\n`);
        text += '\n';
    });
    
    navigator.clipboard.writeText(text).then(() => {
        showToast('Plan copied to clipboard!', 'success');
    });
}


// ===== PASSWORD PROTECTION =====
function isMentorAuthenticated() {
    return sessionStorage.getItem('mentor_auth') === 'true';
}

function showPasswordModal(onSuccess) {
    // Create modal if not exists
    let modal = document.getElementById('password-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'password-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content glass-card" style="max-width:380px;text-align:center">
                <div style="font-size:2.5rem;margin-bottom:1rem">🔐</div>
                <h2 style="margin-bottom:0.5rem">Mentor Access Only</h2>
                <p style="color:var(--text-muted);margin-bottom:1.5rem">Enter your password to continue</p>
                <input type="password" id="pwd-input" class="glass-input" placeholder="Enter password" style="text-align:center;font-size:1.1rem;letter-spacing:2px">
                <p id="pwd-error" style="color:var(--danger);margin-top:0.5rem;display:none">Incorrect password. Try again.</p>
                <div style="display:flex;gap:1rem;margin-top:1.5rem">
                    <button class="btn btn-outline" style="flex:1" onclick="document.getElementById('password-modal').classList.add('hidden');window.location.hash='/book'">Cancel</button>
                    <button class="btn btn-primary" style="flex:1" id="pwd-submit">Enter</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');
    const input = document.getElementById('pwd-input');
    const error = document.getElementById('pwd-error');
    input.value = '';
    error.style.display = 'none';
    setTimeout(() => input.focus(), 100);

    const submit = () => {
        if (input.value === MENTOR_PASSWORD) {
            sessionStorage.setItem('mentor_auth', 'true');
            modal.classList.add('hidden');
            onSuccess();
        } else {
            error.style.display = 'block';
            input.value = '';
            input.focus();
        }
    };

    document.getElementById('pwd-submit').onclick = submit;
    input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
}

// ===== UTILITIES & EVENT LISTENERS =====

function setupEventListeners() {
    // Mobile menu
    document.querySelector('.mobile-menu-btn').addEventListener('click', () => {
        document.querySelector('.nav-links').classList.toggle('show');
    });

    // Modals
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.target.closest('.modal-overlay').classList.add('hidden');
        });
    });

    // Dashboard Filter
    document.getElementById('booking-filter')?.addEventListener('change', (e) => {
        renderBookings(e.target.value);
    });

    // Forms
    document.getElementById('add-slot-form')?.addEventListener('submit', handleAddSlot);
    document.getElementById('log-session-form')?.addEventListener('submit', handleLogSession);
    document.getElementById('study-planner-form')?.addEventListener('submit', handlePlanGenerate);

    // Planner Toggles
    document.getElementById('has-backlog')?.addEventListener('change', (e) => {
        document.getElementById('backlog-count').classList.toggle('hidden', !e.target.checked);
    });
    document.getElementById('has-mock')?.addEventListener('change', (e) => {
        document.getElementById('mock-day').classList.toggle('hidden', !e.target.checked);
    });
    // Show/hide count inputs for pending assignments
    ['qa','lr','va'].forEach(sub => {
        document.getElementById(`assign-${sub}-cb`)?.addEventListener('change', (e) => {
            document.getElementById(`assign-${sub}-count`).classList.toggle('hidden', !e.target.checked);
        });
        document.getElementById(`module-${sub}-cb`)?.addEventListener('change', (e) => {
            document.getElementById(`module-${sub}-count`).classList.toggle('hidden', !e.target.checked);
        });
    });
    document.getElementById('btn-copy-plan')?.addEventListener('click', copyPlanToClipboard);
}

function populateStudentDropdowns() {
    const selects = ['student-select', 'plan-student'];
    const options = `<option value="">-- Select Student --</option>` + 
        STUDENTS.map((s, i) => `<option value="${i}">${s.name}</option>`).join('');
    
    selects.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.innerHTML = options;
    });
}

function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
}
function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.getElementById('toast-container').appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function formatDate(dateStr) {
    if(!dateStr) return '';
    // Handle Google Sheets Date objects serialized as ISO strings
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    // Adjust for timezone offset so date doesn't shift
    const adjusted = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
    return adjusted.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(timeStr) {
    if(!timeStr) return '';
    // Handle HH:MM string (from time input)
    if (typeof timeStr === 'string' && /^\d{1,2}:\d{2}$/.test(timeStr)) {
        const [h, m] = timeStr.split(':');
        const d = new Date();
        d.setHours(parseInt(h), parseInt(m), 0);
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    // Handle Google Sheets time stored as full Date/ISO string
    const d = new Date(timeStr);
    if (!isNaN(d.getTime())) {
        // Google Sheets times are relative to 1899-12-30, extract HH:mm from IST
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
    }
    return timeStr;
}

// ===== MOCK API FOR DEV =====
async function mockApiGet(action) {
    await new Promise(r => setTimeout(r, 600)); // fake delay
    if (action === 'getSlots' || action === 'getAllSlots') {
        const today = new Date();
        const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
        const d1 = today.toISOString().split('T')[0];
        const d2 = tomorrow.toISOString().split('T')[0];
        
        return { success: true, slots: [
            { slotId: '1', date: d1, startTime: '10:00', endTime: '10:15' },
            { slotId: '2', date: d1, startTime: '10:30', endTime: '10:45', bookedBy: 'Rahul', status: 'Booked' },
            { slotId: '3', date: d2, startTime: '14:00', endTime: '14:15' }
        ]};
    }
    if (action === 'getBookings') {
        return { success: true, bookings: [
            { bookingId: 'b1', studentName: 'Rahul Kumar', date: new Date().toISOString().split('T')[0], startTime: '10:30', status: 'Upcoming', zoomJoinUrl: 'https://zoom.us/j/123' },
            { bookingId: 'b2', studentName: 'Sneha Sharma', date: '2023-10-01', startTime: '16:00', status: 'Completed' }
        ]};
    }
    return { success: false };
}
async function mockApiPost(data) {
    await new Promise(r => setTimeout(r, 800));
    return { success: true };
}
