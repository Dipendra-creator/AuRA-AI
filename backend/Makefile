.PHONY: run build vet lint seed clean check-tesseract

GO := /usr/local/go/bin/go

check-tesseract:
	@command -v tesseract >/dev/null 2>&1 || (echo "WARNING: tesseract not found — image OCR will be disabled. Install with: brew install tesseract" && exit 0)

run: check-tesseract
	$(GO) run cmd/server/main.go

build:
	$(GO) build -o bin/aura-api cmd/server/main.go

vet:
	$(GO) vet ./...

lint:
	$(GO) vet ./... && $(GO) build ./...

seed:
	$(GO) run seed/seed.go

clean:
	rm -rf bin/

tidy:
	$(GO) mod tidy
