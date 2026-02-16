// Authentication System

const API_URL = window.BACKEND_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : '');

// Check if user is logged in
function isAuthenticated() {
    const token = localStorage.getItem('tonr_token');
    const user = localStorage.getItem('tonr_user');
    return !!(token && user);
}

// Get current user
function getCurrentUser() {
    const userStr = localStorage.getItem('tonr_user');
    return userStr ? JSON.parse(userStr) : null;
}

// Set authentication
function setAuth(token, user) {
    localStorage.setItem('tonr_token', token);
    localStorage.setItem('tonr_user', JSON.stringify(user));
}

// Clear authentication
function clearAuth() {
    localStorage.removeItem('tonr_token');
    localStorage.removeItem('tonr_user');
}

// Redirect to dashboard if authenticated
function checkAuth() {
    if (isAuthenticated() && window.location.pathname.includes('login.html')) {
        window.location.href = 'dashboard.html';
    } else if (!isAuthenticated() && window.location.pathname.includes('dashboard.html')) {
        window.location.href = 'login.html';
    }
}

// Tab switching
document.addEventListener('DOMContentLoaded', () => {
    // Check authentication status
    checkAuth();

    const tabs = document.querySelectorAll('.auth-tab');
    const forms = document.querySelectorAll('.auth-form');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');

    // If ?signup in URL, show signup form (e.g. from "Try Tonr" button)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('signup') && signupForm) {
        tabs.forEach(t => t.classList.remove('active'));
        tabs.forEach(t => { if (t.dataset.tab === 'signup') t.classList.add('active'); });
        forms.forEach(f => f.classList.remove('active'));
        signupForm.classList.add('active');
    }

    // Tab switching
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            
            // Update tabs
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update forms
            forms.forEach(f => f.classList.remove('active'));
            if (targetTab === 'login') {
                loginForm.classList.add('active');
            } else {
                signupForm.classList.add('active');
            }
            
            // Clear messages
            hideMessages();
        });
    });

    // Login form
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideMessages();

            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;

            try {
                const response = await fetch(`${API_URL}/api/auth/login`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ email, password })
                });

                const data = await response.json();

                if (response.ok) {
                    setAuth(data.token, data.user);
                    showSuccess('Login successful! Redirecting...');
                    setTimeout(() => {
                        // Check if user has selected a tier
                        if (!data.user.tier) {
                            window.location.href = 'pricing.html?select_tier=true';
                        } else {
                            window.location.href = 'dashboard.html';
                        }
                    }, 1000);
                } else {
                    showError(data.error || 'Login failed. Please check your credentials.');
                }
            } catch (error) {
                console.error('Login error:', error);
                showError('Failed to connect to server. Please try again.');
            }
        });
    }

    // Signup form
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideMessages();

            const name = document.getElementById('signupName').value;
            const email = document.getElementById('signupEmail').value;
            const password = document.getElementById('signupPassword').value;

            if (password.length < 6) {
                showError('Password must be at least 6 characters long.');
                return;
            }

            try {
                const response = await fetch(`${API_URL}/api/auth/signup`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ name, email, password })
                });

                const data = await response.json();

                if (response.ok) {
                    setAuth(data.token, data.user);
                    showSuccess('Account created! Please select a tier...');
                    setTimeout(() => {
                        window.location.href = 'pricing.html?select_tier=true&new_user=true';
                    }, 1000);
                } else {
                    showError(data.error || 'Signup failed. Please try again.');
                }
            } catch (error) {
                console.error('Signup error:', error);
                showError('Failed to connect to server. Please try again.');
            }
        });
    }
});

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    const successDiv = document.getElementById('successMessage');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.classList.add('show');
        if (successDiv) successDiv.classList.remove('show');
    }
}

function showSuccess(message) {
    const successDiv = document.getElementById('successMessage');
    const errorDiv = document.getElementById('errorMessage');
    if (successDiv) {
        successDiv.textContent = message;
        successDiv.classList.add('show');
        if (errorDiv) errorDiv.classList.remove('show');
    }
}

function hideMessages() {
    const errorDiv = document.getElementById('errorMessage');
    const successDiv = document.getElementById('successMessage');
    if (errorDiv) errorDiv.classList.remove('show');
    if (successDiv) successDiv.classList.remove('show');
}

// Logout function
function logout() {
    clearAuth();
    window.location.href = 'login.html';
}

