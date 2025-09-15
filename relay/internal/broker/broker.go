package broker

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/sirupsen/logrus"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// Allow all origins for development - restrict in production
		return true
	},
}

type MessageType string

const (
	MsgHostRegister   MessageType = "host_register"
	MsgClientConnect  MessageType = "client_connect"
	MsgHostRegistered MessageType = "host_registered"
	MsgClientReady    MessageType = "client_ready"
	MsgForward        MessageType = "forward"
	MsgPing           MessageType = "ping"
	MsgPong           MessageType = "pong"
)

type Message struct {
	Type      MessageType     `json:"type"`
	HostID    string          `json:"host_id,omitempty"`
	Token     string          `json:"token,omitempty"`
	Data      json.RawMessage `json:"data,omitempty"`
	Timestamp time.Time       `json:"timestamp"`
}

type Connection struct {
	conn     *websocket.Conn
	send     chan Message
	hostID   string
	isHost   bool
	clientID string
}

type Broker struct {
	hosts   map[string]*Connection // hostID -> host connection
	clients map[string]*Connection // clientID -> client connection
	hostClients map[string]string   // hostID -> clientID (1:1 mapping)
	mu      sync.RWMutex
	logger  *logrus.Logger
}

func NewBroker(logger *logrus.Logger) *Broker {
	return &Broker{
		hosts:       make(map[string]*Connection),
		clients:     make(map[string]*Connection),
		hostClients: make(map[string]string),
		logger:      logger,
	}
}

func (b *Broker) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		b.logger.WithError(err).Error("Failed to upgrade WebSocket")
		return
	}

	connection := &Connection{
		conn: conn,
		send: make(chan Message, 256),
	}

	go b.handleConnection(connection)
}

func (b *Broker) handleConnection(conn *Connection) {
	defer func() {
		b.cleanup(conn)
		conn.conn.Close()
	}()

	// Set up ping/pong for connection health
	conn.conn.SetReadLimit(512)
	conn.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.conn.SetPongHandler(func(string) error {
		conn.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	// Start writer goroutine
	go b.writer(conn)

	// Handle incoming messages
	for {
		var msg Message
		err := conn.conn.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				b.logger.WithError(err).Error("WebSocket error")
			}
			break
		}

		msg.Timestamp = time.Now()
		b.handleMessage(conn, msg)
	}
}

func (b *Broker) writer(conn *Connection) {
	ticker := time.NewTicker(54 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case msg, ok := <-conn.send:
			conn.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				conn.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := conn.conn.WriteJSON(msg); err != nil {
				b.logger.WithError(err).Error("Failed to write message")
				return
			}

		case <-ticker.C:
			conn.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := conn.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (b *Broker) handleMessage(conn *Connection, msg Message) {
	switch msg.Type {
	case MsgHostRegister:
		b.handleHostRegister(conn, msg)
	case MsgClientConnect:
		b.handleClientConnect(conn, msg)
	case MsgPing:
		b.sendMessage(conn, Message{Type: MsgPong, Timestamp: time.Now()})
	default:
		// Forward message to paired connection
		b.forwardMessage(conn, msg)
	}
}

func (b *Broker) handleHostRegister(conn *Connection, msg Message) {
	if msg.HostID == "" || msg.Token == "" {
		b.logger.Error("Host registration missing hostID or token")
		conn.conn.Close()
		return
	}

	b.mu.Lock()
	defer b.mu.Unlock()

	// Register host
	conn.hostID = msg.HostID
	conn.isHost = true
	b.hosts[msg.HostID] = conn

	b.logger.WithField("hostID", msg.HostID).Info("Host registered")

	// Send confirmation
	b.sendMessage(conn, Message{
		Type:      MsgHostRegistered,
		HostID:    msg.HostID,
		Timestamp: time.Now(),
	})
}

func (b *Broker) handleClientConnect(conn *Connection, msg Message) {
	if msg.HostID == "" || msg.Token == "" {
		b.logger.Error("Client connection missing hostID or token")
		conn.conn.Close()
		return
	}

	b.mu.Lock()
	defer b.mu.Unlock()

	// Check if host exists
	host, exists := b.hosts[msg.HostID]
	if !exists {
		b.logger.WithField("hostID", msg.HostID).Error("Host not found for client connection")
		conn.conn.Close()
		return
	}

	// Check if host already has a client
	if existingClientID, hasClient := b.hostClients[msg.HostID]; hasClient {
		b.logger.WithField("hostID", msg.HostID).Warn("Host already has a client, disconnecting existing")
		if existingClient, exists := b.clients[existingClientID]; exists {
			existingClient.conn.Close()
			delete(b.clients, existingClientID)
		}
		delete(b.hostClients, msg.HostID)
	}

	// Generate client ID and register
	clientID := fmt.Sprintf("client_%d", time.Now().UnixNano())
	conn.clientID = clientID
	conn.hostID = msg.HostID
	conn.isHost = false
	b.clients[clientID] = conn
	b.hostClients[msg.HostID] = clientID

	b.logger.WithFields(logrus.Fields{
		"clientID": clientID,
		"hostID":   msg.HostID,
	}).Info("Client connected")

	// Notify both host and client that connection is ready
	b.sendMessage(host, Message{
		Type:      MsgClientReady,
		HostID:    msg.HostID,
		Timestamp: time.Now(),
	})

	b.sendMessage(conn, Message{
		Type:      MsgClientReady,
		HostID:    msg.HostID,
		Timestamp: time.Now(),
	})
}

func (b *Broker) forwardMessage(from *Connection, msg Message) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if from.isHost {
		// Forward from host to client
		if clientID, exists := b.hostClients[from.hostID]; exists {
			if client, exists := b.clients[clientID]; exists {
				b.sendMessage(client, msg)
			}
		}
	} else {
		// Forward from client to host
		if host, exists := b.hosts[from.hostID]; exists {
			b.sendMessage(host, msg)
		}
	}
}

func (b *Broker) sendMessage(conn *Connection, msg Message) {
	select {
	case conn.send <- msg:
	default:
		b.cleanup(conn)
	}
}

func (b *Broker) cleanup(conn *Connection) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if conn.isHost && conn.hostID != "" {
		delete(b.hosts, conn.hostID)
		if clientID, exists := b.hostClients[conn.hostID]; exists {
			if client, exists := b.clients[clientID]; exists {
				client.conn.Close()
				delete(b.clients, clientID)
			}
			delete(b.hostClients, conn.hostID)
		}
		b.logger.WithField("hostID", conn.hostID).Info("Host disconnected")
	} else if !conn.isHost && conn.clientID != "" {
		delete(b.clients, conn.clientID)
		if conn.hostID != "" {
			delete(b.hostClients, conn.hostID)
		}
		b.logger.WithField("clientID", conn.clientID).Info("Client disconnected")
	}

	close(conn.send)
}

func (b *Broker) GetStats() map[string]interface{} {
	b.mu.RLock()
	defer b.mu.RUnlock()

	return map[string]interface{}{
		"hosts":   len(b.hosts),
		"clients": len(b.clients),
		"pairs":   len(b.hostClients),
	}
}