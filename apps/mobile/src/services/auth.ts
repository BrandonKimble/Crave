import api from './api';

export interface NativeAppleSignInPayload {
  identityToken: string;
  authorizationCode: string;
  email?: string;
  givenName?: string;
  familyName?: string;
}

export interface NativeAppleSignInResponse {
  sessionId: string;
  signInId: string;
}

export const authService = {
  async signInWithAppleNative(
    payload: NativeAppleSignInPayload
  ): Promise<NativeAppleSignInResponse> {
    const response = await api.post<NativeAppleSignInResponse>('/auth/apple/native', payload);
    return response.data;
  },
};
