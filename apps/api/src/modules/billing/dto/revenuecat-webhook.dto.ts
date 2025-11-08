export interface RevenueCatWebhookDto {
  event?: {
    id?: string;
    type?: string;
    app_user_id?: string;
    original_app_user_id?: string;
    product_id?: string;
    entitlement_id?: string;
    original_transaction_id?: string;
    transaction_id?: string;
    expiration_at_ms?: number;
    event_timestamp_ms?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
