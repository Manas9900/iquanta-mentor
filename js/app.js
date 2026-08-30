// ===== CONFIGURATION =====
const API_URL = 'https://script.google.com/macros/s/AKfycbzRZJiGmNfu3ZLLirLQoLF8B9mmyBhb4FT8V5EUYy_pvZbUqx8vfsKDS5rslmDik-p0OQ/exec';
const MENTOR_PASSWORD = 'iquanta2026'; // 🔐 Password for Mentor (Dashboard & Planner)
const STUDENT_PASSWORD = 'studentiquanta'; // 🔐 Password for Students (Booking Page)

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
        if (!isStudentAuthenticated()) { showStudentPasswordModal(() => { document.getElementById('booking-page').classList.remove('hidden'); loadBookingPage(); }); return; }
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
        renderSlots(state.slots); // Render all slots (both available & booked)
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
                    ${grouped[date].sort((a,b) => a.startTime.localeCompare(b.startTime)).map(slot => {
                        const isBooked = slot.status === 'booked' || !!slot.bookedBy;
                        if (isBooked) {
                            return `
                                <div class="slot-card slot-booked" style="opacity:0.5; cursor:not-allowed; background:rgba(255,255,255,0.05); border-color:transparent;">
                                    <div class="time" style="text-decoration:line-through;">${formatTime(slot.startTime)}</div>
                                    <div class="duration" style="color:var(--danger); font-weight:600;">Booked</div>
                                </div>
                            `;
                        }
                        return `
                            <div class="slot-card" onclick="openBookingConfirm('${slot.slotId}')">
                                <div class="time">${formatTime(slot.startTime)}</div>
                                <div class="duration">15 mins</div>
                            </div>
                        `;
                    }).join('')}
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
    
    // Show all slots so past or current slots can be deleted or reviewed
    const sortedSlots = state.slots
        .slice()
        .sort((a,b) => new Date(b.date) - new Date(a.date) || a.startTime.localeCompare(b.startTime));

    sortedSlots.forEach(slot => {
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

    // Retrieve planner data saved for this student
    const studentName = document.getElementById('log-student-name').value;
    const savedPlan = getPlanDataForStudent(studentName);

    const res = await apiPost({
        action: 'logSession',
        bookingId: document.getElementById('log-booking-id').value,
        mentorshipNotes: document.getElementById('log-notes').value,
        studyPlan: savedPlan ? savedPlan.planText : document.getElementById('log-plan').value,
        recordingLink: document.getElementById('log-recording').value,
        // Planner-derived fields for smart tracker fill
        backlogCount:        savedPlan ? (savedPlan.backlogCount || 0)    : 0,
        pendingQA:           savedPlan ? (savedPlan.pendingQA   || 0)    : 0,
        pendingVARC:         savedPlan ? (savedPlan.pendingVARC || 0)    : 0,
        pendingLRDI:         savedPlan ? (savedPlan.pendingLRDI || 0)    : 0,
        specialInstructions: savedPlan ? (savedPlan.specialInstructions || '') : ''
    });

    btn.disabled = false; btn.textContent = 'Save Session Log';

    if (res.success) {
        showToast('Session logged successfully! Tracker sheet updated.', 'success');
        closeModal('modal-log-session');
        loadDashboard();
    }
}

// ===== PLAN DATA STORAGE (connects Planner → Log Session) =====
function savePlanDataForStudent(studentName, data) {
    try { localStorage.setItem('planData_' + studentName, JSON.stringify(data)); } catch(e) {}
}
function getPlanDataForStudent(studentName) {
    try {
        const s = localStorage.getItem('planData_' + studentName);
        return s ? JSON.parse(s) : null;
    } catch(e) { return null; }
}

// ===== STUDY PLANNER =====
function initPlannerForm() {
    // Populate student dropdown in planner if empty
    const select = document.getElementById('plan-student');
    if (select && select.children.length === 0) {
        select.innerHTML = '<option value="">-- Select Student (Optional) --</option>';
        STUDENTS.forEach((s, idx) => {
            select.insertAdjacentHTML('beforeend', `<option value="${idx}">${s.name}</option>`);
        });
    }

    // Set default start date to today
    const dateInput = document.getElementById('plan-start-date');
    if (dateInput && !dateInput.value) dateInput.valueAsDate = new Date();
}

function handlePlanGenerate(e) {
    e.preventDefault();

    const startDateInput = document.getElementById('plan-start-date').value;
    const startDate = startDateInput ? new Date(startDateInput + 'T00:00:00') : new Date();

    // Map selected weekdays to actual day numbers 1-10
    const selectedWeekdays = Array.from(document.querySelectorAll('input[name="class-weekday"]:checked')).map(cb => parseInt(cb.value));
    const classDays = [];
    for (let i = 0; i < 10; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        if (selectedWeekdays.includes(d.getDay())) classDays.push(i + 1);
    }

    const hasBacklog = document.getElementById('has-backlog')?.checked || false;
    const backlogCount = parseInt(document.getElementById('backlog-count')?.value) || 0;
    const hasMock = document.getElementById('has-mock')?.checked || false;
    const mockDay = parseInt(document.getElementById('mock-day')?.value) || 5;

    const qaFreqElem = document.querySelector('input[name="qa-freq"]:checked');
    const lrFreqElem = document.querySelector('input[name="lr-freq"]:checked');
    const vaFreqElem = document.querySelector('input[name="va-freq"]:checked');

    const qaFreq = qaFreqElem ? qaFreqElem.value : 'daily';
    const lrFreq = lrFreqElem ? lrFreqElem.value : 'alternate';
    const vaFreq = vaFreqElem ? vaFreqElem.value : 'alternate';

    const readingMaterials = Array.from(document.querySelectorAll('input[name="reading"]:checked')).map(cb => cb.value);
    // NOTE: specialInstructions is kept INTERNAL — not shown in plan, used only for tracker sheet
    const specialInstructions = document.getElementById('special-instructions')?.value || '';

    // Pending assignments with counts (ONLY if checked)
    const pendingAssign = [];
    ['QA','LR','VA'].forEach(sub => {
        const cb = document.getElementById(`assign-${sub.toLowerCase()}-cb`);
        if (cb && cb.checked) {
            const countVal = document.getElementById(`assign-${sub.toLowerCase()}-count`)?.value;
            const count = parseInt(countVal) || 0;
            pendingAssign.push({ subject: sub, count });
        }
    });

    // Pending module questions with counts (ONLY if checked)
    const pendingModule = [];
    ['QA','LR','VA'].forEach(sub => {
        const cb = document.getElementById(`module-${sub.toLowerCase()}-cb`);
        if (cb && cb.checked) {
            const countVal = document.getElementById(`module-${sub.toLowerCase()}-count`)?.value;
            const count = parseInt(countVal) || 0;
            pendingModule.push({ subject: sub, count });
        }
    });

    const plan = generatePlanLogic({
        startDate, classDays, hasBacklog, backlogCount,
        hasMock, mockDay, qaFreq, lrFreq, vaFreq,
        readingMaterials, pendingAssign, pendingModule,
        specialInstructions // passed internally but NOT shown in plan
    });

    renderPlan(plan);

    // Save planner data to localStorage so Log Session can pick it up
    const planText = buildPlanText(plan);
    const pendingQA   = pendingAssign.find(a => a.subject === 'QA')?.count   || 0;
    const pendingVARC = pendingAssign.find(a => a.subject === 'VA')?.count   || 0;
    const pendingLRDI = pendingAssign.find(a => a.subject === 'LR')?.count   || 0;

    const selectedStudentIdx = document.getElementById('plan-student')?.value;
    if (selectedStudentIdx !== '' && selectedStudentIdx !== undefined) {
        const studentName = STUDENTS[selectedStudentIdx]?.name;
        if (studentName) {
            savePlanDataForStudent(studentName, {
                planText, backlogCount, pendingQA, pendingVARC, pendingLRDI, specialInstructions
            });
            showToast(`Plan data saved for ${studentName} — will auto-fill tracker when you log the session.`, 'info');
        }
    }
}

// Build plain-text plan for tracker sheet storage
function buildPlanText(plan) {
    let text = '10-Day Study Plan:\n\n';
    plan.forEach(d => {
        text += `Day ${d.day} (${d.date}) — ${d.type}\n`;
        d.tasks.forEach(t => { text += `  • ${t.text}\n`; });
        text += '\n';
    });
    return text;
}

function generatePlanLogic(opts) {
    const plan = [];
    let currentLrVa = 'LR';

    for (let day = 1; day <= 10; day++) {
        const currentDate = new Date(opts.startDate);
        currentDate.setDate(currentDate.getDate() + (day - 1));
        const tasks = [];
        let type = 'Self Study';

        // NOTE: Special Instructions are INTERNAL ONLY — not shown in the plan
        // They are stored in localStorage and used to auto-fill the tracker sheet

        // Mock day
        if (opts.hasMock && day === opts.mockDay) {
            type = 'Mock Test';
            tasks.push({ text: 'Attempt Full Mock Test', tag: 'tag-mock' });
            tasks.push({ text: 'In-depth Mock Analysis — note weak areas in QA, LR, VA', tag: 'tag-mock' });
            if (opts.readingMaterials && opts.readingMaterials.length > 0) {
                tasks.push({ text: 'Light reading: ' + opts.readingMaterials.join(' + '), tag: 'tag-va' });
            }
        } else if (opts.classDays && opts.classDays.includes(day)) {
            type = 'Class Day';
            tasks.push({ text: 'Attend scheduled live class & complete class notes', tag: 'tag-qa' });
            if (opts.readingMaterials && opts.readingMaterials.length > 0) {
                tasks.push({ text: 'Daily reading: ' + opts.readingMaterials.join(' + '), tag: 'tag-va' });
            }
        } else {
            type = 'Gap Day';

            // Backlog
            if (opts.hasBacklog && opts.backlogCount > 0) {
                tasks.push({ text: `Cover backlog lectures (${opts.backlogCount} pending)`, tag: 'tag-general' });
            }

            // Pending module questions
            if (opts.pendingModule && opts.pendingModule.length > 0) {
                opts.pendingModule.forEach(m => {
                    if (m.count > 0) tasks.push({ text: `Finish pending ${m.subject} module questions (${m.count} questions)`, tag: `tag-${m.subject.toLowerCase()}` });
                });
            }

            // Pending assignments
            if (opts.pendingAssign && opts.pendingAssign.length > 0) {
                opts.pendingAssign.forEach(a => {
                    if (a.count > 0) tasks.push({ text: `Complete ${a.subject} assignments (${a.count} pending)`, tag: `tag-${a.subject.toLowerCase()}` });
                });
            }

            // Subject practice based on selected frequencies
            if (opts.qaFreq === 'daily' || day % 2 === 1) {
                tasks.push({ text: 'QA: Do 20-30 practice/revision questions', tag: 'tag-qa' });
            }
            if (opts.lrFreq === 'daily' || (opts.lrFreq === 'alternate' && currentLrVa === 'LR')) {
                tasks.push({ text: 'LR: Solve sets & review weak concepts', tag: 'tag-lr' });
            }
            if (opts.vaFreq === 'daily' || (opts.vaFreq === 'alternate' && currentLrVa === 'VA')) {
                tasks.push({ text: 'VA: Reading comprehension & sectional tests', tag: 'tag-va' });
            }

            // Reading materials
            if (opts.readingMaterials && opts.readingMaterials.length > 0) {
                tasks.push({ text: 'Daily reading: ' + opts.readingMaterials.join(' + '), tag: 'tag-va' });
            }

            currentLrVa = currentLrVa === 'LR' ? 'VA' : 'LR';
        }

    plan.push({ day, date: formatDate(currentDate.toISOString().split('T')[0]), type, tasks });
    }
    return plan;
}

function refineSpecialInstructions(rawText) {
    if (!rawText) return [];
    // Split by newlines, periods, commas, or semicolons if long
    let lines = rawText.split(/\n+/).map(s => s.trim()).filter(Boolean);
    
    // If it's a single block of text, try splitting by sentences
    if (lines.length === 1 && lines[0].length > 40) {
        lines = lines[0].split(/(?<=[.?!])\s+/).map(s => s.trim()).filter(Boolean);
    }

    return lines.map(line => {
        // Capitalize first letter and format cleanly
        let clean = line.replace(/^[•\-\*\d\.\)\s]+/, ''); // remove bullet symbols if user typed them
        return clean.charAt(0).toUpperCase() + clean.slice(1);
    });
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
    
    let text = "🎯 *YOUR 10-DAY IPMAT STUDY PLAN* 🎯\n";
    text += "───────────────────────────────\n\n";

    window.currentGeneratedPlan.forEach(d => {
        const typeEmoji = d.type === 'Mock Test' ? '📝' : (d.type === 'Class Day' ? '🎓' : '📖');
        text += `📅 *Day ${d.day} (${d.date})* — ${typeEmoji} _${d.type}_\n`;
        d.tasks.forEach(t => {
            text += `  • ${t.text}\n`;
        });
        text += '\n';
    });

    text += "───────────────────────────────\n";
    text += "💪 *Stay consistent & reach out if you have doubts!*";

    navigator.clipboard.writeText(text).then(() => {
        showToast('Formatted plan copied for WhatsApp!', 'success');
    });
}

