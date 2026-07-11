import type { ImagePickerAsset } from 'expo-image-picker';
import api from './api';

// Photo client plumbing (plans/images-ideal-shape.md steps 1-2, mobile half):
// ticket (our API) → direct multipart upload to Cloudinary (plain fetch —
// the signed ticket carries everything; NO client SDK) → confirm. For UGC
// photos "confirm" is server-push (Cloudinary webhooks settle the row;
// the reconciliation cron sweeps stragglers), so the client-side confirm
// step is a READ of the row's truth (GET /photos/:photoId). Avatars have
// no row to sweep, so they get an explicit pull-based POST /photos/avatar-confirm.

// ─── server DTO mirrors (apps/api/src/modules/photos) ───────────────────────

export type PhotoStatus = 'pending' | 'live' | 'hidden' | 'removed';

export type PhotoEventType = 'impression' | 'tap';

/** Ready-made delivery URLs — the server builds EVERY URL (clients never
 *  hand-roll Cloudinary transforms). */
export interface PhotoUrls {
  thumb: string;
  card: string;
  gallery: string;
  full: string;
}

export interface PhotoDto {
  photoId: string;
  userId: string;
  restaurantId: string;
  connectionId: string | null;
  status: PhotoStatus;
  caption: string | null;
  /** ISO strings over the wire. */
  takenAt: string | null;
  uploadedAt: string;
  urls: PhotoUrls;
}

/** The signed direct-upload ticket — field-for-field what the Cloudinary
 *  multipart POST needs (the signature covers public_id/preset/
 *  notification_url, so none of them can be altered client-side). */
export interface SignedUploadTicket {
  uploadUrl: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
  uploadPreset: string;
  notificationUrl?: string;
}

export interface UploadTicketContext {
  restaurantId: string;
  connectionId?: string;
  caption?: string;
  /** The "Other…" free-text dish name (demand signal; never creates entities). */
  pendingDishName?: string;
  /** Capture time from the picker's EXIF, ISO string — read on-device BEFORE
   *  upload (the stored original is metadata-stripped for privacy). */
  takenAt?: string;
}

export interface PhotoStripItemDto {
  photoId: string;
  userId: string;
  connectionId: string | null;
  caption: string | null;
  takenAt: string | null;
  uploadedAt: string;
  urls: PhotoUrls;
}

export interface RestaurantGalleryDto {
  restaurantId: string;
  totalCount: number;
  /** "All photos" — newest first, paged. */
  all: PhotoStripItemDto[];
  /** Per-dish sections (only dishes that HAVE photos). */
  byDish: Array<{ connectionId: string; photos: PhotoStripItemDto[] }>;
}

export interface FoodLogGroupDto {
  restaurantId: string;
  restaurantName: string;
  photos: PhotoStripItemDto[];
}

export type AvatarConfirmStatus = 'approved' | 'rejected' | 'pending' | 'missing';

// ─── typed failure surface ───────────────────────────────────────────────────

export type PhotoUploadStage = 'ticket' | 'upload' | 'confirm';

/** One typed error for the whole ticket→upload→confirm dance so callers can
 *  tell WHERE it broke (ticket/confirm = our API, upload = Cloudinary). */
export class PhotoUploadError extends Error {
  readonly stage: PhotoUploadStage;
  readonly cause?: unknown;

  constructor(stage: PhotoUploadStage, message: string, cause?: unknown) {
    super(message);
    this.name = 'PhotoUploadError';
    this.stage = stage;
    this.cause = cause;
  }
}

// ─── EXIF capture time (client-supplied at ticket time) ─────────────────────

// EXIF DateTimeOriginal is "YYYY:MM:DD HH:MM:SS" (colons in the date part).
const EXIF_DATETIME = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}:\d{2}:\d{2})/;

/** Read the capture time from a picker asset's EXIF as an ISO string, or
 *  undefined when absent/unparseable. The server can't extract this itself —
 *  the incoming transform strips ALL metadata from the stored original. */
export const takenAtFromAsset = (asset: ImagePickerAsset): string | undefined => {
  const exif = asset.exif as Record<string, unknown> | null | undefined;
  const raw = exif?.DateTimeOriginal ?? exif?.DateTimeDigitized ?? exif?.DateTime;
  if (typeof raw !== 'string') {
    return undefined;
  }
  const match = raw.match(EXIF_DATETIME);
  if (!match) {
    return undefined;
  }
  const parsed = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

// ─── the Cloudinary leg (plain fetch — different host than our axios client) ─

const uploadToCloudinary = async (
  ticket: SignedUploadTicket,
  asset: Pick<ImagePickerAsset, 'uri' | 'mimeType' | 'fileName'>
): Promise<Record<string, unknown>> => {
  const form = new FormData();
  // RN FormData file part: { uri, type, name }.
  form.append('file', {
    uri: asset.uri,
    type: asset.mimeType ?? 'image/jpeg',
    name: asset.fileName ?? 'photo.jpg',
  } as unknown as Blob);
  form.append('api_key', ticket.apiKey);
  form.append('timestamp', String(ticket.timestamp));
  form.append('signature', ticket.signature);
  form.append('public_id', ticket.publicId);
  form.append('upload_preset', ticket.uploadPreset);
  if (ticket.notificationUrl) {
    form.append('notification_url', ticket.notificationUrl);
  }

  let response: Response;
  try {
    response = await fetch(ticket.uploadUrl, { method: 'POST', body: form });
  } catch (error) {
    throw new PhotoUploadError('upload', 'Photo upload failed to reach storage', error);
  }
  if (!response.ok) {
    let detail = '';
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      detail = body?.error?.message ?? '';
    } catch {
      // non-JSON error body — the status code is the story
    }
    throw new PhotoUploadError(
      'upload',
      `Photo upload rejected (${response.status})${detail ? `: ${detail}` : ''}`
    );
  }
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch (error) {
    throw new PhotoUploadError('upload', 'Photo upload returned an unreadable response', error);
  }
};

