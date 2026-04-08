// Package handler provides HTTP request handlers for all API endpoints.
package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/aura-ai/backend/internal/auth"
	"github.com/aura-ai/backend/internal/config"
	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/repository"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/github"
)

// pendingGitHubSession holds a pending OAuth session keyed by state UUID.
type pendingGitHubSession struct {
	token     string
	createdAt time.Time
}

// AuthHandler handles authentication-related HTTP endpoints.
type AuthHandler struct {
	userRepo    *repository.UserRepo
	docRepo     *repository.DocumentRepo
	cfg         *config.Config
	oauthConfig *oauth2.Config

	// In-memory store for pending GitHub OAuth sessions (state → JWT).
	// Entries expire after 5 minutes.
	mu       sync.Mutex
	sessions map[string]*pendingGitHubSession
}

// NewAuthHandler creates an AuthHandler wired to the given config and user repo.
func NewAuthHandler(userRepo *repository.UserRepo, docRepo *repository.DocumentRepo, cfg *config.Config) *AuthHandler {
	oauthCfg := &oauth2.Config{
		ClientID:     cfg.GitHubClientID,
		ClientSecret: cfg.GitHubClientSecret,
		RedirectURL:  cfg.GitHubCallbackURL,
		Scopes:       []string{"user:email", "read:user"},
		Endpoint:     github.Endpoint,
	}
	h := &AuthHandler{
		userRepo:    userRepo,
		docRepo:     docRepo,
		cfg:         cfg,
		oauthConfig: oauthCfg,
		sessions:    make(map[string]*pendingGitHubSession),
	}
	// Background goroutine to clean up expired sessions
	go h.cleanupSessions()
	return h
}

// ── Register ─────────────────────────────────────────────────────────────────

type registerRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

// Register handles POST /api/v1/auth/register
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid request body"))
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.Password = strings.TrimSpace(req.Password)

	if req.Email == "" || req.Password == "" || req.Name == "" {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("name, email, and password are required"))
		return
	}
	if len(req.Password) < 8 {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("password must be at least 8 characters"))
		return
	}

	existing, err := h.userRepo.FindByEmail(r.Context(), req.Email)
	if err != nil {
		slog.Error("register: find user", "error", err)
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse("internal error"))
		return
	}
	if existing != nil {
		domain.WriteJSON(w, http.StatusConflict, domain.ErrorResponse("email already registered"))
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse("internal error"))
		return
	}

	user := &domain.User{
		Email:        req.Email,
		Name:         req.Name,
		PasswordHash: string(hash),
		Provider:     domain.AuthProviderLocal,
	}
	user, err = h.userRepo.Create(r.Context(), user)
	if err != nil {
		slog.Error("register: create user", "error", err)
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse("internal error"))
		return
	}

	token, err := auth.GenerateToken(user.ID.Hex(), user.Email, user.Name, h.cfg.JWTSecret, h.cfg.JWTExpiry)
	if err != nil {
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse("could not generate token"))
		return
	}

	domain.WriteJSON(w, http.StatusCreated, domain.SuccessResponse(map[string]interface{}{
		"token": token,
		"user":  user.ToPublic(),
	}))
}

// ── Login ─────────────────────────────────────────────────────────────────────

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// Login handles POST /api/v1/auth/login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid request body"))
		return
	}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	user, err := h.userRepo.FindByEmail(r.Context(), req.Email)
	if err != nil {
		slog.Error("login: find user", "error", err)
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse("internal error"))
		return
	}
	if user == nil {
		domain.WriteJSON(w, http.StatusUnauthorized, domain.ErrorResponse("invalid email or password"))
		return
	}
	if user.Provider != domain.AuthProviderLocal {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("this account uses GitHub login"))
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		domain.WriteJSON(w, http.StatusUnauthorized, domain.ErrorResponse("invalid email or password"))
		return
	}

	token, err := auth.GenerateToken(user.ID.Hex(), user.Email, user.Name, h.cfg.JWTSecret, h.cfg.JWTExpiry)
	if err != nil {
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse("could not generate token"))
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(map[string]interface{}{
		"token": token,
		"user":  user.ToPublic(),
	}))
}

