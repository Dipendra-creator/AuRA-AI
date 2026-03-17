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
	cfg         *config.Config
	oauthConfig *oauth2.Config

	// In-memory store for pending GitHub OAuth sessions (state → JWT).
	// Entries expire after 5 minutes.
	mu       sync.Mutex
	sessions map[string]*pendingGitHubSession
}

// NewAuthHandler creates an AuthHandler wired to the given config and user repo.
func NewAuthHandler(userRepo *repository.UserRepo, cfg *config.Config) *AuthHandler {
	oauthCfg := &oauth2.Config{
		ClientID:     cfg.GitHubClientID,
		ClientSecret: cfg.GitHubClientSecret,
		RedirectURL:  cfg.GitHubCallbackURL,
		Scopes:       []string{"user:email", "read:user"},
		Endpoint:     github.Endpoint,
	}
	h := &AuthHandler{
		userRepo:    userRepo,
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

// ── Helpers ───────────────────────────────────────────────────────────────────

// renderCallbackResult renders an HTML page that closes the popup window
// and posts the result back to the opener via postMessage.
func (h *AuthHandler) renderCallbackResult(w http.ResponseWriter, token, errMsg string) {
	var script string
	if errMsg != "" {
		script = fmt.Sprintf(`window.opener && window.opener.postMessage({type:'github-auth-error',error:%q},'*'); window.close();`, errMsg)
	} else {
		script = fmt.Sprintf(`window.opener && window.opener.postMessage({type:'github-auth-success',token:%q},'*'); window.close();`, token)
	}
	w.Header().Set("Content-Type", "text/html")
	fmt.Fprintf(w, `<!DOCTYPE html><html><head><title>Authenticating...</title></head>`+
		`<body><script>%s</script><p>Authentication complete. You can close this window.</p></body></html>`, script)
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
		Email   string `json:"email"`
		Primary bool   `json:"primary"`
		Verified bool  `json:"verified"`
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
