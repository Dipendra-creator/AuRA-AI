// Package logger provides structured logging setup using slog.
package logger

import (
	"log/slog"
	"os"
	"strings"
)

// Init configures the global slog logger with the specified level.
func Init(level string) {
	var lvl slog.Level
	switch strings.ToLower(level) {
	case "debug":
		lvl = slog.LevelDebug
	case "warn":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}

	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level:     lvl,
		AddSource: lvl == slog.LevelDebug,
	})
	slog.SetDefault(slog.New(handler))
}