// ── Me ────────────────────────────────────────────────────────────────────────

// Me handles GET /api/v1/auth/me — returns current user from context.
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value(domain.ContextKeyUser).(*domain.User)
	if !ok || user == nil {
		domain.WriteJSON(w, http.StatusUnauthorized, domain.ErrorResponse("unauthorized"))
		return
	}
	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(user.ToPublic()))
}

// ── GitHub OAuth ──────────────────────────────────────────────────────────────

// GitHubLogin handles GET /api/v1/auth/github
// Returns the GitHub authorization URL for the frontend to open.
func (h *AuthHandler) GitHubLogin(w http.ResponseWriter, r *http.Request) {
	if h.cfg.GitHubClientID == "" {
		domain.WriteJSON(w, http.StatusServiceUnavailable, domain.ErrorResponse("GitHub OAuth is not configured"))
		return
	}

	// Use a session_id provided by the client so it can poll for the result.
	sessionID := r.URL.Query().Get("session_id")
	if sessionID == "" {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("session_id query param is required"))
		return
	}

	// Embed sessionID in OAuth state to correlate the callback.
	state := sessionID
	url := h.oauthConfig.AuthCodeURL(state, oauth2.AccessTypeOnline)
	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(map[string]string{
		"url": url,
	}))
}

// GitHubCallback handles GET /api/v1/auth/github/callback
// GitHub redirects here after user grants access.
func (h *AuthHandler) GitHubCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state") // state == sessionID

	if code == "" || state == "" {
		http.Error(w, "missing code or state", http.StatusBadRequest)
		return
	}

	// Exchange code for GitHub access token
	githubToken, err := h.oauthConfig.Exchange(r.Context(), code)
	if err != nil {
		slog.Error("github callback: exchange code", "error", err)
		h.renderCallbackResult(w, "", "GitHub OAuth exchange failed")
		return
	}

	// Fetch GitHub user profile
	ghUser, err := fetchGitHubUser(r.Context(), githubToken.AccessToken)
	if err != nil {
		slog.Error("github callback: fetch user", "error", err)
		h.renderCallbackResult(w, "", "failed to fetch GitHub user")
		return
	}

	// Find or create local user
	user, err := h.userRepo.FindByProvider(r.Context(), domain.AuthProviderGitHub, fmt.Sprintf("%d", ghUser.ID))
	if err != nil {
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse("internal error"))
		return
	}

	if user == nil {
		// Check if email already exists (link accounts by email)
		if ghUser.Email != "" {
			user, err = h.userRepo.FindByEmail(r.Context(), ghUser.Email)
			if err != nil {
				h.renderCallbackResult(w, "", "internal error")
				return
			}
		}
		if user == nil {
			// Create new user
			user, err = h.userRepo.Create(r.Context(), &domain.User{
				Email:      ghUser.Email,
				Name:       ghUser.Name,
				Provider:   domain.AuthProviderGitHub,
				ProviderID: fmt.Sprintf("%d", ghUser.ID),
				AvatarURL:  ghUser.AvatarURL,
			})
			if err != nil {
				slog.Error("github callback: create user", "error", err)
				h.renderCallbackResult(w, "", "failed to create user")
				return
			}
		}
	}

	// Generate JWT
	jwtToken, err := auth.GenerateToken(user.ID.Hex(), user.Email, user.Name, h.cfg.JWTSecret, h.cfg.JWTExpiry)
	if err != nil {
		h.renderCallbackResult(w, "", "could not generate token")
		return
	}

	// Store the JWT keyed by sessionID so the polling endpoint can return it
	h.mu.Lock()
	h.sessions[state] = &pendingGitHubSession{token: jwtToken, createdAt: time.Now()}
	h.mu.Unlock()

	h.renderCallbackResult(w, jwtToken, "")
}

