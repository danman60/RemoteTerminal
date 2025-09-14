package main

import (
	"context"
	"crypto/tls"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rtx/relay/internal/auth"
	"github.com/rtx/relay/internal/broker"
	tlsutil "github.com/rtx/relay/internal/tls"
	"github.com/sirupsen/logrus"
	"gopkg.in/yaml.v3"
)

type Config struct {
	Port                   int    `yaml:"port"`
	TLSCertPath           string `yaml:"tls_cert_path"`
	TLSKeyPath            string `yaml:"tls_key_path"`
	JWTSecret             string `yaml:"jwt_secret"`
	MaxConnectionsPerHost int    `yaml:"max_connections_per_host"`
	ConnectionTimeout     int    `yaml:"connection_timeout"`
	KeepaliveInterval     int    `yaml:"keepalive_interval"`
	LogLevel              string `yaml:"log_level"`
}

var (
	configFile = flag.String("config", "config.yaml", "Path to configuration file")
	genToken   = flag.String("gen-token", "", "Generate connect token for host_id:device_key")
)

func main() {
	flag.Parse()

	// Set up logger
	logger := logrus.New()
	logger.SetFormatter(&logrus.TextFormatter{
		FullTimestamp: true,
	})

	// Load configuration
	config, err := loadConfig(*configFile)
	if err != nil {
		logger.WithError(err).Fatal("Failed to load configuration")
	}

	// Set log level
	if level, err := logrus.ParseLevel(config.LogLevel); err == nil {
		logger.SetLevel(level)
	}

	// Handle token generation
	if *genToken != "" {
		generateToken(config, *genToken, logger)
		return
	}

	// Load TLS configuration
	tlsConfig, err := tlsutil.LoadTLSConfig(config.TLSCertPath, config.TLSKeyPath)
	if err != nil {
		logger.WithError(err).Fatal("Failed to load TLS configuration")
	}

	// Create broker
	relayBroker := broker.NewBroker(logger)

	// Set up HTTP server
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", relayBroker.HandleWebSocket)
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/stats", func(w http.ResponseWriter, r *http.Request) {
		handleStats(w, r, relayBroker)
	})

	addr := fmt.Sprintf(":%d", config.Port)
	server := &http.Server{
		Addr:      addr,
		Handler:   mux,
		TLSConfig: tlsConfig,
		ReadTimeout:  time.Duration(config.ConnectionTimeout) * time.Second,
		WriteTimeout: time.Duration(config.ConnectionTimeout) * time.Second,
		IdleTimeout:  time.Duration(config.ConnectionTimeout*2) * time.Second,
	}

	// Start server
	go func() {
		logger.WithField("addr", addr).Info("Starting relay server")
		if err := server.ListenAndServeTLS("", ""); err != nil && err != http.ErrServerClosed {
			logger.WithError(err).Fatal("Server failed")
		}
	}()

	// Wait for shutdown signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down server...")

	// Graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.WithError(err).Error("Server shutdown error")
	}

	logger.Info("Server stopped")
}

func loadConfig(filename string) (*Config, error) {
	data, err := os.ReadFile(filename)
	if err != nil {
		return nil, err
	}

	var config Config
	if err := yaml.Unmarshal(data, &config); err != nil {
		return nil, err
	}

	return &config, nil
}

func generateToken(config *Config, hostDevice string, logger *logrus.Logger) {
	// Parse host_id:device_key
	var hostID, deviceKey string
	if n, err := fmt.Sscanf(hostDevice, "%s:%s", &hostID, &deviceKey); err != nil || n != 2 {
		logger.Fatal("Invalid format. Use: host_id:device_key")
	}

	// Generate token
	jwtManager := auth.NewJWTManager(config.JWTSecret)
	token, err := jwtManager.GenerateConnectToken(hostID, deviceKey)
	if err != nil {
		logger.WithError(err).Fatal("Failed to generate token")
	}

	fmt.Printf("Connect token: %s\n", token)
	fmt.Printf("Valid for 5 minutes\n")
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"status":"healthy","timestamp":"%s"}`, time.Now().UTC().Format(time.RFC3339))
}

func handleStats(w http.ResponseWriter, r *http.Request, broker *broker.Broker) {
	stats := broker.GetStats()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	fmt.Fprintf(w, `{"stats":%v,"timestamp":"%s"}`, stats, time.Now().UTC().Format(time.RFC3339))
}