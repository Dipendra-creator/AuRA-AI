package nodes

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/engine"
)

// ExportExecutor handles the export node — formats and delivers output data.
type ExportExecutor struct{}

// NewExportExecutor creates a new ExportExecutor.
func NewExportExecutor() *ExportExecutor {
	return &ExportExecutor{}
}

// Validate checks the export node config.
func (e *ExportExecutor) Validate(node domain.PipelineNode) error {
	return nil
}

// Execute formats the data and exports to the configured destination.
func (e *ExportExecutor) Execute(ctx context.Context, node domain.PipelineNode, input engine.DataPacket) (engine.DataPacket, error) {
	output := input.Clone()
	output.Metadata.SourceNode = node.NodeID

	format, _ := node.Config["format"].(string)
	if format == "" {
		format = "json"
	}

	// Filter fields based on include/exclude lists
	exportFields := filterExportFields(input.Fields, node.Config)

	// Generate filename
	filename := generateExportFilename(node.Config, format)

	switch format {
	case "csv":
		path, err := exportCSV(exportFields, filename)
		if err != nil {
			return output, fmt.Errorf("CSV export failed: %w", err)
		}
		output.Fields["export_path"] = path
		output.Fields["export_format"] = "csv"

	case "json":
		path, err := exportJSON(exportFields, filename)
		if err != nil {
			return output, fmt.Errorf("JSON export failed: %w", err)
		}
		output.Fields["export_path"] = path
		output.Fields["export_format"] = "json"

	default:
		// Store data inline for other formats
		output.Fields["export_data"] = exportFields
		output.Fields["export_format"] = format
	}

	output.Fields["export_complete"] = true
	output.Fields["export_field_count"] = len(exportFields)

	slog.Info("export node completed",
		"node", node.Name,
		"format", format,
		"fieldCount", len(exportFields),
	)

	return output, nil
}

// filterExportFields applies include/exclude filters to the fields.
func filterExportFields(fields map[string]any, config map[string]any) map[string]any {
	result := make(map[string]any)

	includeRaw, _ := config["includeFields"]
	excludeRaw, _ := config["excludeFields"]

	var includeFields []string
	var excludeFields []string

	if includes, ok := includeRaw.([]any); ok {
		for _, f := range includes {
			if s, ok := f.(string); ok {
				includeFields = append(includeFields, s)
			}
		}
	}
	if excludes, ok := excludeRaw.([]any); ok {
		for _, f := range excludes {
			if s, ok := f.(string); ok {
				excludeFields = append(excludeFields, s)
			}
		}
	}

	excludeSet := make(map[string]bool)
	for _, f := range excludeFields {
		excludeSet[f] = true
	}

	if len(includeFields) > 0 {
		for _, f := range includeFields {
			if val, ok := fields[f]; ok && !excludeSet[f] {
				result[f] = val
			}
		}
	} else {
		for k, v := range fields {
			if !excludeSet[k] {
				result[k] = v
			}
		}
	}

	return result
}

// generateExportFilename creates a filename from the config template.
func generateExportFilename(config map[string]any, format string) string {
	template, _ := config["filenameTemplate"].(string)
	if template == "" {
		template = "export_{{date}}"
	}

	filename := template
	filename = strings.ReplaceAll(filename, "{{date}}", time.Now().Format("2006-01-02"))
	filename = strings.ReplaceAll(filename, "{{timestamp}}", time.Now().Format("20060102_150405"))

	if pipelineName, ok := config["pipeline_name"].(string); ok {
		filename = strings.ReplaceAll(filename, "{{pipeline_name}}", pipelineName)
	}

	return filename + "." + format
}

// exportCSV writes fields to a CSV file and returns the file path.
func exportCSV(fields map[string]any, filename string) (string, error) {
	dir := filepath.Join("uploads", "exports")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}

	path := filepath.Join(dir, filename)
	file, err := os.Create(path)
	if err != nil {
		return "", err
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	defer writer.Flush()

	// Sort keys for consistent column order
	keys := make([]string, 0, len(fields))
	for k := range fields {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	// Write header
	if err := writer.Write(keys); err != nil {
		return "", err
	}

	// Write single row of values
	values := make([]string, len(keys))
	for i, k := range keys {
		values[i] = fmt.Sprintf("%v", fields[k])
	}
	if err := writer.Write(values); err != nil {
		return "", err
	}

	return path, nil
}

// exportJSON writes fields to a JSON file and returns the file path.
func exportJSON(fields map[string]any, filename string) (string, error) {
	dir := filepath.Join("uploads", "exports")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}

	path := filepath.Join(dir, filename)
	file, err := os.Create(path)
	if err != nil {
		return "", err
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(fields); err != nil {
		return "", err
	}

	return path, nil
}