// ─── service ─────────────────────────────────────────────────────────────────

export const photosService = {
  /** Step 1: mint the pending row + signed direct-upload ticket. */
  async requestUploadTicket(
    context: UploadTicketContext
  ): Promise<{ photo: PhotoDto; ticket: SignedUploadTicket }> {
    try {
      const response = await api.post<{ photo: PhotoDto; ticket: SignedUploadTicket }>(
        '/photos/upload-ticket',
        context
      );
      return response.data;
    } catch (error) {
      throw new PhotoUploadError('ticket', 'Could not start the photo upload', error);
    }
  },

  /** Step 3: read the row's server truth after the direct upload. The actual
   *  pending→live settle is webhook-driven server-side; this read is how the
   *  client learns the current status (owner sees their own pending photo). */
  async confirm(photoId: string): Promise<PhotoDto> {
    try {
      const response = await api.get<PhotoDto>(`/photos/${photoId}`);
      return response.data;
    } catch (error) {
      throw new PhotoUploadError('confirm', 'Uploaded, but could not read the photo back', error);
    }
  },

  /** The whole dance as one call: ticket → direct multipart upload → confirm.
   *  Throws PhotoUploadError with the failing stage. (User-cancel never
   *  reaches here — the picker returns `canceled` before there is an asset.) */
  async uploadPhoto(
    asset: ImagePickerAsset,
    context: Omit<UploadTicketContext, 'takenAt'>
  ): Promise<PhotoDto> {
    const { photo, ticket } = await this.requestUploadTicket({
      ...context,
      takenAt: takenAtFromAsset(asset),
    });
    await uploadToCloudinary(ticket, asset);
    return this.confirm(photo.photoId);
  },

  /** Avatar change — same signed-direct-upload machinery, no Photo row. */
  async requestAvatarTicket(): Promise<SignedUploadTicket> {
    const response = await api.post<{ ticket: SignedUploadTicket }>('/photos/avatar-ticket');
    return response.data.ticket;
  },

  /** Pull-based avatar settle: the server reads Cloudinary's own truth and
   *  flips user.avatarUrl on approval (old avatar stays until then). */
  async confirmAvatar(): Promise<{ status: AvatarConfirmStatus }> {
    const response = await api.post<{ status: AvatarConfirmStatus }>('/photos/avatar-confirm');
    return response.data;
  },

  /** Ticket → upload → confirm for the avatar, as one call. */
  async uploadAvatar(asset: ImagePickerAsset): Promise<{ status: AvatarConfirmStatus }> {
    let ticket: SignedUploadTicket;
    try {
      ticket = await this.requestAvatarTicket();
    } catch (error) {
      throw new PhotoUploadError('ticket', 'Could not start the avatar upload', error);
    }
    await uploadToCloudinary(ticket, asset);
    try {
      return await this.confirmAvatar();
    } catch (error) {
      throw new PhotoUploadError('confirm', 'Uploaded, but could not confirm the avatar', error);
    }
  },

  async getPhoto(photoId: string): Promise<PhotoDto> {
    const response = await api.get<PhotoDto>(`/photos/${photoId}`);
    return response.data;
  },

  async deletePhoto(photoId: string): Promise<{ deleted: true }> {
    const response = await api.delete<{ deleted: true }>(`/photos/${photoId}`);
    return response.data;
  },

  async reportPhoto(photoId: string): Promise<{ hidden: boolean }> {
    const response = await api.post<{ hidden: boolean }>(`/photos/${photoId}/report`);
    return response.data;
  },

  async getRestaurantGallery(restaurantId: string): Promise<RestaurantGalleryDto> {
    const response = await api.get<RestaurantGalleryDto>(
      `/photos/restaurants/${restaurantId}/gallery`
    );
    return response.data;
  },

  async getUserFoodLog(userId: string): Promise<FoodLogGroupDto[]> {
    const response = await api.get<FoodLogGroupDto[]>(`/photos/users/${userId}/food-log`);
    return response.data ?? [];
  },

  /** Batched impression/tap emission (max 200 per call server-side). */
  async recordEvents(
    events: Array<{ photoId: string; eventType: PhotoEventType; count?: number }>
  ): Promise<void> {
    if (events.length === 0) {
      return;
    }
    await api.post('/photos/events', { events });
  },
};