function exportPlanToPdf() {
    if (!window.currentGeneratedPlan) return;
    window.print();
}

async function emailPlanToStudent() {
    if (!window.currentGeneratedPlan) return;
    
    const studentIdx = document.getElementById('plan-student')?.value;
    if (studentIdx === "" || studentIdx === undefined) {
        showToast('Please select a student from the dropdown first to send an email.', 'error');
        return;
    }
    
    const student = STUDENTS[studentIdx];
    if (!student || !student.email) {
        showToast('Student email not found.', 'error');
        return;
    }

    const btn = document.getElementById('btn-email-plan');
    btn.disabled = true; btn.textContent = 'Sending...';

    const res = await apiPost({
        action: 'generatePlan',
        studentName: student.name,
        options: { studentName: student.name }
    });

    btn.disabled = false; btn.textContent = '✉️ Email to Student';

    if (res.success) {
        showToast(`Plan successfully emailed to ${student.name} (${student.email})!`, 'success');
    } else {
        showToast('Email sending failed.', 'error');
    }
}


// ===== PASSWORD PROTECTION =====
function isMentorAuthenticated() {
    return sessionStorage.getItem('mentor_auth') === 'true';
}

function isStudentAuthenticated() {
    return sessionStorage.getItem('student_auth') === 'true';
}

