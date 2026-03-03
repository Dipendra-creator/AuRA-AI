package nodes

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/engine"
)

// CustomAPIExecutor handles the custom_api node — HTTP call-out with template interpolation.
type CustomAPIExecutor struct {
	client *http.Client
}

// NewCustomAPIExecutor creates a new CustomAPIExecutor.
func NewCustomAPIExecutor() *CustomAPIExecutor {
	return &CustomAPIExecutor{
		client: &http.Client{Timeout: 60 * time.Second},
	}
}

// Validate checks the custom API node config.
func (e *CustomAPIExecutor) Validate(node domain.PipelineNode) error {
	url, _ := node.Config["url"].(string)
	if url == "" {
		return fmt.Errorf("custom_api node requires a url")
	}
	method, _ := node.Config["method"].(string)
	if method == "" {
		return fmt.Errorf("custom_api node requires a method")
	}
	return nil
}

// Execute makes an HTTP request with template interpolation and maps the response.
func (e *CustomAPIExecutor) Execute(ctx context.Context, node domain.PipelineNode, input engine.DataPacket) (engine.DataPacket, error) {
	output := input.Clone()
	output.Metadata.SourceNode = node.NodeID

	method, _ := node.Config["method"].(string)
	url, _ := node.Config["url"].(string)

	// Interpolate URL templates
	url = interpolateTemplate(url, input.Fields)

	// Get timeout from config
	timeoutSecs := 30
	if v, ok := node.Config["timeout"]; ok {
		if f, ok := v.(float64); ok {
			timeoutSecs = int(f)
		}
	}

	// Build request
	var bodyReader io.Reader
	if bodyTemplate, ok := node.Config["bodyTemplate"]; ok {
		bodyMap := interpolateMapTemplate(bodyTemplate, input.Fields)
		bodyBytes, err := json.Marshal(bodyMap)
		if err != nil {
			return output, fmt.Errorf("failed to marshal request body: %w", err)
		}
		bodyReader = bytes.NewReader(bodyBytes)
	}

	reqCtx, cancel := context.WithTimeout(ctx, time.Duration(timeoutSecs)*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, method, url, bodyReader)
	if err != nil {
		return output, fmt.Errorf("failed to create HTTP request: %w", err)
	}

	// Set headers
	if headersRaw, ok := node.Config["headers"]; ok {
		if headers, ok := headersRaw.(map[string]any); ok {
			for k, v := range headers {
				headerVal := fmt.Sprintf("%v", v)
				headerVal = interpolateTemplate(headerVal, input.Fields)
				req.Header.Set(k, headerVal)
			}
		}
	}

	// Default content type
	if req.Header.Get("Content-Type") == "" && bodyReader != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	// Execute request with retry
	maxRetries := 1
	if retryPolicy, ok := node.Config["retryPolicy"]; ok {
		if rp, ok := retryPolicy.(map[string]any); ok {
			if mr, ok := rp["maxRetries"].(float64); ok {
				maxRetries = int(mr)
			}
		}
	}

	var resp *http.Response
	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			backoff := time.Duration(attempt*1000) * time.Millisecond
			slog.Info("retrying API call", "attempt", attempt, "backoff", backoff)
			time.Sleep(backoff)
		}

		resp, lastErr = e.client.Do(req)
		if lastErr == nil && resp.StatusCode < 500 {
			break
		}
		if resp != nil {
			resp.Body.Close()
		}
	}

	if lastErr != nil {
		return output, fmt.Errorf("HTTP request failed after %d retries: %w", maxRetries, lastErr)
	}
	defer resp.Body.Close()

	// Read response body (limit to 5MB)
	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 5*1024*1024))
	if err != nil {
		return output, fmt.Errorf("failed to read response body: %w", err)
	}

	// Parse response JSON
	var respData map[string]any
	if err := json.Unmarshal(bodyBytes, &respData); err != nil {
		// If not JSON, store raw response
		output.Fields["api_response_raw"] = string(bodyBytes)
	} else {
		output.Fields["api_response"] = respData
	}

	output.Fields["api_status_code"] = resp.StatusCode

	// Apply response mapping
	if responseMapping, ok := node.Config["responseMapping"]; ok {
		if mapping, ok := responseMapping.(map[string]any); ok {
			for targetField, pathRaw := range mapping {
				path, ok := pathRaw.(string)
				if !ok {
					continue
				}
				val := resolveJSONPath(respData, path)
				if val != nil {
					output.Fields[targetField] = val
				}
			}
		}
	}

	slog.Info("custom_api node completed",
		"node", node.Name,
		"method", method,
		"url", url,
		"statusCode", resp.StatusCode,
	)

	return output, nil
}

// interpolateTemplate replaces {{fields.name}} placeholders with actual values.
func interpolateTemplate(template string, fields map[string]any) string {
	result := template
	for key, val := range fields {
		placeholder := fmt.Sprintf("{{fields.%s}}", key)
		result = strings.ReplaceAll(result, placeholder, fmt.Sprintf("%v", val))
	}
	return result
}

// interpolateMapTemplate recursively interpolates template values in a map.
func interpolateMapTemplate(data any, fields map[string]any) any {
	switch v := data.(type) {
	case map[string]any:
		result := make(map[string]any, len(v))
		for k, val := range v {
			result[k] = interpolateMapTemplate(val, fields)
		}
		return result
	case string:
		return interpolateTemplate(v, fields)
	default:
		return v
	}
}

// resolveJSONPath resolves a dot-notation path (e.g. "response.data.id") in a JSON map.
func resolveJSONPath(data map[string]any, path string) any {
	// Strip "response." prefix if present
	path = strings.TrimPrefix(path, "response.")

	parts := strings.Split(path, ".")
	var current any = data

	for _, part := range parts {
		m, ok := current.(map[string]any)
		if !ok {
			return nil
		}
		current = m[part]
	}

	return current
}
