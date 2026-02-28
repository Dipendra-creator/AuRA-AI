.PHONY: run build vet lint seed clean

GO := /usr/local/go/bin/go

run:
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