function showStudentPasswordModal(onSuccess) {
    let modal = document.getElementById('student-password-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'student-password-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content glass-card" style="max-width:380px;text-align:center">
                <div style="font-size:2.5rem;margin-bottom:1rem">🔒</div>
                <h2 style="margin-bottom:0.5rem">Student Access</h2>
                <p style="color:var(--text-muted);margin-bottom:1.5rem">Enter access code to book sessions</p>
                <input type="password" id="student-pwd-input" class="glass-input" placeholder="Enter access password" style="text-align:center;font-size:1.1rem;letter-spacing:2px">
                <p id="student-pwd-error" style="color:var(--danger);margin-top:0.5rem;display:none">Incorrect password. Try again.</p>
                <div style="display:flex;gap:1rem;margin-top:1.5rem">
                    <button class="btn btn-primary w-100" id="student-pwd-submit">Unlock Access</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');
    const input = document.getElementById('student-pwd-input');
    const error = document.getElementById('student-pwd-error');
    input.value = '';
    error.style.display = 'none';
    setTimeout(() => input.focus(), 100);

    const submit = () => {
        if (input.value === STUDENT_PASSWORD) {
            sessionStorage.setItem('student_auth', 'true');
            modal.classList.add('hidden');
            onSuccess();
        } else {
            error.style.display = 'block';
            input.value = '';
            input.focus();
        }
    };

    document.getElementById('student-pwd-submit').onclick = submit;
    input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
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
    document.getElementById('btn-pdf-plan')?.addEventListener('click', exportPlanToPdf);
    document.getElementById('btn-email-plan')?.addEventListener('click', emailPlanToStudent);
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
