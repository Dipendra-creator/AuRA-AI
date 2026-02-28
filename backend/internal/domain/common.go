// Package domain defines the core business entities and shared types.
package domain

import (
	"encoding/json"
	"net/http"
)

// APIResponse is the consistent JSON envelope for all API responses.
type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
	Meta    *Meta       `json:"meta,omitempty"`
}

// Meta holds pagination metadata.
type Meta struct {
	Total int64 `json:"total"`
	Page  int   `json:"page"`
	Limit int   `json:"limit"`
}

// WriteJSON sends a JSON response with the given status code.
func WriteJSON(w http.ResponseWriter, status int, resp APIResponse) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(resp) //nolint:errcheck
}

// SuccessResponse builds a success APIResponse.
func SuccessResponse(data interface{}) APIResponse {
	return APIResponse{Success: true, Data: data}
}

// PaginatedResponse builds a success APIResponse with pagination meta.
func PaginatedResponse(data interface{}, total int64, page, limit int) APIResponse {
	return APIResponse{
		Success: true,
		Data:    data,
		Meta:    &Meta{Total: total, Page: page, Limit: limit},
	}
}

// ErrorResponse builds an error APIResponse.
func ErrorResponse(msg string) APIResponse {
	return APIResponse{Success: false, Error: msg}
}

// AppError represents a domain-level error with an HTTP status code.
type AppError struct {
	Code    int
	Message string
}

func (e *AppError) Error() string {
	return e.Message
}

// Common application errors.
var (
	ErrNotFound       = &AppError{Code: http.StatusNotFound, Message: "resource not found"}
	ErrBadRequest     = &AppError{Code: http.StatusBadRequest, Message: "bad request"}
	ErrInternalServer = &AppError{Code: http.StatusInternalServerError, Message: "internal server error"}
)
