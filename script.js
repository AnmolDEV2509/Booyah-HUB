// Firebase Configuration Setup
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();

// Sample Match Data (Firebase Firestore Fallback)
const matchesData = [
    {
        id: "match_01",
        title: "Bermuda Championship - Solo",
        mode: "solo",
        map: "Bermuda",
        entryFee: "Free",
        prizePool: "₹500",
        joinedSlots: 38,
        totalSlots: 48,
        startTime: new Date(Date.now() + 3600000 * 2).toISOString(), // 2 hours later
        status: "upcoming",
        banner: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80",
        roomId: "BOOYAH_889",
        roomPass: "1234"
    },
    {
        id: "match_02",
        title: "CS 4v4 Showdown - Squad",
        mode: "cs",
        map: "Kalahari",
        entryFee: "₹10",
        prizePool: "₹200",
        joinedSlots: 8,
        totalSlots: 8,
        startTime: new Date(Date.now() - 1800000).toISOString(),
        status: "live",
        banner: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=600&q=80",
        roomId: "CS_ROOM_44",
        roomPass: "9900"
    }
];

let currentFilter = 'all';
let searchQuery = '';

// DOM Elements
const tournamentContainer = document.getElementById('tournamentContainer');
const searchInput = document.getElementById('searchInput');
const filterChips = document.querySelectorAll('.chip');
const registerModal = document.getElementById('registerModal');
const closeModalBtn = document.getElementById('closeModal');
const registrationForm = document.getElementById('registrationForm');

// Initial Render
document.addEventListener('DOMContentLoaded', () => {
    renderTournaments();
    setupEventListeners();
    startCountdownTimer();
});

// Event Listeners Setup
function setupEventListeners() {
    // Filter click
    filterChips.forEach(chip => {
        chip.addEventListener('click', (e) => {
            filterChips.forEach(c => c.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            renderTournaments();
        });
    });

    // Search input listener
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        renderTournaments();
    });

    // Close Modal
    closeModalBtn.addEventListener('click', () => {
        registerModal.classList.remove('active');
    });

    // Registration Form Submit
    registrationForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const matchId = document.getElementById('modalMatchId').value;
        const ign = document.getElementById('inGameName').value;
        const uid = document.getElementById('inGameUid').value;

        alert(`Successfully registered for ${matchId}!\nIGN: ${ign}\nUID: ${uid}`);
        registerModal.classList.remove('active');
        registrationForm.reset();
    });
}

// Render Tournament Cards
function renderTournaments() {
    tournamentContainer.innerHTML = '';

    const filtered = matchesData.filter(match => {
        const matchesFilter = currentFilter === 'all' || match.mode === currentFilter;
        const matchesSearch = match.title.toLowerCase().includes(searchQuery) || 
                              match.map.toLowerCase().includes(searchQuery);
        return matchesFilter && matchesSearch;
    });

    if (filtered.length === 0) {
        tournamentContainer.innerHTML = `<div style="text-align:center; padding: 40px 0; color: var(--text-muted);">No tournaments found</div>`;
        return;
    }

    filtered.forEach(match => {
        const percentage = Math.round((match.joinedSlots / match.totalSlots) * 100);
        const isFull = match.joinedSlots >= match.totalSlots;

        const cardHtml = `
            <div class="card">
                <img src="${match.banner}" class="card-banner" alt="Match Banner">
                <div class="card-body">
                    <div class="card-header">
                        <div class="card-title">${match.title}</div>
                        <span class="badge-status badge-${match.status}">${match.status}</span>
                    </div>

                    ${match.status === 'upcoming' ? `
                    <div class="countdown-hud" data-time="${match.startTime}">
                        <i class="fa-regular fa-clock"></i>
                        <span class="time-num timer-display">00h 00m 00s</span>
                    </div>` : ''}

                    <div class="card-details">
                        <div class="detail-item">
                            <span>PRIZE POOL</span>
                            <strong>${match.prizePool}</strong>
                        </div>
                        <div class="detail-item">
                            <span>ENTRY</span>
                            <strong>${match.entryFee}</strong>
                        </div>
                        <div class="detail-item">
                            <span>MAP</span>
                            <strong>${match.map}</strong>
                        </div>
                    </div>

                    <div class="slot-tracker">
                        <div class="slot-info">
                            <span>Slots Filled: ${match.joinedSlots}/${match.totalSlots}</span>
                            ${percentage >= 80 && !isFull ? '<span class="badge-almost-full">ALMOST FULL!</span>' : ''}
                        </div>
                        <div class="progress-bg">
                            <div class="progress-fill ${percentage >= 80 ? 'hot' : ''}" style="width: ${percentage}%;"></div>
                        </div>
                    </div>

                    ${match.status === 'live' ? `
                    <div class="room-box">
                        <div class="room-row">
                            <span><strong>Room ID:</strong> ${match.roomId}</span>
                            <button class="copy-btn" onclick="copyText('${match.roomId}')">COPY ID</button>
                        </div>
                        <div class="room-row">
                            <span><strong>Password:</strong> ${match.roomPass}</span>
                            <button class="copy-btn" onclick="copyText('${match.roomPass}')">COPY PASS</button>
                        </div>
                    </div>` : ''}

                    <button class="btn-primary" ${isFull || match.status !== 'upcoming' ? 'disabled style="opacity:0.6; cursor:not-allowed;"' : ''} onclick="openRegisterModal('${match.id}', '${match.title}')">
                        ${isFull ? 'SLOTS FULL' : match.status === 'upcoming' ? 'JOIN NOW' : 'MATCH IN PROGRESS'}
                    </button>
                </div>
            </div>
        `;

        tournamentContainer.insertAdjacentHTML('beforeend', cardHtml);
    });
}

// Open Modal Window
window.openRegisterModal = function(id, title) {
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalMatchId').value = id;
    registerModal.classList.add('active');
};

// Clipboard Helper
window.copyText = function(text) {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard: ' + text);
};

// Real-time Countdown Timer logic
function startCountdownTimer() {
    setInterval(() => {
        const hudElements = document.querySelectorAll('.countdown-hud');
        hudElements.forEach(hud => {
            const targetTime = new Date(hud.dataset.time).getTime();
            const now = new Date().getTime();
            const diff = targetTime - now;

            if (diff <= 0) {
                hud.querySelector('.timer-display').innerText = "Starting Soon!";
            } else {
                const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                hud.querySelector('.timer-display').innerText = `${hours}h ${minutes}m ${seconds}s`;
            }
        });
    }, 1000);
}
