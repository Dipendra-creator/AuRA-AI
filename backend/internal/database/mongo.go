// Package database provides MongoDB client lifecycle management.
package database

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readpref"
)

// Client wraps the MongoDB client and database reference.
type Client struct {
	client *mongo.Client
	db     *mongo.Database
}

// Connect establishes a connection to MongoDB and returns a Client.
func Connect(ctx context.Context, uri, dbName string) (*Client, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	clientOpts := options.Client().ApplyURI(uri)
	client, err := mongo.Connect(clientOpts)
	if err != nil {
		return nil, fmt.Errorf("mongo connect: %w", err)
	}

	if err := client.Ping(ctx, readpref.Primary()); err != nil {
		return nil, fmt.Errorf("mongo ping: %w", err)
	}

	slog.Info("connected to MongoDB", "db", dbName)

	return &Client{
		client: client,
		db:     client.Database(dbName),
	}, nil
}

// Database returns the underlying mongo.Database.
func (c *Client) Database() *mongo.Database {
	return c.db
}

// Collection returns a handle to a named collection.
func (c *Client) Collection(name string) *mongo.Collection {
	return c.db.Collection(name)
}

// Disconnect gracefully closes the MongoDB connection.
func (c *Client) Disconnect(ctx context.Context) error {
	slog.Info("disconnecting from MongoDB")
	return c.client.Disconnect(ctx)
}
