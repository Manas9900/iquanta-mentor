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

    // ── 1. Pre-Analysis of the 10-day timeline ────────────────────────
    const gapDays = [];
    for (let d = 1; d <= 10; d++) {
        const isMock  = opts.hasMock && d === opts.mockDay;
        const isClass = opts.classDays && opts.classDays.includes(d);
        if (!isMock && !isClass) gapDays.push(d);
    }
    const numGapDays = gapDays.length || 1;

    // Parse mentor instructions
    const rawSI = opts.specialInstructions || '';
    const parsedDirectives = parseMentorSpecialInstructions(rawSI);

    // ── 2. Smart Backlog Distribution (1-2 per gap day, max 2.5 hrs) ──
    const backlogPerDay = {};
    if (opts.hasBacklog && opts.backlogCount > 0) {
        let remaining = opts.backlogCount;
        for (let i = 0; i < gapDays.length && remaining > 0; i++) {
            const lecturesThisDay = Math.ceil(remaining / (gapDays.length - i));
            backlogPerDay[gapDays[i]] = lecturesThisDay;
            remaining -= lecturesThisDay;
        }
    }

    // ── 3. Smart Assignment Distribution across gap days ──────────────
    const assignPerDay = {};
    if (opts.pendingAssign && opts.pendingAssign.length > 0) {
        opts.pendingAssign.forEach(a => {
            if (a.count <= 0) return;
            const perDay = Math.ceil(a.count / numGapDays);
            let rem = a.count;
            gapDays.forEach(gd => {
                if (rem <= 0) return;
                const todayCount = Math.min(perDay, rem);
                if (!assignPerDay[gd]) assignPerDay[gd] = [];
                assignPerDay[gd].push({ subject: a.subject, count: todayCount });
                rem -= todayCount;
            });
        });
    }

    // ── 4. Smart Module Questions Distribution across gap days ─────────
    const modulePerDay = {};
    if (opts.pendingModule && opts.pendingModule.length > 0) {
        opts.pendingModule.forEach(m => {
            if (m.count <= 0) return;
            const perDay = Math.ceil(m.count / numGapDays);
            let rem = m.count;
            gapDays.forEach(gd => {
                if (rem <= 0) return;
                const todayCount = Math.min(perDay, rem);
                if (!modulePerDay[gd]) modulePerDay[gd] = [];
                modulePerDay[gd].push({ subject: m.subject, count: todayCount });
                rem -= todayCount;
            });
        });
    }

    // ── 5. Exact Calendar-Day Alternate LR/VA Tracking ────────────────
    // Alternates Day 1: LR, Day 2: VA, Day 3: LR, Day 4: VA consistently throughout the 10 days!
    const getSubjectForDay = (dayNum) => (dayNum % 2 === 1) ? 'LR' : 'VA';

    // ── 6. 10-Day Plan Generation (Calibrated for 5 - 6 Hours Daily) ───
    for (let day = 1; day <= 10; day++) {
        const currentDate = new Date(opts.startDate);
        currentDate.setDate(currentDate.getDate() + (day - 1));
        const tasks = [];
        let type = 'Self Study';
        let targetHours = '5.5 hrs';

        const isMock     = opts.hasMock && day === opts.mockDay;
        const isPreMock  = opts.hasMock && day === opts.mockDay - 1 && day >= 1;
        const isPostMock = opts.hasMock && day === opts.mockDay + 1 && day <= 10;
        const isClass    = !isMock && opts.classDays && opts.classDays.includes(day);

        // Rotating subject for today
        const alternatingSubject = getSubjectForDay(day);

        // ── A. MOCK TEST DAY (Total: 5.5 - 6.0 hrs) ────────────────────
        if (isMock) {
            type = 'Mock Test Day 🎯';
            targetHours = '5.5 hrs';
            tasks.push({ text: 'Attempt full-length IPMAT Mock Test under strict proctored exam conditions (2.0 hrs)', tag: 'tag-mock' });
            tasks.push({ text: 'Immediate post-mock sectional score tally & accuracy evaluation for QA, LR, VA (1.0 hr)', tag: 'tag-mock' });
            tasks.push({ text: 'Initial error logging: categorize errors into conceptual doubt, careless error, or time pressure (1.5 hrs)', tag: 'tag-mock' });
            tasks.push({ text: 'Review solution videos/explanations for top unattempted high-yield questions (0.5 hr)', tag: 'tag-mock' });
            if (opts.readingMaterials?.length > 0) {
                tasks.push({ text: 'Light reading: ' + opts.readingMaterials.join(' + ') + ' for mental reset (0.5 hr)', tag: 'tag-va' });
            }

        // ── B. PRE-MOCK DAY — Consolidation & Speed Drill (5.0 - 5.5 hrs) ─
        } else if (isPreMock) {
            type = 'Pre-Mock Revision Day 📋';
            targetHours = '5.0 hrs';
            tasks.push({ text: 'Comprehensive QA Formula & Concept Sheet revision — Arithmetic & Algebra shortcuts (1.5 hrs)', tag: 'tag-qa' });
            tasks.push({ text: 'QA Speed Drill: Solve 20 mixed timed questions (1 min/question) (1.0 hr)', tag: 'tag-qa' });
            tasks.push({ text: 'LR Sectional Drill: Solve 2 full past IPMAT LR sets with countdown timer (1.0 hr)', tag: 'tag-lr' });
            tasks.push({ text: 'VA Refresher: Solve 2 RC passages + 5 Parajumbles + 5 Grammar/Vocab questions (1.0 hr)', tag: 'tag-va' });
            tasks.push({ text: 'Strategic mindset: Define mock section-attempt order, target cutoff strategy & sleep early (0.5 hr)', tag: 'tag-general' });

        // ── C. POST-MOCK DAY — In-Depth Diagnosis & Gap Filling (5.5 - 6.0 hrs) ──
        } else if (isPostMock) {
            type = 'Post-Mock Analysis Day 🔍';
            targetHours = '5.5 hrs';
            tasks.push({ text: 'Deep QA Diagnostic: Re-solve every incorrect & unattempted math problem without timer (2.0 hrs)', tag: 'tag-qa' });
            tasks.push({ text: 'LR Set Deconstruction: Analyze why sets were slow or missed and map alternate puzzle approaches (1.5 hrs)', tag: 'tag-lr' });
            tasks.push({ text: 'VA Error Review: Re-read RC passages where mistakes happened & eliminate trap options (1.0 hr)', tag: 'tag-va' });
            tasks.push({ text: 'Update Mistake Notebook & document action points for next 10-day cycle (0.5 hr)', tag: 'tag-general' });
            if (opts.readingMaterials?.length > 0) {
                tasks.push({ text: 'Daily Reading: ' + opts.readingMaterials.join(' + ') + ' (0.5 hr)', tag: 'tag-va' });
            }

        // ── D. CLASS DAY (Total: 5.5 - 6.0 hrs: 2 hrs live class + 3.5-4 hrs self-prep) ──
        } else if (isClass) {
            type = 'Class Day 🎓';
            targetHours = '5.5 hrs';
            // Live class block
            tasks.push({ text: 'Attend Live iQuanta Class — active engagement & live doubt asking (2.0 hrs)', tag: 'tag-qa' });
            tasks.push({ text: 'Post-Class Concept Review: Synthesize lecture notes & formula derivations (0.5 hr)', tag: 'tag-qa' });
            
            // QA practice based on setting
            if (opts.qaFreq === 'daily' || parsedDirectives.focusQA) {
                const qaCount = parsedDirectives.focusQA ? 30 : 25;
                tasks.push({ text: `QA Drill: Solve ${qaCount} chapterwise questions from today's lecture topic (1.5 hrs)`, tag: 'tag-qa' });
            } else {
                tasks.push({ text: 'QA Application: Solve 15 targeted practice problems from class topic (1.0 hr)', tag: 'tag-qa' });
            }

            // Alternating LR / VA on class days
            const doLRToday = (opts.lrFreq === 'daily') || (opts.lrFreq === 'alternate' && alternatingSubject === 'LR') || parsedDirectives.focusLR;
            const doVAToday = (opts.vaFreq === 'daily') || (opts.vaFreq === 'alternate' && alternatingSubject === 'VA') || parsedDirectives.focusVA;

            if (doLRToday && !doVAToday) {
                tasks.push({ text: 'LR Practice: Solve 2 standard IPMAT puzzle sets with strict stopwatch timing (1.0 hr)', tag: 'tag-lr' });
            } else if (doVAToday && !doLRToday) {
                tasks.push({ text: 'VA Practice: 1 RC passage + 10 mixed questions (Parajumbles, Sentence Completion) (1.0 hr)', tag: 'tag-va' });
            } else if (doLRToday && doVAToday) {
                tasks.push({ text: 'LR Drill: 1 timed puzzle set (0.5 hr)', tag: 'tag-lr' });
                tasks.push({ text: 'VA Drill: 1 timed RC passage + 5 vocab exercises (0.5 hr)', tag: 'tag-va' });
            }

            // Daily VA reading habit
            if (opts.readingMaterials?.length > 0) {
                tasks.push({ text: 'Reading Habit: ' + opts.readingMaterials.join(' + ') + ' + Vocabulary flashcards (0.5 hr)', tag: 'tag-va' });
            }

        // ── E. GAP DAY — Full Self-Study & Consolidation (Total: 5.5 - 6.0 hrs) ──
        } else {
            type = 'Gap Day (Self Study) 📖';
            targetHours = '6.0 hrs';

            // 1. Backlog if any (Takes priority: ~1.5 - 2.0 hrs)
            if (backlogPerDay[day]) {
                tasks.push({
                    text: `📌 Backlog Priority: Watch & take thorough notes for ${backlogPerDay[day]} pending lecture(s) on portal (1.5 hrs)`,
                    tag: 'tag-general'
                });
            }

            // 2. Pending Module Questions (Takes: ~1.0 hr)
            if (modulePerDay[day] && modulePerDay[day].length > 0) {
                modulePerDay[day].forEach(m => {
                    tasks.push({
                        text: `${m.subject} Module: Complete ${m.count} pending module questions from portal workbook (1.0 hr)`,
                        tag: `tag-${m.subject.toLowerCase()}`
                    });
                });
            }

            // 3. Pending Assignments (Takes: ~0.75 - 1.0 hr)
            if (assignPerDay[day] && assignPerDay[day].length > 0) {
                assignPerDay[day].forEach(a => {
                    tasks.push({
                        text: `${a.subject} Assignment: Finish ${a.count} pending chapterwise assignment questions (0.75 hr)`,
                        tag: `tag-${a.subject.toLowerCase()}`
                    });
                });
            }

            // 4. Core QA Practice (Takes: 1.5 - 2.0 hrs)
            const isDailyQA = (opts.qaFreq === 'daily') || parsedDirectives.focusQA;
            const qaQuestions = parsedDirectives.focusQA ? 35 : 30;
            if (isDailyQA || (!backlogPerDay[day] && day % 2 === 1)) {
                tasks.push({
                    text: `QA Problem Solving: Solve ${qaQuestions} level-2 & level-3 questions (mix of Arithmetic & Algebra) (1.75 hrs)`,
                    tag: 'tag-qa'
                });
            } else {
                tasks.push({
                    text: 'QA Concept Revision & Practice: 20 revision problems covering previously completed chapters (1.25 hrs)',
                    tag: 'tag-qa'
                });
            }

            // 5. Alternate LR or VA (Takes: 1.25 - 1.5 hrs)
            const doLRToday = (opts.lrFreq === 'daily') || (opts.lrFreq === 'alternate' && alternatingSubject === 'LR') || parsedDirectives.focusLR;
            const doVAToday = (opts.vaFreq === 'daily') || (opts.vaFreq === 'alternate' && alternatingSubject === 'VA') || parsedDirectives.focusVA;

            if (doLRToday && !doVAToday) {
                tasks.push({
                    text: 'LR Timed Workout: Solve 3 diverse sets (Arrangements, Syllogisms, Critical Reasoning) (1.25 hrs)',
                    tag: 'tag-lr'
                });
            } else if (doVAToday && !doLRToday) {
                tasks.push({
                    text: 'VA Intensive: 2 RC passages (timed) + 8 Parajumbles + 5 Sentence Completion drills (1.25 hrs)',
                    tag: 'tag-va'
                });
            } else if (doLRToday && doVAToday) {
                tasks.push({ text: 'LR Drill: 2 timed puzzle sets (0.75 hr)', tag: 'tag-lr' });
                tasks.push({ text: 'VA Drill: 1 RC passage + 10 Parajumbles & Vocab (0.75 hr)', tag: 'tag-va' });
            }

            // 6. Daily Reading & Vocabulary
            if (opts.readingMaterials?.length > 0) {
                tasks.push({
                    text: 'Active Reading: ' + opts.readingMaterials.join(' + ') + ' + Note down 5 new words with root meanings (0.5 hr)',
                    tag: 'tag-va'
                });
            }
        }

        // ── F. Dynamic Custom Instructions Integration ───────────────
        // Embed mentor's specific guidance directly into the plan
        if (parsedDirectives.customTasks.length > 0) {
            // Distribute custom instructions intelligently across appropriate days
            parsedDirectives.customTasks.forEach((customTask, cIdx) => {
                if ((day % 3 === (cIdx + 1) % 3) || (day === 1 && cIdx === 0)) {
                    tasks.push({ text: `⚡ Mentor Instruction: ${customTask}`, tag: 'tag-custom' });
                }
            });
        }

        plan.push({
            day,
            date: formatDate(currentDate.toISOString().split('T')[0]),
            type,
            targetHours,
            tasks
        });
    }

    return plan;
}

