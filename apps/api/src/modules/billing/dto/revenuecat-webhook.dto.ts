export interface RevenueCatWebhookDto {
  event?: {
    id?: string;
    type?: string;
    app_user_id?: string;
    original_app_user_id?: string;
    product_id?: string;
    /** Legacy single-entitlement field; modern events send entitlement_ids. */
    entitlement_id?: string;
    entitlement_ids?: string[];
    original_transaction_id?: string;
    transaction_id?: string;
    purchased_at_ms?: number;
    expiration_at_ms?: number;
    event_timestamp_ms?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
