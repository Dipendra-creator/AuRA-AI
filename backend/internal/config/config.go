// Package config provides environment-based configuration for the Aura AI server.
package config

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"os"
	"time"
)

// Config holds all application configuration values.
type Config struct {
	Port               string
	MongoURI           string
	MongoDB            string
	LogLevel           string
	CORSOrigins        string
	RequestTimeout     time.Duration
	KiloAPIKey         string // kept for backward-compat bootstrap; prefer DB-stored key
	TesseractPath      string
	JWTSecret          string
	JWTExpiry          time.Duration
	GitHubClientID     string
	GitHubClientSecret string
	GitHubCallbackURL  string
	EncryptionKey      []byte // 32-byte AES-256 key for encrypting stored API keys
}

// Load reads configuration from environment variables with sensible defaults.
func Load() *Config {
	cfg := &Config{
		Port:               getEnv("PORT", "8080"),
		MongoURI:           getEnv("MONGO_URI", "mongodb://localhost:27017"),
		MongoDB:            getEnv("MONGO_DB", "aura_ai"),
		LogLevel:           getEnv("LOG_LEVEL", "info"),
		CORSOrigins:        getEnv("CORS_ORIGINS", "http://localhost:5173"),
		RequestTimeout:     parseDuration(getEnv("REQUEST_TIMEOUT", "30s"), 30*time.Second),
		KiloAPIKey:         getEnv("KILO_API_KEY", ""),
		TesseractPath:      getEnv("TESSERACT_PATH", "tesseract"),
		JWTSecret:          getEnvOrGenerate("JWT_SECRET"),
		JWTExpiry:          parseDuration(getEnv("JWT_EXPIRY", "72h"), 72*time.Hour),
		GitHubClientID:     getEnv("GITHUB_CLIENT_ID", ""),
		GitHubClientSecret: getEnv("GITHUB_CLIENT_SECRET", ""),
		GitHubCallbackURL:  getEnv("GITHUB_CALLBACK_URL", "http://localhost:8080/api/v1/auth/github/callback"),
	}

	cfg.EncryptionKey = loadEncryptionKey()
	return cfg
}

// loadEncryptionKey reads ENCRYPTION_KEY from env (64-char hex → 32 bytes).
// Falls back to a deterministic dev-only key with a warning if not set.
func loadEncryptionKey() []byte {
	raw := getEnv("ENCRYPTION_KEY", "")
	if raw != "" {
		key, err := hex.DecodeString(raw)
		if err != nil || len(key) != 32 {
			slog.Warn("ENCRYPTION_KEY is set but invalid (must be 64-char hex = 32 bytes) — using dev fallback")
		} else {
			return key
		}
	} else {
		slog.Warn("ENCRYPTION_KEY not set — generating ephemeral random key (data encrypted this run won't be decryptable after restart)")
	}
	// Generate a crypto-random ephemeral key instead of predictable zero bytes.
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		panic("failed to generate random encryption key: " + err.Error())
	}
	return key
}

func requireEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic(fmt.Sprintf("required environment variable %s is not set", key))
	}
	return v
}

// getEnvOrGenerate returns the value of the given environment variable.
// If it is empty, a random 64-char hex string is generated and a warning is
// logged. This allows the packaged desktop app to boot without a pre-set
// JWT_SECRET — the Electron main process normally injects one, but in edge
// cases (manual backend run without .env) this prevents a hard crash.
func getEnvOrGenerate(key string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(fmt.Sprintf("failed to generate random value for %s: %v", key, err))
	}
	generated := hex.EncodeToString(b)
	slog.Warn(fmt.Sprintf("%s not set — generated ephemeral value (restart will invalidate tokens)", key))
	return generated
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func parseDuration(s string, fallback time.Duration) time.Duration {
	d, err := time.ParseDuration(s)
	if err != nil {
		return fallback
	}
	return d
}
