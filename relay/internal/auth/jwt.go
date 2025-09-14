package auth

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type JWTManager struct {
	secret []byte
}

type ConnectTokenClaims struct {
	HostID    string `json:"host_id"`
	DeviceKey string `json:"device_key"`
	jwt.RegisteredClaims
}

func NewJWTManager(secret string) *JWTManager {
	return &JWTManager{
		secret: []byte(secret),
	}
}

// GenerateConnectToken creates a short-lived JWT for client connection
func (j *JWTManager) GenerateConnectToken(hostID, deviceKey string) (string, error) {
	claims := ConnectTokenClaims{
		HostID:    hostID,
		DeviceKey: deviceKey,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(5 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "rtx-relay",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(j.secret)
}

// ValidateConnectToken validates and extracts claims from connect token
func (j *JWTManager) ValidateConnectToken(tokenString string) (*ConnectTokenClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &ConnectTokenClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return j.secret, nil
	})

	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*ConnectTokenClaims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}

	return claims, nil
}

// GenerateRandomKey generates a random hex key for testing
func GenerateRandomKey() string {
	bytes := make([]byte, 32)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}