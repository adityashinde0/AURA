/**
 * OAuth 2.0 PKCE authentication service for AURA.
 *
 * Uses expo-auth-session to drive the authorization code + PKCE flow against
 * the AURA identity provider (Cognito-compatible). The resulting access token
 * is stored exclusively in expo-secure-store — never written to disk or logs.
 */
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import { storeCredentials, clearCredentials } from '../services/AuraApiClient';

// Configure via Expo build environment.
const ISSUER = process.env.EXPO_PUBLIC_OAUTH_ISSUER ?? 'https://auth.aura.internal';
const CLIENT_ID = process.env.EXPO_PUBLIC_OAUTH_CLIENT_ID ?? 'aura-mobile-client';
const REDIRECT_URI = AuthSession.makeRedirectUri({ scheme: 'aura', path: 'auth' });

const SCOPES = ['openid', 'profile', 'email', 'aura:api'];

const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: `${ISSUER}/oauth2/authorize`,
  tokenEndpoint: `${ISSUER}/oauth2/token`,
  revocationEndpoint: `${ISSUER}/oauth2/revoke`,
};

function generateCodeVerifier(length = 64): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset[Math.floor(Math.random() * charset.length)];
  }
  return result;
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  // Base64url-encode (replace +→-, /→_, strip =)
  return digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface AuthResult {
  userId: string;
  accessToken: string;
  expiresAt: number;
}

type AuthListener = (authenticated: boolean) => void;
const authListeners = new Set<AuthListener>();

export function onAuthStateChanged(cb: AuthListener): () => void {
  authListeners.add(cb);
  return () => authListeners.delete(cb);
}

function notifyAuthState(authenticated: boolean): void {
  authListeners.forEach((cb) => cb(authenticated));
}

/**
 * Launch the PKCE authorization flow. Opens the system browser via expo-auth-session.
 * Returns the auth result on success. Throws on cancellation or error.
 */
export async function signIn(): Promise<AuthResult> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const request = new AuthSession.AuthRequest({
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    responseType: AuthSession.ResponseType.Code,
    scopes: SCOPES,
    codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
    codeChallenge,
    state: codeVerifier, // reused as state carrier; server validates PKCE separately
    extraParams: {},
    usePKCE: false, // manual PKCE above
  });

  const result = await request.promptAsync(discovery);

  if (result.type !== 'success') {
    throw new Error(`OAuth flow ${result.type}`);
  }

  const code = result.params.code;
  if (!code) {
    throw new Error('OAuth flow succeeded but code was not returned');
  }

  // Exchange code for tokens
  const tokenResult = await AuthSession.exchangeCodeAsync(
    {
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      code,
      extraParams: { code_verifier: codeVerifier },
    },
    discovery,
  );

  if (!tokenResult.accessToken) {
    throw new Error('Token exchange returned no access token');
  }

  // Extract sub claim from id_token (JWT) — no local signature verification needed;
  // the backend re-validates on every request. We only need the subject for local labeling.
  const userId = extractSubFromJwt(tokenResult.idToken ?? '') ?? tokenResult.accessToken.slice(0, 32);

  await storeCredentials(userId, tokenResult.accessToken);
  notifyAuthState(true);

  return {
    userId,
    accessToken: tokenResult.accessToken,
    expiresAt: tokenResult.issuedAt + (tokenResult.expiresIn ?? 3600),
  };
}

/**
 * Developer / Demo bypass mode.
 * Stores local credentials into SecureStore without requiring external OAuth servers.
 */
export async function demoSignIn(): Promise<AuthResult> {
  const userId = 'demo_developer_aura';
  const accessToken = 'demo_token_internal_offline';
  await storeCredentials(userId, accessToken);
  notifyAuthState(true);
  return {
    userId,
    accessToken,
    expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30,
  };
}

export async function signOut(): Promise<void> {
  await clearCredentials();
  notifyAuthState(false);
}

function extractSubFromJwt(jwt: string): string | null {
  try {
    const [, payload] = jwt.split('.');
    if (!payload) return null;
    const padded = payload + '=='.slice((payload.length + 2) % 4 === 0 ? 2 : (payload.length + 2) % 4);
    const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
    return typeof decoded.sub === 'string' ? decoded.sub : null;
  } catch {
    return null;
  }
}
