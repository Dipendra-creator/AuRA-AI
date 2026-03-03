// Package engine provides the pipeline execution engine for Aura AI.
package engine

import (
	"time"
)

// DataPacket is the data envelope passed between pipeline nodes.
type DataPacket struct {
	Fields   map[string]any    `json:"fields"`
	Metadata DataPacketMeta    `json:"metadata"`
	RawText  string            `json:"rawText,omitempty"`
	Files    []FileReference   `json:"files,omitempty"`
	Errors   []DataPacketError `json:"errors,omitempty"`
}

// DataPacketMeta holds metadata about the data packet origin.
type DataPacketMeta struct {
	DocumentID string    `json:"documentId"`
	SourceNode string    `json:"sourceNode"`
	Timestamp  time.Time `json:"timestamp"`
}

// FileReference points to a file on disk or in object storage.
type FileReference struct {
	Path      string `json:"path"`
	Name      string `json:"name"`
	MimeType  string `json:"mimeType"`
	SizeBytes int64  `json:"sizeBytes"`
}

// DataPacketError represents a non-fatal error accumulated during processing.
type DataPacketError struct {
	NodeID  string `json:"nodeId"`
	Message string `json:"message"`
	Field   string `json:"field,omitempty"`
}

// NewDataPacket creates an empty DataPacket with initialized maps.
func NewDataPacket() DataPacket {
	return DataPacket{
		Fields:   make(map[string]any),
		Metadata: DataPacketMeta{Timestamp: time.Now()},
	}
}

// Clone creates a deep copy of the DataPacket fields map.
func (dp DataPacket) Clone() DataPacket {
	clone := DataPacket{
		Metadata: dp.Metadata,
		RawText:  dp.RawText,
		Fields:   make(map[string]any, len(dp.Fields)),
	}
	for k, v := range dp.Fields {
		clone.Fields[k] = v
	}
	// Shallow copy slices
	clone.Files = append([]FileReference{}, dp.Files...)
	clone.Errors = append([]DataPacketError{}, dp.Errors...)
	return clone
}