// GitHubStatus handles GET /api/v1/auth/github/status?session_id=<uuid>
// The Electron frontend polls this until it receives the JWT.
func (h *AuthHandler) GitHubStatus(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Query().Get("session_id")
	if sessionID == "" {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("session_id is required"))
		return
	}

	h.mu.Lock()
	session, ok := h.sessions[sessionID]
	if ok {
		delete(h.sessions, sessionID) // consume it
	}
	h.mu.Unlock()

	if !ok {
		domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(map[string]interface{}{
			"ready": false,
		}))
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(map[string]interface{}{
		"ready": true,
		"token": session.token,
	}))
}

// ── UpdateProfile ─────────────────────────────────────────────────────────────

type updateProfileRequest struct {
	Name string `json:"name"`
}

// UpdateProfile handles PATCH /api/v1/auth/me — updates display name.
func (h *AuthHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value(domain.ContextKeyUser).(*domain.User)
	if !ok || user == nil {
		domain.WriteJSON(w, http.StatusUnauthorized, domain.ErrorResponse("unauthorized"))
		return
	}

	var req updateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid request body"))
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("name is required"))
		return
	}

	updates := map[string]interface{}{"name": req.Name}
	updated, err := h.userRepo.UpdateProfile(r.Context(), user.ID.Hex(), updates)
	if err != nil {
		slog.Error("update profile", "error", err)
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse("internal error"))
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(updated.ToPublic()))
}

// ── ChangePassword ────────────────────────────────────────────────────────────

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// ChangePassword handles POST /api/v1/auth/me/password — changes password for local accounts.
func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value(domain.ContextKeyUser).(*domain.User)
	if !ok || user == nil {
		domain.WriteJSON(w, http.StatusUnauthorized, domain.ErrorResponse("unauthorized"))
		return
	}

	if user.Provider != domain.AuthProviderLocal {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("password change is only available for local accounts"))
		return
	}

	var req changePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid request body"))
		return
	}

	if req.CurrentPassword == "" || req.NewPassword == "" {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("current_password and new_password are required"))
		return
	}
	if len(req.NewPassword) < 8 {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("new password must be at least 8 characters"))
		return
	}

	// Fetch fresh user to get latest password hash
	fresh, err := h.userRepo.FindByID(r.Context(), user.ID.Hex())
	if err != nil || fresh == nil {
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse("internal error"))
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(fresh.PasswordHash), []byte(req.CurrentPassword)); err != nil {
		domain.WriteJSON(w, http.StatusUnauthorized, domain.ErrorResponse("current password is incorrect"))
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse("internal error"))
		return
	}

	if err := h.userRepo.UpdatePasswordHash(r.Context(), user.ID.Hex(), string(hash)); err != nil {
		slog.Error("change password", "error", err)
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse("internal error"))
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(map[string]string{"message": "password updated"}))
}

// ── GetUsage ──────────────────────────────────────────────────────────────────

const defaultDocumentQuota = 10_000

// GetUsage handles GET /api/v1/auth/me/usage — returns document usage and quota.
func (h *AuthHandler) GetUsage(w http.ResponseWriter, r *http.Request) {
	_, ok := r.Context().Value(domain.ContextKeyUser).(*domain.User)
	if !ok {
		domain.WriteJSON(w, http.StatusUnauthorized, domain.ErrorResponse("unauthorized"))
		return
	}

	used, err := h.docRepo.Count(r.Context())
	if err != nil {
		slog.Error("get usage: count documents", "error", err)
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse("internal error"))
		return
	}

	limit := int64(defaultDocumentQuota)
	var percent float64
	if limit > 0 {
		percent = float64(used) / float64(limit) * 100
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(map[string]interface{}{
		"used":    used,
		"limit":   limit,
		"percent": percent,
	}))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// renderCallbackResult renders an HTML page that:
