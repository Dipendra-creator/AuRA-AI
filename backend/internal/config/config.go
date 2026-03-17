// Package config provides environment-based configuration for the Aura AI server.
package config

import (
	"os"
	"time"
)

// Config holds all application configuration values.
type Config struct {
	Port                string
	MongoURI            string
	MongoDB             string
	LogLevel            string
	CORSOrigins         string
	RequestTimeout      time.Duration
	KiloAPIKey          string
	TesseractPath       string
	JWTSecret           string
	JWTExpiry           time.Duration
	GitHubClientID      string
	GitHubClientSecret  string
	GitHubCallbackURL   string
}

// Load reads configuration from environment variables with sensible defaults.
func Load() *Config {
	return &Config{
		Port:               getEnv("PORT", "8080"),
		MongoURI:           getEnv("MONGO_URI", "mongodb://localhost:27017"),
		MongoDB:            getEnv("MONGO_DB", "aura_ai"),
		LogLevel:           getEnv("LOG_LEVEL", "info"),
		CORSOrigins:        getEnv("CORS_ORIGINS", "http://localhost:5173"),
		RequestTimeout:     parseDuration(getEnv("REQUEST_TIMEOUT", "30s"), 30*time.Second),
		KiloAPIKey:         getEnv("KILO_API_KEY", ""),
		TesseractPath:      getEnv("TESSERACT_PATH", "tesseract"),
		JWTSecret:          getEnv("JWT_SECRET", "change-me-in-production-use-32-chars"),
		JWTExpiry:          parseDuration(getEnv("JWT_EXPIRY", "72h"), 72*time.Hour),
		GitHubClientID:     getEnv("GITHUB_CLIENT_ID", ""),
		GitHubClientSecret: getEnv("GITHUB_CLIENT_SECRET", ""),
		GitHubCallbackURL:  getEnv("GITHUB_CALLBACK_URL", "http://localhost:8080/api/v1/auth/github/callback"),
	}
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