// Helper to parse mentor's instructions for focus areas and custom tasks
function parseMentorSpecialInstructions(rawText) {
    if (!rawText || !rawText.trim()) {
        return { focusQA: false, focusLR: false, focusVA: false, customTasks: [] };
    }

    const lower = rawText.toLowerCase();
    const focusQA = lower.includes('qa') && (lower.includes('focus') || lower.includes('weak') || lower.includes('more') || lower.includes('daily'));
    const focusLR = lower.includes('lr') && (lower.includes('focus') || lower.includes('weak') || lower.includes('more') || lower.includes('daily'));
    const focusVA = lower.includes('va') && (lower.includes('focus') || lower.includes('weak') || lower.includes('more') || lower.includes('daily'));

    // Split sentences or points into clean action directives
    const lines = rawText
        .split(/[\n;•]+/)
        .map(s => s.trim().replace(/^[-*0-9.)\s]+/, ''))
        .filter(s => s.length > 4);

    return {
        focusQA,
        focusLR,
        focusVA,
        customTasks: lines
    };
}

function renderPlan(plan) {
    document.getElementById('plan-placeholder').classList.add('hidden');
    document.getElementById('plan-result').classList.remove('hidden');

    const container = document.getElementById('calendar-container');
    container.innerHTML = '';

    window.currentGeneratedPlan = plan; // Save for copy & exports

    plan.forEach(d => {
        let typeClass = '';
        if (d.type.includes('Mock')) typeClass = 'mock';
        if (d.type.includes('Gap')) typeClass = 'gap';

        const tasksHtml = d.tasks.map(t => `
            <li><span class="tag ${t.tag}">${t.tag.replace('tag-','').toUpperCase()}</span> ${t.text}</li>
        `).join('');

        container.insertAdjacentHTML('beforeend', `
            <div class="day-card ${typeClass}">
                <div class="day-header">
                    <span class="day-title">Day ${d.day} <span class="text-muted font-normal ml-2">(${d.date})</span></span>
                    <div>
                        <span class="tag tag-hours">⏱️ ${d.targetHours || '5.5 hrs'}</span>
                        <span class="badge" style="background: rgba(255,255,255,0.1); margin-left: 0.5rem;">${d.type}</span>
                    </div>
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

    let text = "🎯 *YOUR 10-DAY IPMAT MENTORSHIP PLAN (5-6 HRS/DAY)* 🎯\n";
    text += "────────────────────────────────────────\n\n";

    window.currentGeneratedPlan.forEach(d => {
        const typeEmoji = d.type.includes('Mock') ? '📝' : (d.type.includes('Class') ? '🎓' : '📖');
        text += `📅 *Day ${d.day} (${d.date})* — ${typeEmoji} _${d.type}_ [⏱️ ${d.targetHours || '5.5 hrs'}]\n`;
        d.tasks.forEach(t => {
            text += `  • ${t.text}\n`;
        });
        text += '\n';
    });

    text += "────────────────────────────────────────\n";
    text += "💪 *Consistency is key! Put in 5-6 hours daily and track your errors diligently.*";

    navigator.clipboard.writeText(text).then(() => {
        showToast('Formatted 5-6 hr plan copied for WhatsApp!', 'success');
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

    // Convert current plan directly into high quality HTML table with 5-6 hr breakdown
    const planHtml = formatPlanAsHtml(window.currentGeneratedPlan);

    const res = await apiPost({
        action: 'generatePlan',
        studentName: student.name,
        options: {
            studentName: student.name,
            customHtmlPlan: planHtml
        }
    });

    btn.disabled = false; btn.textContent = '✉️ Email to Student';

    if (res.success) {
        showToast(`Plan successfully emailed to ${student.name} (${student.email})!`, 'success');
    } else {
        showToast('Email sending failed.', 'error');
    }
}

function formatPlanAsHtml(plan) {
    let html = '<table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 14px;">';
    html += '<tr style="background-color: #4A148C; color: white;"><th style="padding: 10px; border: 1px solid #ddd; width: 25%;">Day & Target</th><th style="padding: 10px; border: 1px solid #ddd;">Daily Study Schedule (5-6 Hours)</th></tr>';

    plan.forEach((day, i) => {
        const bg = i % 2 === 0 ? '#F9F9FF' : '#ffffff';
        html += `<tr style="background-color: ${bg};">`;
        html += `<td style="padding: 12px; border: 1px solid #ddd; vertical-align: top;">
                    <strong>Day ${day.day}</strong><br>
                    ${day.date}<br>
                    <span style="display:inline-block; padding: 2px 6px; background:#6C5CE7; color:white; border-radius:4px; font-size:12px; margin-top:4px;">${day.type}</span><br>
                    <small style="color:#27ae60; font-weight:bold;">Target: ${day.targetHours || '5.5 hrs'}</small>
                 </td>`;
        html += '<td style="padding: 12px; border: 1px solid #ddd; vertical-align: top;"><ul style="margin: 0; padding-left: 18px; line-height: 1.6;">';
        day.tasks.forEach(t => {
            html += `<li>${t.text}</li>`;
        });
        html += '</ul></td></tr>';
    });

    html += '</table>';
    return html;
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
