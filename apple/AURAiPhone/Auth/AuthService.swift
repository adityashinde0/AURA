// apple/AURAiPhone/Auth/AuthService.swift
import Foundation
import AuthenticationServices
import CryptoKit
import Security

@MainActor
public final class AuthService: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    public static let shared = AuthService()

    @Published public private(set) var isAuthenticated: Bool = false
    @Published public private(set) var currentUserId: String? = nil

    private let tokenKey = "com.aura.auth.accessToken"
    private let refreshTokenKey = "com.aura.auth.refreshToken"
    private let userIdKey = "com.aura.auth.userId"

    private override init() {
        super.init()
        checkStoredAuth()
    }

    private func checkStoredAuth() {
        if let token = getFromKeychain(key: tokenKey), !token.isEmpty {
            self.isAuthenticated = true
            self.currentUserId = getFromKeychain(key: userIdKey) ?? "usr_default"
        }
    }

    public func startPKCEAuthFlow(
        authEndpoint: URL = URL(string: "https://auth.aura.internal/oauth2/authorize")!,
        tokenEndpoint: URL = URL(string: "https://auth.aura.internal/oauth2/token")!,
        clientId: String = "aura-ios-companion",
        redirectUri: URL = URL(string: "aura://oauth-callback")!
    ) async throws {
        // Generate PKCE code verifier and code challenge
        let verifier = generateCodeVerifier()
        let challenge = generateCodeChallenge(from: verifier)

        var components = URLComponents(url: authEndpoint, resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirectUri.absoluteString),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "scope", value: "openid profile aura.signals aura.briefings")
        ]

        guard let authURL = components.url else {
            throw NSError(domain: "AuthService", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid auth URL"])
        }

        let callbackURL = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<URL, Error>) in
            let session = ASWebAuthenticationSession(
                url: authURL,
                callbackURLScheme: redirectUri.scheme
            ) { callbackURL, error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else if let callbackURL = callbackURL {
                    continuation.resume(returning: callbackURL)
                } else {
                    continuation.resume(throwing: NSError(domain: "AuthService", code: -2, userInfo: [NSLocalizedDescriptionKey: "No callback received"]))
                }
            }
            session.presentationContextProvider = self
            session.start()
        }

        // Extract code from callback
        guard let code = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?
            .queryItems?.first(where: { $0.name == "code" })?.value else {
            throw NSError(domain: "AuthService", code: -3, userInfo: [NSLocalizedDescriptionKey: "Authorization code missing"])
        }

        // Exchange code for token
        try await exchangeCodeForToken(code: code, verifier: verifier, tokenEndpoint: tokenEndpoint, clientId: clientId, redirectUri: redirectUri)
    }

    private func exchangeCodeForToken(code: String, verifier: String, tokenEndpoint: URL, clientId: String, redirectUri: URL) async throws {
        var request = URLRequest(url: tokenEndpoint)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        let bodyParams = [
            "grant_type": "authorization_code",
            "client_id": clientId,
            "code": code,
            "code_verifier": verifier,
            "redirect_uri": redirectUri.absoluteString
        ]
        request.httpBody = bodyParams.map { "\($0.key)=\($0.value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")" }.joined(separator: "&").data(using: .utf8)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw NSError(domain: "AuthService", code: -4, userInfo: [NSLocalizedDescriptionKey: "Token exchange failed"])
        }

        if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
           let accessToken = json["access_token"] as? String {
            saveToKeychain(key: tokenKey, value: accessToken)
            let userId = (json["user_id"] as? String) ?? "usr_ios_01"
            saveToKeychain(key: userIdKey, value: userId)
            self.currentUserId = userId
            self.isAuthenticated = true
        }
    }

    public func signOut() {
        deleteFromKeychain(key: tokenKey)
        deleteFromKeychain(key: refreshTokenKey)
        deleteFromKeychain(key: userIdKey)
        self.isAuthenticated = false
        self.currentUserId = nil
    }

    // MARK: - PKCE Helpers
    private func generateCodeVerifier() -> String {
        var buffer = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, buffer.count, &buffer)
        return Data(buffer).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private func generateCodeChallenge(from verifier: String) -> String {
        guard let data = verifier.data(using: .utf8) else { return "" }
        let hashed = SHA256.hash(data: data)
        return Data(hashed).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    // MARK: - Keychain Helpers
    private func saveToKeychain(key: String, value: String) {
        guard let data = value.data(using: .utf8) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }

    public func getAccessToken() -> String? {
        getFromKeychain(key: tokenKey)
    }

    private func getFromKeychain(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecSuccess, let data = item as? Data {
            return String(data: data, encoding: .utf8)
        }
        return nil
    }

    private func deleteFromKeychain(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }

    // MARK: - ASWebAuthenticationPresentationContextProviding
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        ASPresentationAnchor()
    }
}