//  1. Tries postMessage to window.opener (browser popup mode)
//  2. Redirects to aura-ai://auth/complete to bring the Electron app to front
//  3. Shows a nice fallback page with auto-close
func (h *AuthHandler) renderCallbackResult(w http.ResponseWriter, token, errMsg string) {
	w.Header().Set("Content-Type", "text/html")

	if errMsg != "" {
		fmt.Fprintf(w, `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Authentication Failed</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .card { background: rgba(30,41,59,0.9); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 40px; text-align: center; max-width: 400px; }
  .icon { font-size: 48px; margin-bottom: 16px; }
  h2 { margin: 0 0 8px; color: #f87171; }
  p { color: #94a3b8; margin: 0; font-size: 14px; }
</style></head>
<body><div class="card">
  <div class="icon">✗</div>
  <h2>Authentication Failed</h2>
  <p>%s</p>
  <p style="margin-top:16px">You can close this tab and try again.</p>
</div>
<script>
  if (window.opener) { window.opener.postMessage({type:'github-auth-error',error:%q},'*'); }
  setTimeout(function(){ window.close(); }, 3000);
</script></body></html>`, errMsg, errMsg)
		return
	}

	fmt.Fprintf(w, `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Authentication Successful</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .card { background: rgba(30,41,59,0.9); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 40px; text-align: center; max-width: 400px; }
  .icon { font-size: 48px; margin-bottom: 16px; }
  h2 { margin: 0 0 8px; color: #34d399; }
  p { color: #94a3b8; margin: 0; font-size: 14px; }
  .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(52,211,153,0.3); border-top-color: #34d399; border-radius: 50%%; animation: spin 0.8s linear infinite; margin-right: 8px; vertical-align: middle; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style></head>
<body><div class="card">
  <div class="icon">✓</div>
  <h2>Authentication Successful</h2>
  <p><span class="spinner"></span>Returning to Aura AI…</p>
  <p style="margin-top:16px;font-size:12px;color:#64748b">This tab will close automatically.</p>
</div>
<script>
  // 1. Try postMessage for browser-popup mode
  if (window.opener) {
    window.opener.postMessage({type:'github-auth-success',token:%q},'*');
  }
  // 2. Redirect to deep link to bring Electron app to front
  setTimeout(function(){
    window.location.href = 'aura-ai://auth/complete';
  }, 500);
  // 3. Try to close this tab after a short delay
  setTimeout(function(){ window.close(); }, 2000);
</script></body></html>`, token)
}

// cleanupSessions removes stale OAuth sessions older than 5 minutes.
func (h *AuthHandler) cleanupSessions() {
	ticker := time.NewTicker(2 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		h.mu.Lock()
		for k, v := range h.sessions {
			if time.Since(v.createdAt) > 5*time.Minute {
				delete(h.sessions, k)
			}
		}
		h.mu.Unlock()
	}
}

// ── GitHub API client ─────────────────────────────────────────────────────────

type githubUser struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	AvatarURL string `json:"avatar_url"`
	Login     string `json:"login"`
}

func fetchGitHubUser(ctx context.Context, accessToken string) (*githubUser, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API error %d: %s", resp.StatusCode, body)
	}

	var user githubUser
	if err := json.Unmarshal(body, &user); err != nil {
		return nil, err
	}

	// If GitHub didn't return a public email, fetch primary email from /user/emails
	if user.Email == "" {
		user.Email = fetchGitHubPrimaryEmail(ctx, accessToken)
	}
	// Fallback display name to login if name is blank
	if user.Name == "" {
		user.Name = user.Login
	}

	return &user, nil
}

func fetchGitHubPrimaryEmail(ctx context.Context, accessToken string) string {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user/emails", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	var emails []struct {
		Email    string `json:"email"`
		Primary  bool   `json:"primary"`
		Verified bool   `json:"verified"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&emails); err != nil {
		return ""
	}
	for _, e := range emails {
		if e.Primary && e.Verified {
			return e.Email
		}
	}
	return ""
}
